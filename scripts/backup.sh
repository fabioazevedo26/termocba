#!/usr/bin/env bash
# Gera uma cópia consistente do banco (VACUUM INTO) em ./data/backups e mantém os 30 mais recentes.
# Uso: ./scripts/backup.sh   (pode ser chamado de qualquer pasta; o contêiner precisa estar no ar)
set -euo pipefail
cd "$(dirname "$0")/.."

NOME="termocba-$(date +%Y%m%d-%H%M%S).sqlite"
docker compose exec -T termocba node -e "
  const fs = require('fs');
  const dir = '/app/data/backups';
  fs.mkdirSync(dir, { recursive: true });
  require('./src/db').exec(\"VACUUM INTO '\" + dir + '/${NOME}' + \"'\")
    .then(() => {
      const antigos = fs.readdirSync(dir).filter((f) => f.startsWith('termocba-')).sort().reverse().slice(30);
      antigos.forEach((f) => fs.unlinkSync(dir + '/' + f));
      process.exit(0);
    })
    .catch((e) => { console.error(e.message); process.exit(1); });
"
echo "Backup criado: data/backups/${NOME}"
