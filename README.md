# 节拍器 · 调音器（纯前端单文件）

一个零依赖、单文件（`index.html`）的节拍器 + 调音器，所有音频合成、语音与测音都在浏览器本地完成，不联网、不上传任何数据。

## 功能

**节拍器**
- 常用拍号：2/4、3/4、4/4、5/4、6/4、7/4、3/8、5/8、7/8、6/8、9/8、12/8、2/2、3/2，另可自定义（分子 1–12 / 分母 2·4·8·16）；6/8、9/8、12/8 按复合拍处理（以附点四分音符为一大拍）
- 每拍细分 ×1–×4（八分、三连、十六分），点击圆点可逐拍设置 强拍/中拍/静音，自定义节奏型
- BPM 20–300（滑杆/数字/±），快捷键：空格 开始/停止
- 音色：电子哔声、木鱼、鼓组、牛铃、拍手、铃铛（全部为 Web Audio 实时合成），另有「仅人声」
- 人声读拍：**内置人声采样**（中文 / English 数字 1–12），由音频时钟采样级精确调度；BPM 超过 100 自动切换更短的快速读拍版本（词不会被下一拍截断），BPM ≥180 只报每小节第一拍

**调音器**
- 麦克风实时测音（自相关算法，低至约 34Hz，覆盖贝斯低音弦）
- 音名 + 八度、频率、音分偏差，±50 音分指针表盘，±5 音分内提示「已调准」
- A4 校准 415–466 Hz（巴洛克 415 / 标准 440 / 管弦 442），同时作用于检测与参考音
- 参考音：吉他、贝斯、尤克里里、小提琴标准定弦

## 使用

直接双击打开 `index.html` 即可（Chrome / Edge）。也可用任意静态服务器（如 `python -m http.server`）访问。调音器需要麦克风权限；`file://` 与 `https/localhost` 均可，HTTP 局域网地址下浏览器会拒绝麦克风。

## 人声读拍为什么不用 speechSynthesis

Web Speech API 没有调度能力（`speak()` 是入队而非定时），其状态与事件时刻在规范中未定义，`onend` 存在漏发问题，且输出无法被捕获为 PCM，因此不适合音乐级定时。本项目采用业界通行做法：**离线把数字合成为音频素材 → 内嵌进单文件 → 用 `AudioBufferSourceNode.start(when, offset, duration)` 在音频时钟上精确排程**，与打击音共用同一时间轴，实测排程时刻与拍点完全一致、无抖动无漂移。

语音素材由本机 Windows SAPI5 合成（中文 Microsoft Huihui / 英文 Microsoft Zira），生成脚本见下；脚本会裁掉 SAPI 输出中约 0.8–0.9 秒的首尾静音（不裁剪每个词会天生迟到约 150ms）。

## 重新生成语音素材（可选）

```powershell
# 1) 生成两套共 48 个 WAV（需要 Windows + 已安装对应语音包）
#    Rate 0 = 正常读拍（≤100 BPM 使用）；Rate 2 = 快速读拍（>100 BPM 使用，词更短）
powershell -ExecutionPolicy Bypass -File tools/gen-voice.ps1 -Rate 0 -OutDir tools/voice-wav
powershell -ExecutionPolicy Bypass -File tools/gen-voice.ps1 -Rate 2 -OutDir tools/voice-wav-fast
# 2) 裁剪静音、拼接两套 sprite 并注入 index.html（需要 Node.js）
node tools/build-voice-sprite.js
```

可调项：`tools/build-voice-sprite.js` 里的 `BPM_FAST`（两套素材的切换阈值，默认 >100）、`RATE`（采样率，8000 可让体积减半）、`THRESH`（静音门限）、`LEAD_KEEP`（保留起音余量，默认 8ms）；语速由 `tools/gen-voice.ps1 -Rate`（-10..10）决定。

## 文件结构

```
index.html                  单文件应用（含 base64 内嵌的两套语音 sprite，约 900KB）
tools/gen-voice.ps1         用 Windows SAPI5 生成数字语音 WAV（-Rate / -OutDir 可生成多套）
tools/build-voice-sprite.js 裁剪静音 → 拼接 sprite → 注入 index.html
```

`tools/voice-wav/`、`tools/voice-wav-fast/`（原始 WAV）与 `tools/voice-sprite*.wav`（调试用 sprite）为构建产物，已在 `.gitignore` 中忽略。

## 说明

- 语音素材由 Microsoft Windows SAPI5 语音引擎合成，若要在分发场景使用请自行确认相应许可；改动语速/采样率后重跑脚本即可替换。
- 调音器的听音与节拍器的所有音色均为浏览器本地合成，无第三方资源、无网络请求。
