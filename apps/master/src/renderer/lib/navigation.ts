/**
 * Where the operator can go, and from which surface.
 *
 * This is data, not layout, so the one invariant that actually matters can be
 * tested: **the rail must never ask for more slots than the panel has.**
 *
 * The budget, measured in a browser at the real windowed viewport of
 * 1236x623 (see `docs/design/BLOCKS_C1.md` on the hardware):
 *
 *   rail column          619px   (623 less the shell's 2px seam, top and bottom)
 *     head                64px   name, role, connection word, collapse toggle
 *     scroller           503px   <- every destination competes for this
 *     Chiqish             48px   pinned in the foot; must never scroll
 *     seams                4px
 *
 * One destination costs 48px (the touch floor) plus a 2px seam, so N of them
 * measure `50N - 2`. 503px therefore holds ten, and ten is the hard ceiling
 * `MAX_RAIL_SLOTS` below.
 *
 * There are fifteen destinations. Nine are daily service; the other six are
 * setup a chayxana touches monthly at most, and they live behind the single
 * `Sozlamalar` rail entry that opens the hub. That entry occupies a slot
 * itself — which is why the rail carries nine destinations, not ten.
 *
 * Before this split the rail asked for 748px of a 461px box: five destinations
 * sat below the fold and a sixth was sliced to an 11px sliver. It scrolled, so
 * nothing was unreachable, but the operator saw nine of fifteen doors at rest.
 */

/** Matches the plain string the auth store carries. */
export type Role = 'OWNER' | 'ADMIN' | 'WAITER';

/** Icons live in the rail, not here, so this module stays pure and testable. */
export type Destination = {
  to: string;
  label: string;
  /** Key into the rail's icon map. */
  icon: string;
  roles: Role[];
};

/**
 * The ceiling the rail must respect at 1236x623. Derived above; a test holds
 * every role to it, so adding a sixteenth destination fails the gate rather
 * than silently pushing one below the fold again.
 */
export const MAX_RAIL_SLOTS = 10;

/** Where the `Sozlamalar` rail entry goes. The hub screen itself. */
export const HUB_ROUTE = '/setup';

const STAFF: Role[] = ['OWNER', 'ADMIN'];
const ALL: Role[] = ['OWNER', 'ADMIN', 'WAITER'];

/**
 * Daily service, in the order the operator reaches for them.
 *
 * Labels stay short enough to render whole at 168px. An ellipsis in a
 * navigation label is worse than a shorter word: the operator is scanning for
 * a destination, not reading a sentence.
 */
export const RAIL_DESTINATIONS: Destination[] = [
  { to: '/', label: 'Bugun', icon: 'dashboard', roles: ALL },
  { to: '/approval-queue', label: 'Tasdiqlash', icon: 'approve', roles: STAFF },
  { to: '/orders', label: 'Buyurtmalar', icon: 'orders', roles: ALL },
  { to: '/ombor', label: 'Ombor', icon: 'stock', roles: STAFF },
  { to: '/finance', label: 'Kunlik moliya', icon: 'finance', roles: STAFF },
  { to: '/menu', label: 'Menyu', icon: 'menu', roles: STAFF },
  { to: '/reports', label: 'Hisobot', icon: 'reports', roles: ['OWNER'] },
  { to: '/debts', label: 'Qarzlar', icon: 'debts', roles: STAFF },
  { to: '/expenses', label: 'Chiqimlar', icon: 'expenses', roles: STAFF },
];

/**
 * Setup. Reached through the hub, never from the rail.
 *
 * `Stollar` sits here because creating and renaming tables is one-time work.
 * Its live side — which table is carrying an open order — is already answered
 * by Bugun, Tasdiqlash and Buyurtmalar, so no daily reading is lost.
 */
export const HUB_DESTINATIONS: Destination[] = [
  { to: '/tables', label: 'Stollar', icon: 'tables', roles: STAFF },
  { to: '/users', label: 'Xodimlar', icon: 'users', roles: STAFF },
  { to: '/discounts', label: 'Chegirmalar', icon: 'discounts', roles: STAFF },
  { to: '/salaries', label: 'Maoshlar', icon: 'salaries', roles: STAFF },
  { to: '/audit', label: 'Amallar tarixi', icon: 'audit', roles: STAFF },
  { to: '/settings', label: 'Tizim sozlamalari', icon: 'settings', roles: STAFF },
];

/** The hub's own rail entry. Counts against `MAX_RAIL_SLOTS` like any other. */
export const HUB_ENTRY: Destination = {
  to: HUB_ROUTE,
  label: 'Sozlamalar',
  icon: 'settings',
  roles: STAFF,
};

const visible = (list: Destination[], role: Role | null | undefined) =>
  role ? list.filter((dest) => dest.roles.includes(role)) : [];

/**
 * Everything the rail shows for a role, hub entry included and last.
 *
 * The hub entry is omitted when the role can reach nothing inside it, so a
 * waiter is never handed a door onto an empty room.
 */
export function railFor(role: Role | null | undefined): Destination[] {
  const destinations = visible(RAIL_DESTINATIONS, role);
  return visible(HUB_DESTINATIONS, role).length > 0
    ? [...destinations, HUB_ENTRY]
    : destinations;
}

/** Everything the hub screen shows for a role. */
export function hubFor(role: Role | null | undefined): Destination[] {
  return visible(HUB_DESTINATIONS, role);
}
