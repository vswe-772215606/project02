#!/usr/bin/env bash
set -euo pipefail

# PowerShell equivalent: use Invoke-RestMethod with the same endpoints and save
# the returned .token fields into variables before repeating the curl flow below.

BASE_URL="${BASE_URL:-http://localhost:4000}"

json_field() {
  local field="$1"
  python3 -c "import json,sys; print(json.load(sys.stdin)$field)"
}

assert_no_error() {
  python3 -c "import json,sys; data=json.load(sys.stdin); err=data.get('error'); 
if err: raise SystemExit(f\"API error: {err}\")"
}

echo 'Admin login...'
ADMIN_LOGIN=$(curl -sS -X POST "$BASE_URL/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin123"}')
printf '%s' "$ADMIN_LOGIN" | assert_no_error
ADMIN_TOKEN=$(printf '%s' "$ADMIN_LOGIN" | json_field "['token']")

echo 'Load menu...'
curl -sS "$BASE_URL/api/menu" -H "Authorization: Bearer $ADMIN_TOKEN" >/tmp/api-smoke-menu.json

TABLE_ID=$(curl -sS "$BASE_URL/api/tables" -H "Authorization: Bearer $ADMIN_TOKEN" | python3 -c "import json,sys; data=json.load(sys.stdin); free=[table for table in data if not table.get('activeOrderId')]; print(free[0]['id'])")
ITEM_IDS=$(curl -sS "$BASE_URL/api/menu/items" -H "Authorization: Bearer $ADMIN_TOKEN" | python3 -c "import json,sys; data=json.load(sys.stdin); 
non_tracked=[item for item in data if not item['trackStock']][:2];
print(non_tracked[0]['id']); print(non_tracked[1]['id'])")
ITEM1_ID=$(printf '%s\n' "$ITEM_IDS" | sed -n '1p')
ITEM2_ID=$(printf '%s\n' "$ITEM_IDS" | sed -n '2p')

echo 'Waiter PIN login...'
WAITER_LOGIN=$(curl -sS -X POST "$BASE_URL/api/auth/login-pin" \
  -H 'Content-Type: application/json' \
  -d '{"pin":"5678"}')
printf '%s' "$WAITER_LOGIN" | assert_no_error
WAITER_TOKEN=$(printf '%s' "$WAITER_LOGIN" | json_field "['token']")

echo 'Create order...'
ORDER=$(curl -sS -X POST "$BASE_URL/api/orders" \
  -H "Authorization: Bearer $WAITER_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"orderType\":\"DINE_IN\",\"tableId\":\"$TABLE_ID\"}")
printf '%s' "$ORDER" | assert_no_error
ORDER_ID=$(printf '%s' "$ORDER" | json_field "['id']")

ADD1=$(curl -sS -X POST "$BASE_URL/api/orders/$ORDER_ID/items" \
  -H "Authorization: Bearer $WAITER_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"menuItemId\":\"$ITEM1_ID\",\"quantity\":1}")
printf '%s' "$ADD1" | assert_no_error

ADD2=$(curl -sS -X POST "$BASE_URL/api/orders/$ORDER_ID/items" \
  -H "Authorization: Bearer $WAITER_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"menuItemId\":\"$ITEM2_ID\",\"quantity\":1}")
printf '%s' "$ADD2" | assert_no_error

SENT=$(curl -sS -X POST "$BASE_URL/api/orders/$ORDER_ID/send" \
  -H "Authorization: Bearer $WAITER_TOKEN")
printf '%s' "$SENT" | assert_no_error

echo 'Kitchen login...'
KITCHEN_LOGIN=$(curl -sS -X POST "$BASE_URL/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"username":"kitchen1","password":"kitchen123"}')
printf '%s' "$KITCHEN_LOGIN" | assert_no_error
KITCHEN_TOKEN=$(printf '%s' "$KITCHEN_LOGIN" | json_field "['token']")
TICKET_ID=$(curl -sS "$BASE_URL/api/kitchen/tickets/active" -H "Authorization: Bearer $KITCHEN_TOKEN" | python3 -c "import json,sys; data=json.load(sys.stdin); print(data[0]['id'])")

T1=$(curl -sS -X PATCH "$BASE_URL/api/kitchen/tickets/$TICKET_ID" \
  -H "Authorization: Bearer $KITCHEN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"status":"IN_PROGRESS"}')
printf '%s' "$T1" | assert_no_error

T2=$(curl -sS -X PATCH "$BASE_URL/api/kitchen/tickets/$TICKET_ID" \
  -H "Authorization: Bearer $KITCHEN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"status":"READY"}')
printf '%s' "$T2" | assert_no_error

REQ=$(curl -sS -X POST "$BASE_URL/api/orders/$ORDER_ID/request-bill" \
  -H "Authorization: Bearer $WAITER_TOKEN")
printf '%s' "$REQ" | assert_no_error

APPROVED=$(curl -sS -X POST "$BASE_URL/api/orders/$ORDER_ID/approve" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"serviceChargeWaived":false}')
printf '%s' "$APPROVED" | assert_no_error
TOTAL=$(printf '%s' "$APPROVED" | json_field "['totalSnapshot']")

PAID=$(curl -sS -X POST "$BASE_URL/api/orders/$ORDER_ID/mark-paid" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"payments\":[{\"method\":\"CASH\",\"amount\":$TOTAL}]}")
printf '%s' "$PAID" | assert_no_error

FINAL=$(curl -sS "$BASE_URL/api/orders/$ORDER_ID" -H "Authorization: Bearer $ADMIN_TOKEN")
printf '%s' "$FINAL" | assert_no_error
FINAL_STATUS=$(printf '%s' "$FINAL" | json_field "['status']")
echo "Final order status: $FINAL_STATUS"

if [[ "$FINAL_STATUS" != "CLOSED" ]]; then
  echo 'Expected CLOSED status'
  exit 1
fi

echo 'API smoke completed successfully'
