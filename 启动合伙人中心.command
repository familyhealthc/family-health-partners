#!/bin/zsh
set -e
cd -- "$(dirname -- "$0")"
family_node="$(command -v node || true)"
if [[ -z "$family_node" && -x "$HOME/.nvm/versions/node/v24.14.0/bin/node" ]]; then
  family_node="$HOME/.nvm/versions/node/v24.14.0/bin/node"
fi
if [[ -z "$family_node" ]]; then
  print '请先安装 Node.js 24 或以上版本。'
  read '?按回车关闭。'
  exit 1
fi
if /usr/bin/curl --silent --max-time 1 http://127.0.0.1:4317/api/bootstrap | /usr/bin/grep -q 'Family Health Partner Center'; then
  /usr/bin/open http://127.0.0.1:4317
  exit 0
fi
(/bin/sleep 1; /usr/bin/open http://127.0.0.1:4317) &
exec "$family_node" --disable-warning=ExperimentalWarning server.mjs
