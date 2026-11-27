# build_apk.ps1 — One-shot builder for the Public Cinema Android WebView APK.
# Downloads a portable JDK 17, Gradle, and the Android SDK command-line tools,
# accepts the SDK licenses, then builds a debug APK. Re-runs are cached.
param(
    [string]$ToolsDir = (Join-Path $env:TEMP "kilo\android-build"),
    [string]$GradleVersion = "8.2"
)

$ErrorActionPreference = "Stop"
$ProjDir = Split-Path -Parent $MyInvocation.MyCommand.Path
New-Item -ItemType Directory -Force -Path $ToolsDir | Out-Null

function Get-Download {
    param([string]$Url, [string]$OutFile)
    if (Test-Path $OutFile) { return }
    Write-Host "Downloading $Url"
    & curl.exe -L -s -S --ssl-no-revoke --retry 4 --retry-delay 3 --retry-all-errors --connect-timeout 30 -o $OutFile $Url
    if ($LASTEXITCODE -ne 0) { throw "Download failed: $Url" }
}

# 1) Portable JDK 17 (Temurin)
$jdkRoot = Join-Path $ToolsDir "jdk"
if (-not (Test-Path $jdkRoot)) {
    Get-Download "https://api.adoptium.net/v3/binary/latest/17/ga/windows/x64/jdk/hotspot/normal/eclipse?project=jdk" (Join-Path $ToolsDir "jdk.zip")
    Expand-Archive -Path (Join-Path $ToolsDir "jdk.zip") -DestinationPath $jdkRoot -Force
}
$env:JAVA_HOME = (Get-ChildItem $jdkRoot -Directory | Select-Object -First 1).FullName
$env:Path = "$($env:JAVA_HOME)\bin;$env:Path"
Write-Host "JAVA_HOME = $env:JAVA_HOME"

# 2) Gradle
$gradleRoot = Join-Path $ToolsDir "gradle"
if (-not (Test-Path $gradleRoot)) {
    Get-Download "https://services.gradle.org/distributions/gradle-$GradleVersion-bin.zip" (Join-Path $ToolsDir "gradle.zip")
    Expand-Archive -Path (Join-Path $ToolsDir "gradle.zip") -DestinationPath $gradleRoot -Force
}
$GradleHome = (Get-ChildItem $gradleRoot -Directory | Select-Object -First 1).FullName
$Gradle = Join-Path $GradleHome "bin\gradle.bat"
Write-Host "Gradle = $Gradle"

# 3) Android SDK command-line tools
$sdk = Join-Path $ToolsDir "android-sdk"
$cmdline = Join-Path $sdk "cmdline-tools\latest"
if (-not (Test-Path $cmdline)) {
    Get-Download "https://dl.google.com/android/repository/commandlinetools-win-11076708_latest.zip" (Join-Path $ToolsDir "cmdline-tools.zip")
    $tmp = Join-Path $sdk "cmdline-tools\tmp"
    New-Item -ItemType Directory -Force -Path $tmp | Out-Null
    Expand-Archive -Path (Join-Path $ToolsDir "cmdline-tools.zip") -DestinationPath $tmp -Force
    New-Item -ItemType Directory -Force -Path $cmdline | Out-Null
    Copy-Item -Path (Join-Path $tmp "cmdline-tools\*") -Destination $cmdline -Recurse -Force
    Remove-Item $tmp -Recurse -Force
}
$env:ANDROID_HOME = $sdk
$env:ANDROID_SDK_ROOT = $sdk
$sdkmanager = Join-Path $cmdline "bin\sdkmanager.bat"
Write-Host "Android SDK = $sdk"

# 4) Accept licenses + install SDK packages
# Write the accepted-license hashes directly (non-interactive, reliable).
$licDir = Join-Path $sdk "licenses"
New-Item -ItemType Directory -Force -Path $licDir | Out-Null
Set-Content -Path (Join-Path $licDir "android-sdk-license") -Encoding ASCII -NoNewline -Value (
    "24333f8a63b6825ea9c5514f83c2829b004d1fee`n" +
    "8933bad161af4178b1185d1a37fbf41ea5269c55`n" +
    "d56f5187479451eabf01fb78af6dfcb131a6481e"
)
Set-Content -Path (Join-Path $licDir "android-sdk-preview-license") -Encoding ASCII -NoNewline -Value "84831b9409646a918e30573bab4c9c91346d8abd"
Write-Host "Installing SDK packages (platform-tools, android-34, build-tools;34.0.0)..."
& $sdkmanager --sdk_root=$sdk "platform-tools" "platforms;android-34" "build-tools;34.0.0"

# 5) local.properties for Gradle
$localProps = "sdk.dir=$($sdk -replace '\\','/')"
Set-Content -Path (Join-Path $ProjDir "local.properties") -Value $localProps -Encoding ASCII

# 6) Build the debug APK
Push-Location $ProjDir
try {
    & $Gradle assembleDebug --no-daemon --console=plain
    if ($LASTEXITCODE -ne 0) { throw "Gradle build failed." }
}
finally {
    Pop-Location
}

$apk = Get-ChildItem -Path (Join-Path $ProjDir "app\build\outputs\apk\debug") -Filter *.apk -Recurse |
    Select-Object -First 1
if ($apk) {
    Write-Host ""
    Write-Host "BUILD OK -> $($apk.FullName)"
} else {
    throw "Build finished but no APK was found."
}