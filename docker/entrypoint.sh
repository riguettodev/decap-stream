#!/bin/bash
set -e

# Garante estrutura de dados persistente
mkdir -p /app/data/streams
mkdir -p /app/data/logs

# Restaura streams que existiam antes de um restart
# O supervisord já vai incluir os stream.conf via [include]
# Garante que os scripts têm permissão de execução
find /app/data/streams -name "*.sh" -exec chmod +x {} \;

exec /usr/bin/supervisord -c /etc/supervisor/supervisord.conf