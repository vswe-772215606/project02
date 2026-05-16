# Chayxana POS — UI/UX rules

**Status:** Active spec. Author/date: 2026-05-15.
**Scope:** `apps/master` admin renderer (Electron/React/Tailwind/shadcn) and `apps/mobile` waiter app (Expo/React Native/NativeWind/react-native-reusables). Kitchen app is **out of scope** of this rules doc — it has different touchscreen / readability constraints and stays with its current style.

This document is the source of truth for every visual and interaction decision. PRs that violate these rules need an explicit one-paragraph justification in the description.

---

## 1. Principles

1. **Truthful** — show real data, real states. Loading is `loading`, empty is `empty`, error is `error`. Never fake fast UX with optimistic state we can't reconcile.
2. **Dense, not cramped** — chayxana operators work at 1366×768 on cheap POS hardware. Every page must fit at that size without horizontal scroll. We use compact padding and tight typography, not because we love it, but because it's the floor we ship to.
3. **One language** — every user-facing string is Uzbek (Latin). No "i18n later." Strings are inline; no t-fn calls.
4. **One accent** — amber. All primary buttons, links, focus rings, active nav. Anything else uses the neutral palette or the status palette (success/warning/danger/info). Don't introduce a second brand color "for variety."
5. **Predictable** — same component, same behaviour, every page. A confirmation modal in Orders looks and behaves like a confirmation modal in Menu.
6. **Reversible** — every destructive action either asks first or offers an undo. Print, mark paid, walkout, cancel, deactivate, write-off — confirm first.
7. **Accessible enough** — keyboard navigable, focus visible, hit targets ≥36px, sufficient contrast. We don't pursue full WCAG AA certification but we don't ship buttons that can't be tabbed to.

---

## 2. Layout (master admin)

Floor target: **1366×768**. Anything wider gets more whitespace, not more content.

```
┌──────────────────────────────────────────────────────────────┐
│ Header  56px  [logo] page-title           …  conn  user▾    │
├────────┬─────────────────────────────────────────────────────┤
│        │                                                     │
│ Sidebar│   Content area                                      │
│ 200px  │   max-w-screen, p-4 to p-6                          │
│ icons- │                                                     │
│ only:  │                                                     │
│ 60px   │                                                     │
│        │                                                     │
└────────┴─────────────────────────────────────────────────────┘
```

- **Sidebar**: 200px expanded, 60px collapsed (icon-only). State persisted in Zustand. Default collapsed at <1280px width.
- **Header**: 56px, sticky. Page title left, connection indicator + user menu right.
- **Content**: `p-4` at min size, `p-6` at ≥1440px. No `max-w-*` that creates side gutters wider than `p-6` — the content area uses the full viewport width.
- **No nested sidebars.** If a feature needs sub-nav, use a tab strip at the top of the content area.
- **Breakpoints (Tailwind defaults override):**
  - Below 1280 → sidebar collapsed by default; tables prefer horizontal scroll over wrapping
  - 1280–1535 → sidebar expanded, content `p-4`
  - 1536+ → content `p-6`, looser table density allowed
- **Vertical**: 768px is the floor. Pages must fit a 5-7 row table without scrolling away from the page title. Sticky table headers help.

### Mobile (waiter app)

Phones, portrait only. 360–430px width target. No tablet layout in v1.

```
┌────────────────────────┐
│ AppBar  56px           │ ← always shows page title + back arrow
├────────────────────────┤
│                        │
│ Content                │
│ Safe-area inset        │
│ px-4                   │
│                        │
├────────────────────────┤
│ Bottom tab bar (only   │ ← only on the 3 main waiter screens
│ on root screens)       │
└────────────────────────┘
```

- Bottom tabs only on root screens (Orders / Menu / Settings). Detail screens use a stack with back-arrow header.
- Form screens use full-screen layout, not modals (RN modals on Android are awkward).

---

## 3. Color system

Light mode only. No dark variant in v1.

### Base palette (Tailwind tokens)

| Role | Token | Use |
|---|---|---|
| `--background` | white | page background |
| `--foreground` | zinc-950 | primary text |
| `--muted` | zinc-100 | subtle backgrounds (table stripes, panels) |
| `--muted-foreground` | zinc-500 | secondary text, labels |
| `--border` | zinc-200 | dividers, card borders |
| `--card` | white | cards |
| `--input` | zinc-200 | form input borders |
| `--ring` | amber-500 | focus rings |

### Accent (the only brand color)

| Role | Token | Use |
|---|---|---|
| `--primary` | amber-600 | primary button bg, active nav, key icons |
| `--primary-foreground` | white | text on primary |
| `--primary-hover` | amber-700 | hover state |
| `--link` | amber-700 | inline links and active items |

### Status palette (reserved — do not use for branding)

| Role | Token | Use | Examples |
|---|---|---|---|
| Success | emerald-600 | confirmations | "to'landi" badge, completed stocktake |
| Warning | yellow-500 | non-blocking concern | low-stock indicator, variance > threshold |
| Danger | red-600 | destructive / error | cancel, walkout, validation error |
| Info | sky-600 | neutral notice | "Yangilanish mavjud" banner |

Every status token has a `-50` background variant for badges (e.g., `bg-emerald-50 text-emerald-700`).

### Don't

- No third-party brand colors (Coca-Cola red, Pepsi blue) on menu items. The accent is amber, period.
- No gradients except the loading skeleton shimmer.
- No drop shadows beyond shadcn `shadow-sm` and `shadow`. No `shadow-2xl`.

---

## 4. Typography

| Scale | Tailwind class | Pixel | Use |
|---|---|---|---|
| `text-xs` | 12px | row metadata, table column hints, badges |
| `text-sm` | 14px | **default body text**, all forms, table cells |
| `text-base` | 16px | page titles, modal headers |
| `text-lg` | 18px | section headers within a page |
| `text-xl` | 20px | rare; financial summary numbers, dashboard cards |
| `text-2xl` | 24px | very rare; receipt total, walkout banner |

Font: system default (`system-ui, -apple-system, sans-serif`). No custom font load. Numbers in financial contexts use tabular figures: `font-variant-numeric: tabular-nums`.

**Weights**:
- `font-normal` (400) — body
- `font-medium` (500) — table headers, labels
- `font-semibold` (600) — page titles, primary buttons
- No `font-bold` (700) in body — reserved for receipt print and walkout banners

---

## 5. Spacing & density

Tailwind scale only. No arbitrary values like `p-[7px]` except for shadcn primitives we don't touch.

| Context | Padding | Gap |
|---|---|---|
| Page content | `p-4` (1280-) / `p-6` (1536+) | — |
| Card | `p-4` | `gap-3` between children |
| Table cell | `px-3 py-2` | — |
| Form row | — | `gap-2` between label & input; `gap-4` between rows |
| Section spacing | — | `space-y-4` to `space-y-6` |
| Tight list (sidebar nav, dropdowns) | `px-2 py-1.5` | — |

**Hit targets**: minimum 36×36px for any clickable. Touch targets on the mobile app are 44×44 minimum. Use `h-9 min-w-9` for icon buttons; `h-10 px-4` for text buttons.

---

## 6. Icons

- Library: `lucide-react` (master), `lucide-react-native` (mobile). Already installed in both.
- Size: `w-4 h-4` (16px) inside buttons and table cells; `w-5 h-5` (20px) in sidebar, headers; `w-6 h-6` (24px) only for empty states.
- Stroke: `strokeWidth={1.75}` default. shadcn's default is 2; we slightly lighten for the dense layout.
- Color: inherits `currentColor`. Never `text-amber-600` on icons directly — let the parent set the color.
- One icon per action, max. No double-icon "save + arrow" combos.

Canonical icons (use these, not synonyms):
- Add: `Plus`
- Edit: `Pencil`
- Delete/Destroy: `Trash2`
- Confirm: `Check`
- Cancel/Close: `X`
- Search: `Search`
- Filter: `SlidersHorizontal`
- Print: `Printer`
- Back: `ArrowLeft`
- Settings: `Settings`
- Money: `Wallet` (debt) / `Banknote` (cash) / `CreditCard` (card)
- Stock: `Package`
- Recipe: `BookOpen`
- Stocktake: `ClipboardCheck`
- Waste: `Trash`
- Owner-only marker: `Crown`

---

## 7. Components (shadcn baseline)

We use shadcn/ui ("New York" style, `tw-merge` + `cva`). Install components on demand via `npx shadcn add`. Place under `apps/master/src/renderer/components/ui/`.

### Required initial set (Phase 1A)

| shadcn name | Where used |
|---|---|
| `button` | Everywhere |
| `card` | Dashboard tiles, section containers |
| `dialog` | Confirmations, short forms |
| `sheet` | Side-panel forms (ingredients, recipe edit) |
| `table` | Every list page (Orders, Menu, Ingredients, etc.) |
| `input` | Forms |
| `label` | Forms |
| `select` | Dropdowns (single-select only; use combobox for searchable) |
| `combobox` | Searchable selects (e.g., ingredient picker in recipe editor) |
| `form` | react-hook-form integration |
| `dropdown-menu` | Row actions menu (kebab), user menu |
| `toast` / `sonner` | Transient notifications. Use sonner. |
| `skeleton` | Loading states |
| `badge` | Status pills |
| `tabs` | In-page sub-navigation |
| `separator` | Visual dividers |
| `alert` | Inline page warnings, e.g., "Tizim hali sozlanmagan" |
| `tooltip` | Icon-button hints |
| `popover` | Date pickers, small floating editors |
| `command` | Cmd-K-style search (optional, future) |

### Custom components (build, don't fetch)

| Name | Purpose |
|---|---|
| `<PageHeader title="…" actions={…} />` | Standard page top: title left, action buttons right |
| `<PageContent>` | Page body wrapper with consistent spacing |
| `<DataTable columns={…} data={…} />` | Wrapper over shadcn `table` with sort/filter/empty-state |
| `<MoneyCell value={uzs} />` | UZS formatter (right-aligned, tabular-nums) |
| `<DateCell value={iso} />` | DD.MM.YYYY HH:MM in Tashkent local |
| `<UserChip userId={…} />` | Avatar + full name; resolves via cached user list |
| `<EmptyState icon={Icon} title="…" hint="…" />` | Standard empty box |
| `<ConfirmDialog>` | Wrapper over `dialog`; defaults the destructive/cancel pair |
| `<ConnectionBanner>` | Renders only when `connection.state !== 'online'` |

### Forbidden

- Raw `<button class="bg-amber-600">` — use the shadcn `Button` component.
- Inline styles (`style={{}}`) — use Tailwind classes.
- Margin to space siblings (use `gap-*` or `space-y-*`).
- Tailwind arbitrary values (`p-[7px]`) outside shadcn primitives.

---

## 8. Patterns

### 8.1 Pages

Every page follows:

```tsx
<PageHeader title="Mahsulotlar" actions={<Button onClick={…}><Plus />Qo'shish</Button>} />
<PageContent>
  {filters /* optional */}
  <DataTable columns={...} data={...} />
</PageContent>
```

Tabs (when needed) go under `<PageHeader>` via the `tabs` prop, not separate.

### 8.2 Tables

- Sticky header.
- Sort indicators only on sortable columns.
- Right-align numeric columns. Left-align text. Center icons-only columns.
- Row click opens the detail (sheet or new page). Don't add a separate "View" button.
- Row actions live in a kebab menu (`MoreHorizontal` icon) at the end of the row.
- Selection (checkbox column) only when bulk action exists. No "select all" without a use case.
- Pagination: 50 rows per page default. Page controls bottom-right.
- Empty state inline: same `EmptyState` component, single-cell row spanning all columns.

### 8.3 Forms

- Use shadcn `form` + react-hook-form + zod. Already installed.
- Field order: most important first. Required fields not visually distinguished (we assume all are required unless marked optional).
- Inline validation appears on blur, not on every keystroke.
- Submit button always primary; Cancel always secondary; both always visible (no "scroll to submit").
- For forms with >7 fields, use a `<Sheet>` not a `<Dialog>`.
- For forms with ≤3 fields, prefer `<Dialog>`.
- Loading state on submit: button disabled with spinner inside (`<Loader2 className="animate-spin" />`).
- Server errors: red `<Alert>` at the top of the form, not toasts.

### 8.4 Modals & sheets

- **Dialog** = confirmation, short form. Centered, 400-500px wide. Closeable by Esc, click-outside, or X.
- **Sheet** = long form, side panel. Right side on desktop, bottom-sheet on mobile. 480px wide default.
- Never stack two modals. If a destructive action inside a sheet needs confirmation, close the sheet first, then show the confirm dialog. (Or use an inline AlertDialog as an exception.)

### 8.5 Confirmations

```
Title:    "Buyurtmani bekor qilasizmi?"
Body:     "Bu amal qaytarib bo'lmaydi. Oshxonadagi tayyorlangan
           taomlar uchun pul qaytarilmaydi."
Buttons:  [ Bekor qilish ]  [ Ha, bekor qilaman ]   ← right = destructive
```

Destructive button uses `variant="destructive"`. Affirmative-but-safe (e.g., "Saqlash") uses primary amber.

### 8.6 Toasts (sonner)

- Success: 3s auto-dismiss, no action required.
- Error: 5s, with retry button if applicable.
- Info: 4s. Use sparingly — don't toast every save.
- Never toast a destructive confirmation result. The page state itself is the confirmation.
- Position: bottom-right.

### 8.7 Loading & empty states

- Tables: 3-5 skeleton rows on initial load. No spinners.
- Buttons: disable + inline `<Loader2 spin />` on async actions.
- Empty states: always have an icon (24px), a title (text-base font-medium), a hint (text-sm muted), and a primary action button when one exists.

Example empty state:
```
        [Package icon, 24px, muted]
      Hech qanday mahsulot yo'q
      Birinchi mahsulotni qo'shing.
        [ Mahsulot qo'shish ]
```

### 8.8 Error states

- Form field errors: inline below the field, red text, 12px.
- Page-level errors: red `<Alert>` at top of content.
- 403: redirect to home with toast "Bu sahifaga ruxsatingiz yo'q".
- 404: dedicated page with back-link.
- 500: friendly error page with "Qayta urinib ko'rish" button + auto-collected error id for support.

### 8.9 Connection state (cross-ref PRD 12)

- `online`: no banner.
- `connecting`: subtle 2px progress bar at top of header. No banner.
- `reconnecting`: yellow banner at top — "Aloqa: qayta urinilmoqda…"
- `auth-failed`: red banner — "Aloqa muvaffaqiyatsiz. Tizimga qayta kiring."
- `unreachable`: red banner — "Aloqa yo'q. Server ishlamayapti yoki tarmoq uzilgan."

All mutation buttons disabled while `connection.state !== 'online'`. Tooltip on disabled state: "Aloqa tiklanmaganda bajarib bo'lmaydi."

---

## 9. Data formatting

### 9.1 Money (UZS)

- Locale: `uz-UZ`. No decimal places. Thousand separator: space.
- Format: `1 234 567 UZS` (right-aligned in tables; no UZS suffix in totals row — column header carries it).
- Component: `<MoneyCell value={uzs} />`. Don't hand-format.
- Zero is shown as `0` (not `—` or `0 UZS`). Only nullable money values render `—`.
- Negative (refunds, reversals): with leading minus and red color: `-1 200 UZS`.

### 9.2 Dates and times

- Local timezone: Asia/Tashkent (UTC+5). Always.
- Date: `DD.MM.YYYY` (e.g., `15.05.2026`).
- Date+time: `DD.MM.YYYY HH:MM` (e.g., `15.05.2026 14:32`).
- Relative time only when ≤1 hour: "5 daqiqa oldin", "endi". After that, absolute.
- Components: `<DateCell>` and `<DateTimeCell>`. Built on `Intl.DateTimeFormat` with Tashkent timezone.

### 9.3 Quantities

- Ingredient quantities: respect ingredient's recipe unit. `<QuantityCell value={n} unit="g" />` formats as `500 g`.
- Recipe quantities: same convention.
- Conversions are computed; the UI never asks the user to convert.

### 9.4 Numbers (counts)

- Whole numbers, no decimals. Thousand separator: space.
- "Bugun: 47 buyurtma", "Stollar: 12 / 70".

---

## 10. Language (Uzbek conventions)

- Latin alphabet (not Cyrillic).
- Apostrophe for letters with hamza: `o'`, `g'` (use the curly apostrophe `'`, not `'`).
- Always sentence-case button labels: `Saqlash`, not `SAQLASH` or `saqlash`.
- Use formal address (sizlash): `Saqlaysizmi?` not `Saqlaysanmi?`.
- Time of day: 24-hour. Months: `Yanvar`, `Fevral`, ..., `Dekabr`. Days: `Du`, `Se`, `Ch`, `Pa`, `Ju`, `Sh`, `Ya`.
- Numbers: never spell out (`5` not `besh`).

### Common terms (lock the vocabulary)

| English | Uzbek |
|---|---|
| Order | Buyurtma |
| Bill | Hisob |
| Cancel | Bekor qilish |
| Walkout | Tarbiya |
| Discount | Chegirma |
| Service charge | Xizmat haqi |
| Debt | Qarz |
| Repayment | Qaytarish |
| Expense | Chiqim |
| Income | Daromad |
| Profit | Foyda |
| COGS / cost of goods | Tannarx |
| Inventory / stock | Zaxira |
| Ingredient | Mahsulot |
| Recipe | Retsept |
| Stocktake | Sanoq |
| Variance | Farq |
| Waste | Yo'qotish |
| Purchase | Xarid |
| Save | Saqlash |
| Edit | Tahrirlash |
| Delete | O'chirish |
| Add | Qo'shish |
| Confirm | Tasdiqlash |
| Print | Chop etish |

---

## 11. Mobile (waiter app) specifics

- Stack: NativeWind + `react-native-reusables` (shadcn equivalents for RN).
- Same color tokens, same typography scale (translated to RN's `style` or NativeWind classes).
- Hit targets ≥44px (Apple HIG floor).
- No hover states; rely on `pressed` / `disabled`.
- Pull-to-refresh on every list screen.
- Bottom sheets (`react-native-reusables` `Sheet`) instead of side drawers.
- Haptics on long-press confirmations.
- Permissions/network failure surfaces use a dedicated screen, not toasts (which are easy to miss on a busy phone).

---

## 12. POS / smaller monitor considerations

The 1366×768 floor drives most density decisions above. Additional rules specific to small screens:

- The Orders page must show ≥8 active orders without scrolling.
- The Approval Queue must show ≥5 pending bills without scrolling.
- Dashboard cards must fit in one row at 1366px (max 4 cards).
- Settings page tabs at top, not nested left-side sub-nav.
- Receipt preview modal (when implemented) caps at 80% viewport height.

If the resolution drops below 1280px width at runtime, the sidebar collapses automatically and stays user-collapsible.

---

## 13. File structure (master)

```
apps/master/src/renderer/
├── components/
│   ├── ui/                ← shadcn primitives, auto-generated, do not edit
│   ├── layout/            ← AppShell, Sidebar, Header
│   ├── data/              ← DataTable, MoneyCell, DateCell, ...
│   ├── feedback/          ← EmptyState, ConfirmDialog, ConnectionBanner
│   └── domain/            ← Page-specific composite components
├── pages/                 ← One folder per route
├── hooks/                 ← useConnection, useCurrentUser, ...
├── lib/
│   ├── format.ts          ← formatMoney, formatDate, ...
│   └── utils.ts           ← cn() helper, etc.
├── stores/                ← Zustand
└── api/                   ← TanStack Query clients
```

shadcn `components.json`:
- Style: `new-york`
- Base color: `zinc`
- CSS variables: yes
- Tailwind config: `tailwind.config.cjs` (existing)
- Aliases: `@/components`, `@/lib`, `@/hooks`

---

## 14. Don'ts (quick list)

- ❌ Two accent colors
- ❌ Dark mode
- ❌ Custom fonts
- ❌ Drop shadows beyond `shadow-sm` and `shadow`
- ❌ Gradients (except skeleton shimmer)
- ❌ Animations longer than 200ms
- ❌ Layouts that need `xl:` breakpoint to be usable
- ❌ Hover-only affordances (we ship to touchscreens too)
- ❌ Modal-in-modal
- ❌ Toast for destructive action confirmation
- ❌ English in any user-facing surface
- ❌ Inline styles
- ❌ `any` types in component props
- ❌ Margin between siblings (use gap / space-y)
- ❌ Pixel values outside the spacing scale
- ❌ Spinners on tables (use skeletons)

---

## 15. Reviewer checklist

PR description must address:
- [ ] All user-facing strings are in Uzbek
- [ ] Layout works at 1366×768 without horizontal scroll
- [ ] All buttons are shadcn `Button`, not raw HTML
- [ ] All mutation buttons respect connection state
- [ ] All loading states use skeleton (lists) or inline spinner (buttons)
- [ ] All money values use `<MoneyCell>`; all dates use `<DateCell>` or `<DateTimeCell>`
- [ ] Destructive actions go through `<ConfirmDialog>`
- [ ] No new accent colors or shadows added
- [ ] Hit targets ≥36px (desktop), ≥44px (mobile)
- [ ] Keyboard navigation works (tab through, esc closes modals)

---

## 16. Cross-references

- Color/density decisions in this doc supersede any prior pattern in existing `apps/master/src/renderer/styles.css`.
- PRD 12 (network partition / degraded UX) is the source of truth for connection-state vocabulary.
- REFACTOR_PLAN.md §5 (roles & responsibilities) determines who sees what page; the UI respects role gates at render time, not just route guards.
- `docs/agent-plans/00-shared/decisions.md` — locked product rules; UI does not invent affordances for features that don't exist.
