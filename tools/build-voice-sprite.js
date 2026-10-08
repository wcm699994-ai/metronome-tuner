// tools/build-voice-sprite.js
// Trims leading/trailing silence from the WAVs produced by tools/gen-voice.ps1,
// concatenates them into one 16 kHz mono sprite, and injects it into index.html
// as `const VOICE_SPRITE={...}` (base64 PCM + per-word sample offsets).
//
// Why a sprite with trimmed words: the metronome schedules voice samples on the
// Web Audio clock with start(when, offset, duration), so each word must begin at
// its first audible sample. Raw SAPI output carries 100-160 ms of leading silence
// (and ~750 ms of trailing silence), which would otherwise delay every count.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const WAV_DIR = path.join(__dirname, 'voice-wav');
const HTML_PATH = path.join(ROOT, 'index.html');
const SPRITE_WAV = path.join(__dirname, 'voice-sprite.wav');
const PLACEHOLDER = 'const VOICE_SPRITE=null;';

const RATE = 16000;
const THRESH = 0.004;                            // ~ -48 dBFS silence gate
const LEAD_KEEP = Math.round(RATE * 0.008);      // keep 8 ms so the attack is not clipped
const TAIL_KEEP = Math.round(RATE * 0.030);      // keep 30 ms natural decay
const GAP = Math.round(RATE * 0.030);            // silence between words in the sprite
const FADE = Math.round(RATE * 0.003);           // 3 ms fade to avoid clicks

function readWav(file) {
  const b = fs.readFileSync(file);
  if (b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WAVE') throw new Error('not a wav: ' + file);
  let off = 12, fmt = null, data = null;
  while (off + 8 <= b.length) {
    const id = b.toString('ascii', off, off + 4);
    const size = b.readUInt32LE(off + 4);
    const body = off + 8;
    if (id === 'fmt ') fmt = { channels: b.readUInt16LE(body + 2), rate: b.readUInt32LE(body + 4), bits: b.readUInt16LE(body + 14) };
    else if (id === 'data') data = b.subarray(body, body + size);
    off = body + size + (size % 2);
  }
  if (!fmt || !data) throw new Error('malformed wav: ' + file);
  if (fmt.channels !== 1 || fmt.bits !== 16) throw new Error('expected mono 16-bit: ' + file);
  if (fmt.rate !== RATE) throw new Error('expected ' + RATE + ' Hz: ' + file + ' (got ' + fmt.rate + ')');
  return new Int16Array(data.buffer, data.byteOffset, Math.floor(data.length / 2));
}

function trimSilence(s) {
  const gate = THRESH * 32767;
  let a = 0, b = s.length - 1;
  while (a < s.length && Math.abs(s[a]) <= gate) a++;
  while (b >= 0 && Math.abs(s[b]) <= gate) b--;
  if (a >= b) throw new Error('utterance is all silence');
  return s.subarray(Math.max(0, a - LEAD_KEEP), Math.min(s.length, b + TAIL_KEEP));
}

function applyFade(s) {
  const out = Int16Array.from(s);
  for (let i = 0; i < FADE && i < out.length; i++) {
    out[i] = Math.round(out[i] * (i / FADE));
    const k = out.length - 1 - i;
    out[k] = Math.round(out[k] * (i / FADE));
  }
  return out;
}

function writeWav(samples) {
  const buf = Buffer.alloc(44 + samples.length * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + samples.length * 2, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(RATE, 24);
  buf.writeUInt32LE(RATE * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) buf.writeInt16LE(samples[i], 44 + i * 2);
  return buf;
}

const LANG = { zh: 'zh', en: 'en' };
const words = {};
const chunks = [];
const report = [];
let cursor = 0;

for (const lang of Object.keys(LANG)) {
  words[lang] = [];
  for (let n = 1; n <= 12; n++) {
    const file = path.join(WAV_DIR, lang + '_' + n + '.wav');
    if (!fs.existsSync(file)) throw new Error('missing ' + file + ' - run tools/gen-voice.ps1 first');
    const raw = readWav(file);
    const cut = applyFade(trimSilence(raw));
    const offset = cursor;
    chunks.push(cut);
    cursor += cut.length;
    words[lang].push([offset, cut.length]);
    const gap = new Int16Array(GAP);
    chunks.push(gap);
    cursor += GAP;
    report.push('  ' + lang + ' ' + n + ': ' + (raw.length / RATE).toFixed(3) + 's -> ' +
      (cut.length / RATE).toFixed(3) + 's (trimmed ' + ((raw.length - cut.length) / RATE * 1000).toFixed(0) + ' ms silence)');
  }
}

const total = new Int16Array(cursor);
let at = 0;
for (const c of chunks) { total.set(c, at); at += c.length; }

const wav = writeWav(total);
fs.writeFileSync(SPRITE_WAV, wav);
const b64 = wav.toString('base64');

const html = fs.readFileSync(HTML_PATH, 'utf8');
const literal = 'const VOICE_SPRITE=' + JSON.stringify({ rate: RATE, data: b64, words: words }) + ';';
// Idempotent: replaces the placeholder on first injection, the existing literal on rebuilds.
const target = /const VOICE_SPRITE=[^;]*;/;
if (!html.includes(PLACEHOLDER) && !target.test(html)) throw new Error('VOICE_SPRITE placeholder not found in index.html');
fs.writeFileSync(HTML_PATH, html.replace(target, literal));

console.log(report.join('\n'));
console.log('sprite: ' + (total.length / RATE).toFixed(2) + 's audio, ' +
  (wav.length / 1024).toFixed(0) + ' KB wav -> ' + (b64.length / 1024).toFixed(0) + ' KB base64 embedded');
console.log('wrote ' + SPRITE_WAV + ' and injected VOICE_SPRITE into index.html');
