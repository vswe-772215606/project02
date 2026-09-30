import { describe, expect, it } from 'vitest';

import { PinLockout } from './pin-lockout';

const T0 = Date.UTC(2026, 9, 1, 12, 0, 0);
const FIVE_MINUTES = 5 * 60 * 1000;

describe('PinLockout', () => {
  it('lets a device miss four times without locking it', () => {
    const lockout = new PinLockout(5, FIVE_MINUTES);
    for (let i = 0; i < 4; i += 1) expect(lockout.recordMiss('10.0.0.5', T0)).toBeNull();
    expect(lockout.lockedUntil('10.0.0.5', T0)).toBeNull();
  });

  it('locks the device on the fifth miss, for five minutes', () => {
    const lockout = new PinLockout(5, FIVE_MINUTES);
    for (let i = 0; i < 4; i += 1) lockout.recordMiss('10.0.0.5', T0);
    expect(lockout.recordMiss('10.0.0.5', T0)).toBe(T0 + FIVE_MINUTES);
    expect(lockout.lockedUntil('10.0.0.5', T0 + FIVE_MINUTES - 1)).toBe(T0 + FIVE_MINUTES);
    expect(lockout.lockedUntil('10.0.0.5', T0 + FIVE_MINUTES)).toBeNull();
  });

  it('never locks another device', () => {
    const lockout = new PinLockout(5, FIVE_MINUTES);
    for (let i = 0; i < 5; i += 1) lockout.recordMiss('10.0.0.5', T0);
    expect(lockout.lockedUntil('10.0.0.6', T0)).toBeNull();
  });

  it('forgets the misses once the device logs in', () => {
    const lockout = new PinLockout(5, FIVE_MINUTES);
    for (let i = 0; i < 4; i += 1) lockout.recordMiss('10.0.0.5', T0);
    lockout.recordSuccess('10.0.0.5');
    expect(lockout.recordMiss('10.0.0.5', T0)).toBeNull();
  });

  it('starts counting again after a lock expires', () => {
    const lockout = new PinLockout(5, FIVE_MINUTES);
    for (let i = 0; i < 5; i += 1) lockout.recordMiss('10.0.0.5', T0);
    expect(lockout.recordMiss('10.0.0.5', T0 + FIVE_MINUTES)).toBeNull();
  });

  it('ships with a limit of five misses and a lock of exactly five minutes', () => {
    const lockout = new PinLockout();
    for (let i = 0; i < 4; i += 1) expect(lockout.recordMiss('10.0.0.5', T0)).toBeNull();
    expect(lockout.recordMiss('10.0.0.5', T0)).toBe(T0 + 5 * 60 * 1000);
  });

  it('runs one attempt per device at a time', () => {
    const lockout = new PinLockout(5, FIVE_MINUTES);
    expect(lockout.tryBegin('10.0.0.5')).toBe(true);
    expect(lockout.tryBegin('10.0.0.5')).toBe(false);
    lockout.end('10.0.0.5');
    expect(lockout.tryBegin('10.0.0.5')).toBe(true);
  });

  it('lets another device try while one device has an attempt running', () => {
    const lockout = new PinLockout(5, FIVE_MINUTES);
    expect(lockout.tryBegin('10.0.0.5')).toBe(true);
    expect(lockout.tryBegin('10.0.0.6')).toBe(true);
    lockout.end('10.0.0.5');
    expect(lockout.tryBegin('10.0.0.6')).toBe(false);
  });
});
