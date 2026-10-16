#!/bin/bash
# 双击只看网站本身（不开管理台）
cd "$(dirname "$0")/web" || exit 1
PORT=8000
( sleep 1.5; open "http://127.0.0.1:$PORT" ) &
echo "网站预览：http://127.0.0.1:$PORT   （按 Ctrl+C 停止）"
exec python3 -m http.server "$PORT" --bind 127.0.0.1
