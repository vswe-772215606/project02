/**
 * Blocks C1 — the design system primitives.
 *
 * Nothing here draws a border, a radius or a shadow. Separation is a 2px
 * seam of page ground; state is carried by the fill. Every control clears
 * the 48px touch floor and responds on `:active`, because the terminal is a
 * touchscreen and hover does not exist there.
 *
 * Design reference: docs/design/BLOCKS_C1.md
 */

export { Seam } from './Seam';
export { Field, FieldLabel, MoneyField } from './Field';
export { ActionBar } from './ActionBar';
export { Row, RowHeader, RowSub, RowMoney } from './Row';
export { Chip, type ChipTone } from './Chip';
export { Tile, type TileTone } from './Tile';
export { Keypad, Key, type KeypadKey } from './Keypad';
export { NavItem } from './NavItem';
