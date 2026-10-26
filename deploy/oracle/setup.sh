#!/usr/bin/env bash
# Prepara uma VM Ubuntu (Oracle Cloud Always Free, ARM ou x86) e sobe o Pipa Combate.
# Uso, na VM:  git clone https://github.com/Mtz08/PipaCombate.git && cd PipaCombate/deploy/oracle && bash setup.sh
set -euo pipefail
cd "$(dirname "$0")"

echo "==> Docker"
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sudo sh
  sudo usermod -aG docker "$USER"
fi

echo "==> Firewall da VM (as imagens Ubuntu da Oracle bloqueiam 80/443 no iptables)"
for p in 80 443; do
  sudo iptables -C INPUT -p tcp --dport "$p" -j ACCEPT 2>/dev/null || sudo iptables -I INPUT 6 -p tcp --dport "$p" -j ACCEPT
done
sudo apt-get install -y -q iptables-persistent >/dev/null 2>&1 || true
sudo netfilter-persistent save >/dev/null 2>&1 || true

echo "==> .env"
if [ ! -f .env ]; then
  cp .env.example .env
  gen() { openssl rand -base64 48 | tr -d '/+=\n' | cut -c1-48; }
  sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(gen)|; s|^SESSION_SECRET=.*|SESSION_SECRET=$(gen)|; s|^PAYMENTS_WEBHOOK_SECRET=.*|PAYMENTS_WEBHOOK_SECRET=$(gen)|" .env
  IP=$(curl -fsS https://ifconfig.me || true)
  [ -n "$IP" ] && sed -i "s|^DOMAIN=$|DOMAIN=${IP//./-}.sslip.io|" .env
  chmod 600 .env
  echo "   .env criado. Revise DOMAIN e ADMIN_PHONES:  nano .env"
fi

echo "==> Backup diario do banco (03:00, guarda 14 dias em ~/backups)"
mkdir -p ~/backups
CRON="0 3 * * * cd $(pwd) && docker compose exec -T db pg_dump -U pipacombate pipacombate | gzip > ~/backups/pipacombate-\$(date +\%F).sql.gz && find ~/backups -name '*.sql.gz' -mtime +14 -delete"
( crontab -l 2>/dev/null | grep -v pipacombate-; echo "$CRON" ) | crontab -

echo "==> Subindo (pode levar alguns minutos no primeiro build)"
sudo docker compose up -d --build
sudo docker compose ps
echo "Pronto: https://$(grep ^DOMAIN= .env | cut -d= -f2)"
