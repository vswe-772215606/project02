# Blocks C1 — the master renderer design system

**Chosen:** 2026-08-13. **Applies to:** `apps/master/src/renderer` only. The order and
mobile waiter apps are untouched.

The terminal is a fixed touchscreen monitor, not a laptop. Everything below follows from
that and from two constraints set by the owner: **no wasted space, no rounded corners.**

## 1. The idea

Nothing is outlined. Every element — a row, a tile, a key, a button — is a solid field, and
what separates two fields is a **2px seam** where the page ground shows through. The seam
*is* the border, so there is no border to draw.

Two things follow, and they are why this suits a till:

- **The whole field is the target.** There is never a question of whether a finger landed
  on the edge or inside it.
- **The fill carries the state.** An occupied table or an order awaiting confirmation is
  legible from across the room without reading anything.

## 2. Density

Dense and touch-operated only conflict if you shrink the wrong thing. Targets stay large;
the space between and around them collapses.

| | Value | Rule |
|---|---|---|
| Seam | `2px` | The only gap between adjacent fields |
| Padding | `12px` | Page edge, inside a field, between groups — one value |
| Moat | `16px` | Before a destructive action, and nowhere else |
| Radius | `0` | Everywhere. Enforced in `tailwind.config.cjs` |
| Row, control | `48px` | Table row, nav item, input, standard button |
| Action | `56px` | The action a screen exists for |
| Keypad key | `66px` | Tender and quantity entry |
| Label floor | `12px` | Uppercase micro-labels only, and they must carry tracking |
| Text floor | `13px` | Everything a person reads as a sentence or a datum |
| Money floor | `17px` | Including inside a 48px row — see `RowMoney` |

## 3. Palette

Single light palette — there is no dark variant. Low chroma throughout; every ink-on-fill
pair clears 4.5:1. Values live in `src/renderer/styles.css`.

| Role | Hex | Token | Contrast | Where |
|---|---|---|---|---|
| Seam | `#DAD5CC` | `--background` | — | The page, and every 2px gap |
| Field | `#F6F4F0` | `--card` | — | Every content surface |
| Raised | `#EAE6DF` | `--secondary` `--muted` | — | Column headers, inert fields |
| Pressed | `#E2DDD4` | `--accent` | — | The `:active` fill |
| Ink | `#2E2A26` | `--foreground` | 13.0:1 | All primary text |
| Muted ink | `#6E675E` | `--muted-foreground` | 5.1:1 | Labels, secondary lines |
| Selected | `#3C372F` | `--selected` | 10.7:1 | Chosen row, tile, nav item |
| Live | `#C9A05C` | `--primary` `--warning` | 5.9:1 | Occupied, awaiting confirm, primary action |
| Settled | `#A8BAA2` | `--success` | 6.9:1 | Closed and paid — quiet on purpose |
| Owed | `#9E5A51` | `--destructive` | 4.7:1 | Debt, walkout, overdue, delete |
| Focus | `#8A6B2E` | `--ring` | 4.6:1 | 2px inset ring on the focused control |

Hex values are the design reference; the HSL triplets in `styles.css` are what actually
ships, and rounding puts the two up to two units apart on a channel. No contrast ratio
crosses a threshold because of it.

Three corrections landed with the palette: `--warning` went from **1.98:1** to 5.9:1 and
`--success` from **3.30:1** to 6.9:1 — both render money — and `--info` retired the blue,
mapping to the neutral selected fill so the app's stray blue usages degrade rather than
persist.

**This repaints the whole app, not just the converted components.** These are the same
`:root` variables every unconverted shadcn primitive already consumes, so `dialog`, `sheet`,
`select`, `table`, `alert`, `card`, `DataTable`, `AppShell` and `Sidebar` all changed colour
the moment the tokens landed. That is intended — a half-repainted app would be worse — but
it means the visual blast radius is every screen, not the primitives listed in §5.

### Focus and press

Two behaviours are shared classes rather than per-component utilities, because both have to
work against **every** fill in the palette:

- **`.focus-block`** — two inset rings, dark hugging the edge and light just inside it. A
  single ochre ring measured 1.04:1 on the owed fill and 2.02:1 on live, i.e. invisible on
  the primary and destructive buttons most likely to take keyboard focus. With two rings,
  one of them always clears 3:1 whatever it sits on.
- **`.press-block`** — a brightness step plus a 1px nudge. Per-tone `active:bg-*` only ever
  worked for the default fill, so a live, owed or already-selected element had no pressed
  state at all; a brightness step works on any fill.

Press is the only thing that animates. **State changes are instant** — selecting a row,
switching the active nav item, disabling a control — because on a till an immediate swap
reads as responsiveness and a 75ms fade reads as lag. The `transition-colors` these
components inherited from shadcn existed to soften hover, and there is no hover here.

Tailwind exposes domain aliases beside the shadcn names: `bg-live`, `bg-settled`, `bg-owed`,
`bg-selected`, `bg-field`, `bg-field-raised`, `bg-field-press`, `bg-seam`. **Prefer these in
new code** — `bg-live` says what it means where `bg-primary` does not.

## 4. Rules

- **No borders.** Separation is the seam or a change of fill. `--border` equals the seam
  colour, so a stray border reads as a gap rather than a line.
- **No radius.** `borderRadius` is `0` for every key in the Tailwind theme, `rounded-full`
  included — a stray `rounded-*` cannot reintroduce one.
- **No shadows.** A fixed terminal has no need for depth.
- **No accent bars.** No coloured edge on rows, cards, nav items or alerts. Emphasis is the
  fill.
- **No hover.** Glass has no hover state. Every action is visible at rest and feedback comes
  from `:active` only — a fill shift plus a 1px nudge, under 80ms. Nothing may appear on
  approach, and no tooltip may carry information the operator needs.
- **Colour is never alone.** Every fill carries its word: *Band*, *Bo'sh*, *Nasiya*.
- **Tabular figures** wherever digits line up.
- **12px labels, 13px text, 17px money.**

### The one border exception

A dense data grid may use hairline cell rules instead of seams: `components/salaries/DailyMatrix.tsx`
is a payroll matrix roughly thirty day-columns wide, where a 2px seam per column would spend
60px of a 1366px screen on gaps alone. Rules there are structure, not decoration — including
the heavier rule at a month boundary — and they use `--border`, so they read as seams.

This is the only place it is allowed. It is not a licence for borders on cards, rows, or
panels, and it is still never a coloured edge.

## 5. Primitives

`src/renderer/components/blocks/` — import from `@/components/blocks`.

| Component | What it is |
|---|---|
| `Seam` | The structural container: a grid on the seam colour with `gap: 2px`. Nest freely — one consistent grid results. |
| `Field` `FieldLabel` `MoneyField` | Any content surface, its caps label, and the headline money surface. |
| `Row` `RowHeader` `RowSub` `RowMoney` | One 48px line of data. A `Row` with `onClick` renders a real `<button>`, so it is keyboard reachable — which also means **never nest another control inside a clickable Row**; give the line its own grid cell for actions and leave the Row itself inert. |
| `Chip` | State label — `live` / `settled` / `owed` / `inert` / `selected`. |
| `Tile` | Square target: floor table, menu item, category. |
| `Keypad` `Key` | Fixed 3×66px numeric entry. Tender and quantity only, never navigation. |
| `NavItem` | 48px navigation target; the active one inverts. |
| `ActionBar` | The footer action row. Pass the destructive button as `destructive` and the 16px moat is guaranteed structurally. |

Retargeted shadcn primitives (`components/ui/`): `Button`, `Input`, `Badge`. Their variant
APIs are unchanged so existing call sites inherit C1 without being rewritten. `Button` sizes
all clear the touch floor now — `sm` means less padding, not a shorter control — and a new
`action` size gives the 56px confirm button.

## 6. Seeing it

`#/components` renders every primitive in every state. It is a developer surface: absent
from the sidebar, and removable by deleting `pages/ComponentsPage.tsx` plus its route.

## 7. Not yet converted

The primitives above are done. These still carry pre-C1 styling and are the natural next
tranche:

- `components/data/DataTable.tsx` — should compose `Seam` + `RowHeader` + `Row`. Today it puts
  `onClick` on a bare `<tr>` with no `role`, no `tabIndex` and no press feedback. The path is
  live: `MonthlyTable` passes `onRowClick` for the day drill-down. Tapping works, so this is
  not urgent on a device with no keyboard, but the row does not look or behave like a target.
  Its seven callers are the reports sections, so convert them together. Its wrapper still
  carries `rounded-md border bg-card`.
- `components/expenses/ExpenseCreateDialog.tsx` — one tinted warning box (`border-warning/30`
  `bg-warning/5`). The system says a state is a solid fill carrying its word, not a 5% tint
  behind a hairline.

These two are the only `rounded-*` / `border` remnants left outside `components/ui/`. The
radius is inert either way — the Tailwind scale is zeroed — but the intent should go.

The duplicate `ConfirmDialog` is resolved: two implementations existed, and the dead one —
which carried the document-level Enter handler that fired `onConfirm` regardless of focus —
has been deleted. The surviving `components/feedback/ConfirmDialog.tsx` has no key handler,
so that accidental-confirm hazard is gone.
- `components/ui/` — `dialog`, `sheet`, `select`, `checkbox`, `table`, `alert`, `card`.
- `components/feedback/` — `PageHeader`, `PageContent`, `EmptyState`.
- `components/layout/` — `AppShell`, `Sidebar` (Sidebar should compose `NavItem`).

Known problems from the 2026-08-03 audit that this system exists to fix, still outstanding
in page code: text elements below 12px across ~25 files, blue classes across 7 files, a
~42% raw-`<button>` bypass rate, and four MenuPage actions hidden behind `hover`.

Height changes that will show on unconverted pages — expected, not accidental:

- `OmborPage` row actions — two `Button size="sm"` plus a `Badge` in one `DataTable` cell;
  every row in that table grows by roughly 16px.
- `ReportsPage` toolbar — `Input`/`Select` pinned at `h-9` now sit beside 48px buttons in
  the same flex row, so that toolbar is visibly uneven until it is converted.
- `Header.tsx:94` — the global profile button is hardcoded `h-10`, so it stays under the
  touch floor despite the new default. Removing that override is a one-line fix, but it
  changes the header, which is layout.

Page layout and composition are **not** decided here.
