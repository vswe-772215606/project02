/**
 * An order line as it goes on the wire, to every role.
 *
 * A waiter reads order payloads, so the line's food cost (`cogsSnapshot`), the
 * legacy `consumptionSnapshot` and the dish row (`menuItem`, which carries
 * `costPrice` and `unitCostSnapshot`) never leave the server — money rules
 * D18, Money Map issue 32, P3 Task 7. `menuItemKind` is all a client needs
 * from the dish, and `price` is the frozen unit price as a whole so'm number.
 * The dish row is dropped for every role, not only WAITER: ADMIN and OWNER
 * read tan narx from Menyu and Hisobot, never from an order.
 */
type DishRow = { kind?: string | null } | null;

export function toClientLine<L extends { menuItem?: DishRow }>(line: L, price: number) {
  // TypeScript counts the named bindings as used because a rest element
  // follows them — which is the point: they are what `rest` must not carry.
  const { cogsSnapshot: _cogs, consumptionSnapshot: _consumption, menuItem, ...rest } = line as L & {
    cogsSnapshot?: unknown;
    consumptionSnapshot?: unknown;
  };
  return { ...rest, price, menuItemKind: menuItem?.kind ?? 'FOOD' };
}
