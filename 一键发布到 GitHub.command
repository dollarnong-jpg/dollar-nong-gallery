#!/bin/bash
# 双击：建仓库 + 推送 + 开启 Pages + 等上线，一次做完
cd "$(dirname "$0")/tools" || exit 1

if ! command -v python3 >/dev/null 2>&1; then
  echo "找不到 python3。请先在终端执行：xcode-select --install"
  echo "按回车关闭…"; read -r _; exit 1
fi

python3 onepush.py
STATUS=$?

echo
if [ $STATUS -eq 0 ]; then
  echo "完成后，以后更新作品只要打开管理台点「发布到线上」即可。"
else
  echo "上面有报错信息，可以截图发给我。"
fi
echo "按回车关闭这个窗口…"
read -r _
