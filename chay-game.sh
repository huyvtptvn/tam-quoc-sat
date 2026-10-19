#!/bin/bash
# Linux: chạy ./chay-game.sh
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "Chưa cài Node.js. Tải bản LTS tại https://nodejs.org rồi chạy lại."
  xdg-open https://nodejs.org 2>/dev/null
  read -n 1 -s -r -p "Bấm phím bất kỳ để đóng..."
  exit 1
fi
node launcher/start.mjs
