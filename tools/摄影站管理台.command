#!/bin/bash
# 双击启动摄影站管理台，并自动打开浏览器
cd "$(dirname "$0")" || exit 1
PORT=8765

# 端口被占用时先提示
if lsof -nP -iTCP:$PORT -sTCP:LISTEN >/dev/null 2>&1; then
  echo "端口 $PORT 已被占用，可能管理台已经在运行了。"
  open "http://127.0.0.1:$PORT"
  exit 0
fi

( sleep 2; open "http://127.0.0.1:$PORT" ) &
echo "正在启动管理台…关闭这个窗口即可停止服务。"
exec python3 photosite.py serve
