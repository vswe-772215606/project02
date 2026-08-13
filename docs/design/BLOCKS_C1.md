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
| Text floor | `13px` | Money never below `17px` |

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

Three corrections landed with the palette: `--warning` went from **1.98:1** to 5.9:1 and
`--success` from **3.30:1** to 6.9:1 — both render money — and `--info` retired the blue,
mapping to the neutral selected fill so the app's stray blue usages degrade rather than
persist.

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
- **13px floor, 17px money.**

## 5. Primitives

`src/renderer/components/blocks/` — import from `@/components/blocks`.

| Component | What it is |
|---|---|
| `Seam` | The structural container: a grid on the seam colour with `gap: 2px`. Nest freely — one consistent grid results. |
| `Field` `FieldLabel` `MoneyField` | Any content surface, its caps label, and the headline money surface. |
| `Row` `RowHeader` `RowSub` `RowMoney` | One 48px line of data. A `Row` with `onClick` renders a real `<button>`, so it is keyboard reachable. |
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

- `components/data/DataTable.tsx` — should compose `Seam` + `RowHeader` + `Row`; today it
  has click handlers on `<div>` rows with no keyboard route.
- `components/ConfirmDialog.tsx` — two implementations exist and the non-compliant one won;
  its document-level Enter handler fires `onConfirm` regardless of focus.
- `components/ui/` — `dialog`, `sheet`, `select`, `checkbox`, `table`, `alert`, `card`.
- `components/feedback/` — `PageHeader`, `PageContent`, `EmptyState`.
- `components/layout/` — `AppShell`, `Sidebar` (Sidebar should compose `NavItem`).

Known counts from the 2026-08-03 audit that this system exists to fix, still outstanding in
page code: 96 text elements below 12px, 115 blue classes across 7 files, 59 raw `<button>`
against 83 `<Button>` (a 42% bypass rate), and four MenuPage actions hidden behind `hover`.

Page layout and composition are **not** decided here.
