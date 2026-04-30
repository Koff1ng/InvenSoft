import { describe, expect, it } from 'vitest';
import {
  isSyntheticLacomitivaEmail,
  shouldSyncAuthEmailForLoginUpdate,
  toAuthEmail,
} from './lacomitiva-auth';

describe('toAuthEmail', () => {
  it('passes through real emails', () => {
    expect(toAuthEmail('person@example.com')).toBe('person@example.com');
  });

  it('maps plain username to synthetic domain', () => {
    expect(toAuthEmail('Juan Pérez')).toBe('juanpérez@lacomitiva.local');
  });
});

describe('shouldSyncAuthEmailForLoginUpdate', () => {
  it('syncs when current auth email is synthetic', () => {
    expect(
      shouldSyncAuthEmailForLoginUpdate('old@lacomitiva.local', 'newlogin'),
    ).toBe(true);
  });

  it('does not sync when current auth is real email and new value has no @', () => {
    expect(
      shouldSyncAuthEmailForLoginUpdate('legacy@gmail.com', 'displayname'),
    ).toBe(false);
  });

  it('syncs when admin enters a real email as login', () => {
    expect(
      shouldSyncAuthEmailForLoginUpdate('legacy@gmail.com', 'new@company.com'),
    ).toBe(true);
  });
});

describe('isSyntheticLacomitivaEmail', () => {
  it('detects synthetic suffix case-insensitively', () => {
    expect(isSyntheticLacomitivaEmail('x@LACOMITIVA.LOCAL')).toBe(true);
    expect(isSyntheticLacomitivaEmail('x@gmail.com')).toBe(false);
  });
});
