import { describe, expect, it } from 'vitest';

import { singleConnectionUrl } from './sqlite-url';

describe('singleConnectionUrl', () => {
  it('adds a one-connection limit to a plain file URL', () => {
    expect(singleConnectionUrl('file:/app/apps/master/prisma/dev.db'))
      .toBe('file:/app/apps/master/prisma/dev.db?connection_limit=1');
  });

  it('keeps a Windows install path intact', () => {
    expect(singleConnectionUrl('file:C:/Users/till/AppData/Roaming/@chayxana/master/data/master.sqlite'))
      .toBe('file:C:/Users/till/AppData/Roaming/@chayxana/master/data/master.sqlite?connection_limit=1');
  });

  it('keeps parameters already on the URL', () => {
    expect(singleConnectionUrl('file:./dev.db?socket_timeout=10'))
      .toBe('file:./dev.db?socket_timeout=10&connection_limit=1');
  });

  it('overrides a larger limit', () => {
    expect(singleConnectionUrl('file:./dev.db?connection_limit=5')).toBe('file:./dev.db?connection_limit=1');
  });

  it('leaves a missing URL to Prisma', () => {
    expect(singleConnectionUrl(undefined)).toBeUndefined();
  });
});
