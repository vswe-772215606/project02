#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
app_dir="$(cd "$script_dir/.." && pwd)"
src="$app_dir/cpp/receipt.cpp"
out_dir="$app_dir/resources/bin"
out="$out_dir/receipt.exe"

mkdir -p "$out_dir"

x86_64-w64-mingw32-g++ -std=c++17 -O2 -static -static-libgcc -static-libstdc++ \
  "$src" -o "$out" -lwinspool

echo "Built $out"
