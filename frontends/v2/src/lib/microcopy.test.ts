import { describe, expect, it } from 'vitest';

import { microcopy } from './microcopy';

describe('microcopy', () => {
  it('provides non-empty strings for every message key', () => {
    const groups = Object.values(microcopy);
    const values = groups.flatMap((group) => Object.values(group));

    expect(values.length).toBeGreaterThan(0);
    values.forEach((value) => {
      expect(typeof value).toBe('string');
      expect(value.trim().length).toBeGreaterThan(0);
    });
  });

  it('contains required critical keys', () => {
    expect(microcopy.errors.sendFailed).toBeTruthy();
    expect(microcopy.errors.micDenied).toBeTruthy();
    expect(microcopy.errors.micUnavailable).toBeTruthy();
    expect(microcopy.errors.settingsSyncFailed).toBeTruthy();
    expect(microcopy.status.memoryOffline).toBeTruthy();
    expect(microcopy.actions.retry).toBeTruthy();
  });
});
