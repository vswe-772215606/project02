#!/usr/bin/env bash
# Runs the repo's existing smoke/simulate scripts against a fresh dev-seeded DB
# on a live headless server (:4020). Destructive smoke-cashflow-reversal gets
# its own throwaway DB. Prints one PASS/FAIL line per script.
set -u
cd /app/apps/master
D=/app/apps/master/e2e/.data
export DATABASE_URL="file:$D/server.db"
export BASE_URL="http://localhost:4020"
rm -f "$D/server.db" "$D/server.db-journal"
pnpm exec prisma migrate deploy >/dev/null 2>&1 || { echo "MIGRATE FAILED"; exit 1; }
pnpm exec tsx prisma/seed.ts > "$D/seed.log" 2>&1 || { echo "SEED FAILED"; tail -5 "$D/seed.log"; exit 1; }
pkill -f serve-headless 2>/dev/null; sleep 1
nohup pnpm exec tsx scripts/serve-headless.ts > "$D/server.log" 2>&1 &
for i in $(seq 1 60); do curl -sf "$BASE_URL/api/health" >/dev/null && break; sleep 1; done
curl -sf "$BASE_URL/api/health" >/dev/null || { echo "SERVER DID NOT START"; tail -20 "$D/server.log"; exit 1; }
run() {
  local name=$1; shift
  local log="$D/smoke-$name.log"
  if timeout 300 "$@" > "$log" 2>&1; then echo "PASS  $name"; else echo "FAIL  $name (exit $?)"; tail -6 "$log" | sed 's/^/        /'; fi
}
run smoke-stock-count            pnpm exec tsx scripts/smoke-stock-count.ts
run smoke-e2e-flow               pnpm exec tsx scripts/smoke-e2e-flow.ts
run smoke-finance-pnl            pnpm exec tsx scripts/smoke-finance-pnl.ts
run smoke-summary-report         pnpm exec tsx scripts/smoke-summary-report.ts
run smoke-prd13-parity           pnpm exec tsx scripts/smoke-prd13-parity.ts
run smoke-prd13-boundary         pnpm exec tsx scripts/smoke-prd13-boundary.ts
run smoke-prd13-clock-isolation  pnpm exec tsx scripts/smoke-prd13-clock-isolation.ts
run smoke-prd13-monthly-outstanding pnpm exec tsx scripts/smoke-prd13-monthly-outstanding.ts
run smoke-prd13-monthly-perf     pnpm exec tsx scripts/smoke-prd13-monthly-perf.ts
run smoke-prd13-telegram         pnpm exec tsx scripts/smoke-prd13-telegram.ts
run smoke-telegram-files         pnpm exec tsx scripts/smoke-telegram-files.ts
run simulate-confirm-flow        pnpm exec tsx scripts/simulate-confirm-flow.ts
run simulate-service-flow        pnpm exec tsx scripts/simulate-service-flow.ts
run simulate-debts-avans-flow    pnpm exec tsx scripts/simulate-debts-avans-flow.ts
# destructive: own throwaway DB, never server.db
( export DATABASE_URL="file:$D/cashflow-throwaway.db"; rm -f "$D/cashflow-throwaway.db"; pnpm exec prisma migrate deploy >/dev/null 2>&1
  run smoke-cashflow-reversal pnpm exec tsx scripts/smoke-cashflow-reversal.ts )
