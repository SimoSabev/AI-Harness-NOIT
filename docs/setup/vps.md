# VPS за онлайн варианта (деплойва Симо; демо промпт т. 9.8)

1. Ubuntu 24.04, потребител `mandat` с rootless Docker (`dockerd-rootless-setuptool.sh install`); сокетът е
   `/run/user/<uid>/docker.sock` → `MANDAT_ROOTLESS_DOCKER_SOCK`.
2. `ufw default deny incoming && ufw allow 22 && ufw allow 443 && ufw enable`; проверка `ss -ltn` → само {22, 443}.
3. Образи: `pnpm mandat images build` на VPS-а (не се публикуват). `MANDAT_LLM_PROXY_IMAGE=<таг от images build>`.
4. `cd deploy && MANDAT_DOMAIN=… MANDAT_DB_URL=… ANTHROPIC_API_KEY=… docker compose -f docker-compose.core.yml up -d`
   (ключовете само в този терминал). Само caddy слуша на 443; worker и llm-proxy са във вътрешната мрежа (S19).
5. GitHub App webhook URL: `https://<MANDAT_DOMAIN>/api/webhooks/github` (docs/setup/github-apps.md).
