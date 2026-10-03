#!/bin/bash
D=$(cd "$(dirname "$0")" && pwd)
"$D/../node_modules/@embedded-postgres/linux-x64/native/bin/pg_ctl" -D "$D/data" stop
