#Requires -Version 5.1
# Builds receipt.exe from cpp/receipt.cpp with fully static linking.
# No MSVC/MinGW runtime DLLs will be required at runtime.

$src    = "$PSScriptRoot\..\cpp\receipt.cpp"
$outDir = "$PSScriptRoot\..\resources\bin"
$out    = "$outDir\receipt.exe"

New-Item -Force -ItemType Directory -Path $outDir | Out-Null

# Prefer MSVC if available (Visual Studio / Build Tools)
$cl = Get-Command cl.exe -ErrorAction SilentlyContinue
if ($cl) {
    Write-Host "Using MSVC cl.exe (static CRT /MT)..."
    # /MT links CRT statically — no VCRUNTIME140.dll needed at runtime
    cl.exe /EHsc /std:c++17 /O2 /MT "$src" /link winspool.lib /OUT:"$out"
    if ($LASTEXITCODE -ne 0) { Write-Error "MSVC build failed"; exit $LASTEXITCODE }
    Write-Host "Built (MSVC, static): $out"
    exit 0
}

# Fall back to MinGW g++
$gxx = Get-Command g++ -ErrorAction SilentlyContinue
if ($gxx) {
    Write-Host "Using MinGW g++ (fully static)..."
    # -static            links all libraries statically
    # -static-libgcc     no libgcc_s_seh-1.dll at runtime
    # -static-libstdc++  no libstdc++-6.dll at runtime
    # -lwinspool must come AFTER source file (MinGW linker order)
    g++ -std=c++17 -O2 -static -static-libgcc -static-libstdc++ "$src" -o "$out" -lwinspool
    if ($LASTEXITCODE -ne 0) { Write-Error "MinGW build failed"; exit $LASTEXITCODE }
    Write-Host "Built (MinGW, static): $out"
    exit 0
}

Write-Error @"
No C++ compiler found. Install one of:
  MSVC Build Tools : https://aka.ms/vs/17/release/vs_BuildTools.exe
  MinGW-w64 (MSYS2): https://www.msys2.org  then run:
                     pacman -S mingw-w64-x86_64-gcc
"@
exit 1
