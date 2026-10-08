# tools/gen-voice.ps1
# Generates 24 counting-voice WAV files (zh 1-12, en 1-12) with Windows SAPI5 voices.
# ASCII-only on purpose: Windows PowerShell 5.1 reads .ps1 as ANSI when there is no BOM,
# so Chinese characters are built from Unicode code points instead of literals.
param([string]$OutDir = (Join-Path $PSScriptRoot 'voice-wav'))

Add-Type -AssemblyName System.Speech
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$fmt = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(
    16000,
    [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen,
    [System.Speech.AudioFormat.AudioChannel]::Mono)

# 1..12 in Chinese: yi er san si wu liu qi ba jiu shi shi-yi shi-er
$cn = @(0x4E00, 0x4E8C, 0x4E09, 0x56DB, 0x4E94, 0x516D, 0x4E03, 0x516B, 0x4E5D, 0x5341)
$zh = @()
foreach ($cp in $cn) { $zh += [string][char]$cp }
$zh += [string]([char]0x5341 + [char]0x4E00)
$zh += [string]([char]0x5341 + [char]0x4E8C)

$en = @('one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve')

$synth.Rate = 0
$synth.SelectVoice('Microsoft Huihui Desktop')
for ($i = 0; $i -lt 12; $i++) {
    $path = Join-Path $OutDir ('zh_{0}.wav' -f ($i + 1))
    $synth.SetOutputToWaveFile($path, $fmt)
    $synth.Speak($zh[$i])
}

$synth.SelectVoice('Microsoft Zira Desktop')
for ($i = 0; $i -lt 12; $i++) {
    $path = Join-Path $OutDir ('en_{0}.wav' -f ($i + 1))
    $synth.SetOutputToWaveFile($path, $fmt)
    $synth.Speak($en[$i])
}

# Docs require re-configuring the output to release the file handle.
$synth.SetOutputToNull()
$synth.Dispose()

$made = (Get-ChildItem $OutDir -Filter *.wav).Count
Write-Output ("generated {0} wav files in {1}" -f $made, $OutDir)
