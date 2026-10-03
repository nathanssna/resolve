#!/bin/bash
# Sobe um Postgres 17 local (porta 54999) só para os testes. Na primeira vez, cria o diretório de dados.
set -e
D=$(cd "$(dirname "$0")" && pwd)
BIN="$D/../node_modules/@embedded-postgres/linux-x64/native/bin"
[ -x "$BIN/pg_ctl" ] || { echo "Rode 'npm install' em tests/ antes."; exit 1; }
[ -d "$D/data" ] || "$BIN/initdb" -D "$D/data" -U postgres --auth=trust -E UTF8 --locale=C >/dev/null
"$BIN/pg_ctl" -D "$D/data" -o "-p 54999 -c wal_level=logical" -l "$D/pg.log" -w start
