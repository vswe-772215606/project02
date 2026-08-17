import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { SERVER_ORIGIN, SERVER_PORT } from './server-port';

const sourceOf = (relative: string): string =>
  readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');

describe('SERVER_PORT', () => {
  it('falls back to the production port when no variant is baked in', () => {
    // vitest applies no defines, so this exercises the fallback branch.
    expect(SERVER_PORT).toBe(4000);
    expect(SERVER_ORIGIN).toBe('http://localhost:4000');
  });
});

// A `next` build serves on 4100. Any port literal in a module that talks to the
// server survives the build unchanged and sends that build's traffic to the
// production till instead — which is exactly how the first side-by-side
// installer shipped. These two are the only renderer modules that open a
// connection, so they are the only two that can reintroduce it.
describe('no renderer module hardcodes a server port', () => {
  it('the REST client derives its origin', () => {
    expect(sourceOf('../api/client.ts')).not.toMatch(/localhost:\d+/);
  });

  it('the socket client derives its origin', () => {
    expect(sourceOf('./socket-client.ts')).not.toMatch(/localhost:\d+/);
  });
});
