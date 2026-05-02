$src = "$PSScriptRoot\..\cpp\receipt.cpp"
$outDir = "$PSScriptRoot\..\resources\bin"
$out = "$outDir\receipt.exe"

New-Item -Force -ItemType Directory -Path $outDir | Out-Null

$cl = Get-Command cl.exe -ErrorAction SilentlyContinue
if ($cl) {
  Write-Host "Using MSVC..."
  cl /EHsc /std:c++17 /O2 $src /link winspool.lib /OUT:$out
  exit $LASTEXITCODE
}

$gxx = Get-Command g++ -ErrorAction SilentlyContinue
if ($gxx) {
  Write-Host "Using MinGW g++..."
  g++ -std=c++17 -O2 $src -o $out -lwinspool
  exit $LASTEXITCODE
}

Write-Error "No C++ compiler found. Install MSVC Build Tools or MinGW."
exit 1
