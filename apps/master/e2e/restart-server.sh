#!/usr/bin/env bash
# Usage: restart-server.sh <dbname> [dev|prod|none]
# Fresh SQLite at e2e/.data/<dbname>.db, migrated, seeded, headless server on :4020.
set -u
cd /app/apps/master
D=/app/apps/master/e2e/.data
DB="$D/$1.db"; SEED="${2:-dev}"
export DATABASE_URL="file:$DB"
for p in $(pgrep -f "scripts/serve-headless.ts"); do kill "$p" 2>/dev/null; done
sleep 1
rm -f "$DB" "$DB-journal"
pnpm exec prisma migrate deploy >/dev/null 2>&1 || { echo "MIGRATE FAILED"; exit 1; }
case "$SEED" in
  dev)  pnpm exec tsx prisma/seed.ts > "$D/seed.log" 2>&1 || { echo "SEED FAILED"; exit 1; } ;;
  prod) pnpm exec tsx e2e/seed-like-prod-run.ts > "$D/seed.log" 2>&1 || { echo "SEED FAILED"; cat "$D/seed.log"; exit 1; } ;;
esac
nohup pnpm exec tsx scripts/serve-headless.ts > "$D/server-$1.log" 2>&1 &
for i in $(seq 1 60); do curl -sf http://localhost:4020/api/health >/dev/null && { echo "server up on :4020 db=$1 seed=$SEED"; exit 0; }; sleep 1; done
echo "SERVER DID NOT START"; tail -20 "$D/server-$1.log"; exit 1
