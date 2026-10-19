#!/bin/bash
# macOS: bấm đúp file này để chạy game (lần đầu có thể phải chuột phải > Open).
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "Chưa cài Node.js. Tải bản LTS tại https://nodejs.org rồi chạy lại."
  open https://nodejs.org
  read -n 1 -s -r -p "Bấm phím bất kỳ để đóng..."
  exit 1
fi
node launcher/start.mjs
