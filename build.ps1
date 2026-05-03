#Requires -Version 5.1
<#
.SYNOPSIS
  Chayxana POS - Full Windows Build Script
  Builds: Master (Electron/NSIS), Kitchen (Electron/NSIS), Mobile (Android APK)

.PARAMETER MasterUrl
  The server URL embedded in the mobile APK.
  Default: http://192.168.1.50:4000

.PARAMETER SkipMobile
  Skip the Android APK build (useful when Android SDK is not installed).

.PARAMETER MobileOnly
  Build only the mobile APK.

.PARAMETER Portable
  Package Electron apps as portable .exe instead of NSIS installer.

.EXAMPLE
  .\build.ps1
  .\build.ps1 -MasterUrl "http://10.0.0.5:4000" -SkipMobile
  .\build.ps1 -MobileOnly
#>
param(
    [string]$MasterUrl = "http://192.168.1.50:4000",
    [switch]$SkipMobile,
    [switch]$MobileOnly,
    [switch]$Portable
)

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
function Step { param($msg) Write-Host "`n====  $msg" -ForegroundColor Cyan }
function OK   { param($msg) Write-Host "  OK  $msg"  -ForegroundColor Green }
function Warn { param($msg) Write-Host "  !!  $msg"  -ForegroundColor Yellow }
function Fail { param($msg) Write-Host "FAIL  $msg"  -ForegroundColor Red; exit 1 }

function Require-Command {
    param([string]$cmd, [string]$hint)
    if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
        Fail "$cmd not found. $hint"
    }
}

function Run {
    param([string[]]$cmd)
    & $cmd[0] $cmd[1..($cmd.Length - 1)]
    if ($LASTEXITCODE -ne 0) { Fail "Command failed: $($cmd -join ' ')" }
}

# ---------------------------------------------------------------------------
# 1. Prerequisites
# ---------------------------------------------------------------------------
Step "Checking prerequisites"

Require-Command "node" "Install Node.js 20+ from https://nodejs.org"
Require-Command "pnpm" "Run: npm install -g pnpm"

$nodeVer = (node --version)
$pnpmVer = (pnpm --version)
OK "Node  $nodeVer"
OK "pnpm  $pnpmVer"

# C++ compiler check (for printer binary)
$compiler = $null
$cl  = Get-Command "cl.exe" -ErrorAction SilentlyContinue
$gxx = Get-Command "g++"    -ErrorAction SilentlyContinue
if ($cl)       { $compiler = "msvc";  OK "C++   MSVC (cl.exe)" }
elseif ($gxx)  { $compiler = "mingw"; OK "C++   MinGW (g++)" }
else           { Warn "No C++ compiler found - printer binary will not be rebuilt (using existing receipt.exe if present)" }

if (-not $MobileOnly) {
    $py = Get-Command "python" -ErrorAction SilentlyContinue
    if (-not $py) { Warn "python not found - native module rebuild may fail" }
}

if ($MobileOnly -or (-not $SkipMobile)) {
    $java = Get-Command "java" -ErrorAction SilentlyContinue
    if (-not $java) { Warn "java not found - Android build requires JDK 17+" }
    if (-not $env:ANDROID_HOME -and -not $env:ANDROID_SDK_ROOT) {
        Warn "ANDROID_HOME not set - Android build requires Android SDK"
    }
}

# ---------------------------------------------------------------------------
# 2. Install dependencies
# ---------------------------------------------------------------------------
if (-not $MobileOnly) {
    Step "Installing dependencies (pnpm install)"
    Run @("pnpm", "install", "--frozen-lockfile")
    OK "Dependencies installed"
}

# ---------------------------------------------------------------------------
# 3. Printer C++ binary (fully static)
# ---------------------------------------------------------------------------
if (-not $MobileOnly) {
    Step "Building printer binary (static C++)"

    $printerScript = "$root\apps\master\scripts\build-printer.ps1"
    $printerExe    = "$root\apps\master\resources\bin\receipt.exe"

    if ($compiler) {
        & powershell -ExecutionPolicy Bypass -File $printerScript
        if ($LASTEXITCODE -ne 0) { Fail "Printer binary build failed" }
        OK "receipt.exe built at resources\bin\"
    }
    elseif (Test-Path $printerExe) {
        Warn "Skipping printer build - using existing $printerExe"
    }
    else {
        Fail "No C++ compiler and no pre-built receipt.exe found. Install MinGW-w64 or MSVC Build Tools."
    }
}

# ---------------------------------------------------------------------------
# 4. Master app (Electron - admin + server)
# ---------------------------------------------------------------------------
if (-not $MobileOnly) {
    Step "Building Master app"

    Push-Location "$root\apps\master"

    Write-Host "  -> prisma generate"
    Run @("pnpm", "exec", "prisma", "generate")
    OK "Prisma client generated"

    Write-Host "  -> electron-vite build"
    Run @("pnpm", "run", "build")
    OK "Master JS/TS compiled"

    if ($Portable) {
        Write-Host "  -> electron-builder (portable)"
        Run @("pnpm", "exec", "electron-builder", "--win", "portable", "--x64")
    }
    else {
        Write-Host "  -> electron-builder (NSIS installer)"
        Run @("pnpm", "exec", "electron-builder", "--win", "nsis", "--x64")
    }

    Pop-Location
    OK "Master installer -> apps\master\dist\"
}

# ---------------------------------------------------------------------------
# 5. Kitchen app (Electron - display screen)
# ---------------------------------------------------------------------------
if (-not $MobileOnly) {
    Step "Building Kitchen app"

    Push-Location "$root\apps\kitchen"

    Write-Host "  -> electron-vite build"
    Run @("pnpm", "run", "build")
    OK "Kitchen JS/TS compiled"

    if ($Portable) {
        Write-Host "  -> electron-builder (portable)"
        Run @("pnpm", "exec", "electron-builder", "--win", "portable", "--x64")
    }
    else {
        Write-Host "  -> electron-builder (NSIS installer)"
        Run @("pnpm", "exec", "electron-builder", "--win", "nsis", "--x64")
    }

    Pop-Location
    OK "Kitchen installer -> apps\kitchen\dist\"
}

# ---------------------------------------------------------------------------
# 6. Mobile app (Android APK)
# ---------------------------------------------------------------------------
if (-not $SkipMobile) {
    Step "Building Mobile app (Android APK)"

    Push-Location "$root\apps\mobile"

    # Patch MASTER_URL into app.json for this build
    $appJsonPath = ".\app.json"
    $appJson = Get-Content $appJsonPath -Raw | ConvertFrom-Json
    $appJson.expo.extra.MASTER_URL = $MasterUrl
    $appJson | ConvertTo-Json -Depth 10 | Set-Content $appJsonPath -Encoding UTF8
    OK "MASTER_URL set to $MasterUrl"

    $eas = Get-Command "eas" -ErrorAction SilentlyContinue

    if ($eas) {
        Write-Host "  -> eas build --platform android --local"
        Run @("eas", "build", "--platform", "android", "--local", "--non-interactive", "--output", ".\chayxana.apk")
        OK "APK -> apps\mobile\chayxana.apk"
    }
    else {
        Write-Host "  -> expo prebuild"
        Run @("npx", "expo", "prebuild", "--platform", "android", "--clean")

        Push-Location "android"
        Write-Host "  -> gradlew assembleRelease"

        if (Test-Path ".\gradlew.bat") {
            cmd /c gradlew.bat assembleRelease
        }
        else {
            & .\gradlew assembleRelease
        }
        if ($LASTEXITCODE -ne 0) {
            Pop-Location
            Pop-Location
            Fail "Gradle build failed"
        }
        Pop-Location

        $apkSrc = ".\android\app\build\outputs\apk\release\app-release.apk"
        if (Test-Path $apkSrc) {
            Copy-Item $apkSrc ".\chayxana.apk" -Force
            OK "APK -> apps\mobile\chayxana.apk"
        }
        else {
            $apkDebug = ".\android\app\build\outputs\apk\debug\app-debug.apk"
            if (Test-Path $apkDebug) {
                Copy-Item $apkDebug ".\chayxana.apk" -Force
                Warn "Release APK not found - copied debug build to apps\mobile\chayxana.apk"
            }
        }
    }

    Pop-Location
}

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
Step "Build complete"
if (-not $MobileOnly) {
    Write-Host "  Master  : apps\master\dist\Chayxana Master Setup*.exe"  -ForegroundColor Green
    Write-Host "  Kitchen : apps\kitchen\dist\Chayxana Kitchen Setup*.exe" -ForegroundColor Green
}
if (-not $SkipMobile) {
    Write-Host "  Mobile  : apps\mobile\chayxana.apk" -ForegroundColor Green
}
