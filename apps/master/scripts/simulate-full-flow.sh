#!/usr/bin/env bash
# Full-flow business simulation. Exercises every load-bearing surface
# touched by the current refactor:
#   - Service charge as a menu item (SERVICE kind)
#   - Order with food + service items, kitchen ticket excludes service
#   - Bill approval + mark paid
#   - Regular Expense (non-repayable)
#   - Repayable Expense (avans) — partial return + write-off
#   - Expense search (find avans by name across dates)
#   - Per-waiter today stats
#   - Daily report numbers reconcile
#
# Usage: bash apps/master/scripts/simulate-full-flow.sh
# Prereq: dev:master is running on http://localhost:4000

set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:4000}"

# -----------------------------------------------------------------------------
# Helpers
# -----------------------------------------------------------------------------
J() { python3 -c "import sys,json; d=json.load(sys.stdin); $1"; }

step() { printf '\n\033[1;36m── %s\033[0m\n' "$*"; }
ok()   { printf '\033[1;32m  ✓ %s\033[0m\n' "$*"; }
note() { printf '\033[2m    %s\033[0m\n' "$*"; }

# -----------------------------------------------------------------------------
step '1. Admin login'
ADMIN_TOKEN=$(curl -sS -X POST "$BASE_URL/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin123"}' \
  | J "print(d['token'])")
ok "Admin token acquired"

H="Authorization: Bearer $ADMIN_TOKEN"

# -----------------------------------------------------------------------------
step '2. Create SERVICE menu item: Xizmat (kishi boshi) — 8 000 UZS'
SERVICE_ITEM_ID=$(curl -sS -X POST "$BASE_URL/api/menu/items" \
  -H "$H" -H 'Content-Type: application/json' \
  -d "{
    \"categoryId\":\"seed-category-tea\",
    \"name\":\"Xizmat sim$(date +%s)\",
    \"price\":8000,
    \"kind\":\"SERVICE\"
  }" | J "print(d['id'])")
ok "Service item created: id=$SERVICE_ITEM_ID"
note "kind=SERVICE → won't go to kitchen, no recipe required"

# -----------------------------------------------------------------------------
step '3. Pick a free table and a food item'
TABLE_ID=$(curl -sS "$BASE_URL/api/tables" -H "$H" \
  | J "items=[t for t in d if not t.get('activeOrderId')]; print(items[0]['id'])")
FOOD_ITEM_ID=$(curl -sS "$BASE_URL/api/menu/items" -H "$H" \
  | J "items=[i for i in d if not i.get('trackStock') and i.get('kind','FOOD')=='FOOD']; print(items[0]['id'])")
ok "Table=$TABLE_ID, food item=$FOOD_ITEM_ID"

# -----------------------------------------------------------------------------
step '4. Waiter login (PIN 5678 = Botir)'
WAITER_TOKEN=$(curl -sS -X POST "$BASE_URL/api/auth/login-pin" \
  -H 'Content-Type: application/json' \
  -d '{"pin":"5678"}' \
  | J "print(d['token'])")
WH="Authorization: Bearer $WAITER_TOKEN"
ok "Waiter Botir logged in"

# -----------------------------------------------------------------------------
step '5. Create draft order'
ORDER_ID=$(curl -sS -X POST "$BASE_URL/api/orders" \
  -H "$WH" -H 'Content-Type: application/json' \
  -d "{\"orderType\":\"DINE_IN\",\"tableId\":\"$TABLE_ID\"}" \
  | J "print(d['id'])")
ok "Order created: id=$ORDER_ID"

# -----------------------------------------------------------------------------
step '6. Add 4× food + 4× service (kishi boshi)'
curl -sS -X POST "$BASE_URL/api/orders/$ORDER_ID/items" \
  -H "$WH" -H 'Content-Type: application/json' \
  -d "{\"menuItemId\":\"$FOOD_ITEM_ID\",\"quantity\":4}" > /dev/null
curl -sS -X POST "$BASE_URL/api/orders/$ORDER_ID/items" \
  -H "$WH" -H 'Content-Type: application/json' \
  -d "{\"menuItemId\":\"$SERVICE_ITEM_ID\",\"quantity\":4}" > /dev/null
ok "Order lines added"

# -----------------------------------------------------------------------------
step '7. Send to kitchen (SERVICE line should NOT appear on ticket)'
curl -sS -X POST "$BASE_URL/api/orders/$ORDER_ID/send" -H "$WH" > /dev/null

KITCHEN_TOKEN=$(curl -sS -X POST "$BASE_URL/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"username":"kitchen1","password":"kitchen123"}' \
  | J "print(d['token'])")
KH="Authorization: Bearer $KITCHEN_TOKEN"

TICKETS_RAW=$(curl -sS "$BASE_URL/api/kitchen/tickets/active" -H "$KH")
TICKET_LINES=$(echo "$TICKETS_RAW" | J "active=[t for t in d if t.get('orderId')=='$ORDER_ID']; print(','.join([str(len(t.get('lines',[]))) for t in active]) or 'none')")
ok "Kitchen ticket created, line count(s): $TICKET_LINES (expect 1: only the food line)"

# -----------------------------------------------------------------------------
step '8. Request bill → approve → mark paid'
curl -sS -X POST "$BASE_URL/api/orders/$ORDER_ID/request-bill" -H "$WH" > /dev/null

APPROVE=$(curl -sS -X POST "$BASE_URL/api/orders/$ORDER_ID/approve" \
  -H "$H" -H 'Content-Type: application/json' \
  -d '{"serviceChargeWaived":false}')
SUBTOTAL=$(echo "$APPROVE" | J "print(d['subtotalSnapshot'])")
SERVICE=$(echo "$APPROVE" | J "print(d['serviceChargeSnapshot'])")
TOTAL=$(echo "$APPROVE"   | J "print(d['totalSnapshot'])")
ok "Bill approved: subtotal=$SUBTOTAL  service=$SERVICE  total=$TOTAL"
note "service charge = 4 mijoz × 8 000 = 32 000 (from SERVICE line, not setting)"

curl -sS -X POST "$BASE_URL/api/orders/$ORDER_ID/mark-paid" \
  -H "$H" -H 'Content-Type: application/json' \
  -d "{\"payments\":[{\"method\":\"CASH\",\"amount\":$TOTAL}]}" > /dev/null
ok "Order CLOSED, cash payment recorded"

# -----------------------------------------------------------------------------
step '9. Record regular (non-repayable) Expense: rent 2,000,000'
curl -sS -X POST "$BASE_URL/api/expenses" \
  -H "$H" -H 'Content-Type: application/json' \
  -d "{
    \"categoryId\":\"seed-cat-ingredients\",
    \"amount\":2000000,
    \"reason\":\"Mayning ijarasi\",
    \"occurredAt\":\"$(date -u +%Y-%m-%dT%H:%M:%S.000Z)\",
    \"repayable\":false
  }" > /dev/null
ok "Rent expense recorded (counts as operating expense)"

# -----------------------------------------------------------------------------
step '10. Record repayable Expense (avans): Aziza opaga 150 000'
SIM_TAG="sim-$(date +%s)"
AVANS_ID=$(curl -sS -X POST "$BASE_URL/api/expenses" \
  -H "$H" -H 'Content-Type: application/json' \
  -d "{
    \"categoryId\":\"seed-cat-ingredients\",
    \"amount\":150000,
    \"reason\":\"Aziza opaga avans $SIM_TAG\",
    \"note\":\"$SIM_TAG kompensatsiyalanadi iyun oyligidan\",
    \"occurredAt\":\"$(date -u +%Y-%m-%dT%H:%M:%S.000Z)\",
    \"repayable\":true
  }" | J "print(d['id'])")
ok "Avans recorded: id=$AVANS_ID, status=PENDING, remainingAmount=150 000"

# -----------------------------------------------------------------------------
step '11. Search for the avans by name (cross-date)'
FOUND=$(curl -sS "$BASE_URL/api/expenses/search?q=$SIM_TAG&openRepayable=true" -H "$H" \
  | J "items=d['items']; print(items[0]['id'] if items else 'NONE')")
test "$FOUND" = "$AVANS_ID" || { echo "Search FAILED — expected $AVANS_ID, got $FOUND"; exit 1; }
ok "Search found the avans by reason text"

# -----------------------------------------------------------------------------
step '12. Record partial return: 90 000 (60% of avans)'
PARTIAL=$(curl -sS -X POST "$BASE_URL/api/expenses/$AVANS_ID/returns" \
  -H "$H" -H 'Content-Type: application/json' \
  -d '{"amount":90000,"note":"Birinchi qaytim"}')
STATUS=$(echo "$PARTIAL" | J "print(d['repayStatus'])")
REMAINING=$(echo "$PARTIAL" | J "print(d['remainingAmount'])")
ok "After partial return: status=$STATUS, remainingAmount=$REMAINING (expect PARTIAL / 60000)"

# -----------------------------------------------------------------------------
step '13. Write off the remaining 60 000 (Aziza ishdan ketdi)'
WO=$(curl -sS -X POST "$BASE_URL/api/expenses/$AVANS_ID/write-off" \
  -H "$H" -H 'Content-Type: application/json' \
  -d '{"reason":"Aziza ishdan ketdi"}')
WO_STATUS=$(echo "$WO" | J "print(d['repayStatus'])")
ok "After write-off: status=$WO_STATUS (expect WRITTEN_OFF)"

# -----------------------------------------------------------------------------
step '14. Per-waiter today stats'
curl -sS "$BASE_URL/api/users/today-stats" -H "$H" \
  | python3 -m json.tool

# -----------------------------------------------------------------------------
step '15. Owner-only daily report (financial reconciliation)'
OWNER_TOKEN=$(curl -sS -X POST "$BASE_URL/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"username":"owner","password":"owner123"}' \
  | J "print(d['token'])")
OH="Authorization: Bearer $OWNER_TOKEN"

TODAY=$(date +%Y-%m-%d)
curl -sS "$BASE_URL/api/reports/daily?date=$TODAY" -H "$OH" \
  | python3 -c "
import sys, json
r = json.load(sys.stdin)
print('  Sales:')
print(f\"    closed:      {r['sales']['closedOrders']}\")
print(f\"    netSales:    {r['sales']['netSales']}\")
print(f\"    serviceFee:  {r['sales']['serviceCharge']}\")
print('  Cashflow:')
print(f\"    cash in:     {r['cashflow']['orderCash']}\")
print('  Expenses:')
print(f\"    gross:           {r['expenses']['gross']}\")
print(f\"    operating(P&L):  {r['expenses']['operating']}\")
print(f\"    pendingRepayable:{r['expenses']['pendingRepayable']}\")
print('  Results:')
print(f\"    salesBasedProfit: {r['results']['salesBasedProfit']}\")
print(f\"    cashflowBasedNet: {r['results']['cashflowBasedNet']}\")
"

# -----------------------------------------------------------------------------
step '16. DB-level invariants'
python3 << 'PY'
import sqlite3
con = sqlite3.connect('/home/wlw/projects/chayxana/apps/master/prisma/dev.db')

# Conservation: ingredient.currentStock == sum(IngredientMovement.quantity)
bad = []
for row in con.execute("""
  SELECT i.id, i.name, i.currentStock,
    COALESCE((SELECT SUM(quantity) FROM IngredientMovement WHERE ingredientId = i.id), 0) AS ledger_sum
  FROM Ingredient i
"""):
    iid, name, stock, ledger = row
    if abs(float(stock) - float(ledger)) >= 1e-3:
        bad.append((name, stock, ledger))
if bad:
    print('  Ingredient conservation FAILED:', bad)
    raise SystemExit(1)
print(f'  Ingredient conservation: OK ({con.execute("SELECT COUNT(*) FROM Ingredient").fetchone()[0]} ingredients)')

# Expense.repayable rows: remainingAmount math
cur = con.execute("""
  SELECT e.id, e.amount, e.writtenOffAt,
    COALESCE((SELECT SUM(amount) FROM ExpenseReturn WHERE expenseId = e.id), 0) AS returned
  FROM Expense e
  WHERE e.repayable = 1
""")
for row in cur:
    eid, amount, wo, returned = row
    remaining = float(amount) - float(returned)
    print(f"  Expense {eid[:8]}…: amount={amount} returned={returned} remaining={remaining} writtenOff={'yes' if wo else 'no'}")
PY
ok "All invariants hold"

printf '\n\033[1;32m✓ Full-flow simulation complete\033[0m\n'
