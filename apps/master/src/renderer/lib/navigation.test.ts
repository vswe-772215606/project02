import { describe, expect, it } from 'vitest';

import {
  HUB_DESTINATIONS,
  HUB_ENTRY,
  HUB_ROUTE,
  MAX_RAIL_SLOTS,
  RAIL_DESTINATIONS,
  type Role,
  hubFor,
  railFor,
} from './navigation';

const ROLES: Role[] = ['OWNER', 'ADMIN', 'WAITER'];

describe('the rail fits the panel', () => {
  // The reason this file exists. At 1236x623 the scroller is 503px and one
  // destination costs 50px, so an eleventh entry drops off the bottom.
  it.each(ROLES)('never asks for more than %i slots — %s', (role) => {
    expect(railFor(role).length).toBeLessThanOrEqual(MAX_RAIL_SLOTS);
  });

  it('measures within the 503px scroller for the role that sees the most', () => {
    const widest = Math.max(...ROLES.map((role) => railFor(role).length));
    // 48px item + 2px seam, less the seam the last item does not have.
    expect(widest * 50 - 2).toBeLessThanOrEqual(503);
  });

  it('leaves the owner — who sees everything — no slack to spare but no overflow', () => {
    expect(railFor('OWNER')).toHaveLength(MAX_RAIL_SLOTS);
  });
});

describe('every destination is reachable from exactly one surface', () => {
  it('lists no destination in both the rail and the hub', () => {
    const rail = RAIL_DESTINATIONS.map((d) => d.to);
    const overlap = HUB_DESTINATIONS.filter((d) => rail.includes(d.to));
    expect(overlap).toEqual([]);
  });

  it('routes to each destination only once', () => {
    const all = [...RAIL_DESTINATIONS, ...HUB_DESTINATIONS].map((d) => d.to);
    expect(new Set(all).size).toBe(all.length);
  });

  it('keeps all fifteen destinations the rail used to carry', () => {
    expect(RAIL_DESTINATIONS.length + HUB_DESTINATIONS.length).toBe(15);
  });

  it('does not put the hub inside itself', () => {
    expect(HUB_DESTINATIONS.map((d) => d.to)).not.toContain(HUB_ROUTE);
  });
});

describe('role filtering', () => {
  it('hands an owner the reports the admin must not see', () => {
    expect(railFor('OWNER').map((d) => d.to)).toContain('/reports');
    expect(railFor('ADMIN').map((d) => d.to)).not.toContain('/reports');
  });

  it('gives a waiter no setup hub, since every item inside it is staff-only', () => {
    expect(hubFor('WAITER')).toEqual([]);
    expect(railFor('WAITER').map((d) => d.to)).not.toContain(HUB_ROUTE);
  });

  it('ends the staff rail with the hub entry, so setup reads as the last door', () => {
    for (const role of ['OWNER', 'ADMIN'] as Role[]) {
      expect(railFor(role).at(-1)).toEqual(HUB_ENTRY);
    }
  });

  it('shows nothing at all when there is no user yet', () => {
    expect(railFor(null)).toEqual([]);
    expect(hubFor(undefined)).toEqual([]);
  });
});
