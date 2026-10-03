#!/bin/bash
# Roda todas as suítes do banco (cada uma cria o próprio banco do zero com as migrations e seeds do projeto).
D=$(cd "$(dirname "$0")" && pwd)
fail=0
for f in "$D"/*.test.js; do
  printf '%-22s ' "$(basename "$f" .test.js)"
  out=$(node "$f" 2>&1); code=$?
  echo "$out" | tail -1
  if [ $code -ne 0 ]; then fail=1; echo "$out" | grep -E 'FALHA|ERRO'; fi
done
exit $fail
