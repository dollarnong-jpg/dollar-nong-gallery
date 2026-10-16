#!/bin/bash
# 双击启动摄影站管理台，并自动打开浏览器
cd "$(dirname "$0")/tools" || exit 1
PORT=8765

if lsof -nP -iTCP:$PORT -sTCP:LISTEN >/dev/null 2>&1; then
  echo "管理台已经在运行了，直接给你打开。"
  open "http://127.0.0.1:$PORT"
  echo "按回车关闭这个窗口…"; read -r _; exit 0
fi

( sleep 2; open "http://127.0.0.1:$PORT" ) &
echo "正在启动管理台…关闭这个窗口即可停止服务。"
exec python3 photosite.py serve
