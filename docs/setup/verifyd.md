# mandat-verifyd под отделен потребител — чеклист за Симо (D-234)

Без това MCP присъдите са „съвет, без изолация“ (VERIFIED → UNKNOWN INFRA:same_uid). FAILED се показва и без него.

1. `sudo useradd --system --create-home --home-dir /var/lib/mandat-verify --shell /usr/sbin/nologin mandat` ; `sudo chmod 0700 /var/lib/mandat-verify`.
2. `sudo groupadd mandat-clients` ; `sudo usermod -aG mandat-clients <твоя потребител>` (агентът). Агентът НЕ е в групата `docker`.
3. Rootless Docker за `mandat` (docs.docker.com/engine/security/rootless): `sudo -iu mandat dockerd-rootless-setuptool.sh install`.
   После като `mandat`: `pnpm mandat images build` (образите са на неговия Docker).
4. Агентът трябва да чете репото си от `mandat`: група с право `r` (напр. `chgrp -R mandat-clients ~/shop && chmod -R g+rX ~/shop`).
5. systemd unit `/etc/systemd/system/mandat-verifyd.service`:
   ```ini
   [Service]
   User=mandat
   Group=mandat-clients
   RuntimeDirectory=mandat
   RuntimeDirectoryMode=0750
   ExecStart=/usr/bin/node /ABS/mandat/packages/mcp/dist/verifyd-main.js --allow /ABS/shop --remote file:///ABS/shop-remote.git --home /var/lib/mandat-verify --socket /run/mandat/verifyd.sock
   Environment=DOCKER_HOST=unix:///run/user/<uid на mandat>/docker.sock
   [Install]
   WantedBy=multi-user.target
   ```
   `sudo systemctl daemon-reload && sudo systemctl enable --now mandat-verifyd`.
6. Проверка от потребителя на агента: `id` (без docker), `docker info` → отказ; `ls /var/lib/mandat-verify` → отказ;
   `node scripts/mcp-call.mjs --server "node /ABS/mandat/packages/mcp/dist/main.js --allow /ABS/shop --remote file:///ABS/shop-remote.git" --tool mandat_status --job j_01JABCDEFGHJKMNPQRSTVWXYZ0` → `{"error":"unknown job"}` (отговорът идва от сокета).
