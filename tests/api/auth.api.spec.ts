import { expect, test } from '../../fixtures';
import { CREDENTIALS } from '../../utils/test-data';
import type { ApiError, LoginSuccess } from '../../utils/types';

/**
 * API-level auth.
 *
 * This project launches no browser at all — it is the `api` project in
 * playwright.config.ts. Running contract checks through the same runner as the UI tests
 * means one report, one CI job, one set of fixtures, and no second framework to maintain.
 * It also means a 401 regression is caught in ~40ms instead of via a red login test that
 * takes 4 seconds and points at the wrong layer.
 */
test.describe('POST /api/auth/login', () => {
  test('returns a token and the user for valid credentials', { tag: ['@api', '@smoke'] }, async ({
    anonymousApi,
  }) => {
    const response = await anonymousApi.login(CREDENTIALS.valid.email, CREDENTIALS.valid.password);

    expect(response.status()).toBe(200);
    const body = (await response.json()) as LoginSuccess;
    expect(body.token).toBeTruthy();
    expect(body.user).toMatchObject({ email: CREDENTIALS.valid.email });
    expect(body.user.id).toBeTruthy();
    expect(body.user.name).toBeTruthy();
  });

  test('never returns the password back', { tag: ['@api'] }, async ({ anonymousApi }) => {
    const response = await anonymousApi.login(CREDENTIALS.valid.email, CREDENTIALS.valid.password);

    expect(await response.text()).not.toContain(CREDENTIALS.valid.password);
  });

  const badCredentials = [
    { name: 'a wrong password', creds: CREDENTIALS.wrongPassword },
    { name: 'an unknown user', creds: CREDENTIALS.unknownUser },
    { name: 'an empty password', creds: { email: CREDENTIALS.valid.email, password: '' } },
    { name: 'an empty email', creds: { email: '', password: CREDENTIALS.valid.password } },
  ] as const;

  for (const { name, creds } of badCredentials) {
    test(`401s on ${name}`, { tag: ['@api'] }, async ({ anonymousApi }) => {
      const response = await anonymousApi.login(creds.email, creds.password);

      expect(response.status()).toBe(401);
      const body = (await response.json()) as ApiError;
      expect(body.error).toBe('invalid_credentials');
    });
  }

  test('is case-insensitive about nothing it should not be', async ({ anonymousApi }) => {
    /* Passwords are case-sensitive. If this ever returns 200 the app is lower-casing
     * credentials somewhere, which is a security bug, not a convenience. */
    const response = await anonymousApi.login(
      CREDENTIALS.valid.email,
      CREDENTIALS.valid.password.toUpperCase(),
    );

    expect(response.status()).toBe(401);
  });
});

test.describe('Authorisation', () => {
  const protectedEndpoints = [
    { name: 'GET /api/runs', call: 'listRuns' },
    { name: 'GET /api/flaky', call: 'getFlaky' },
  ] as const;

  for (const endpoint of protectedEndpoints) {
    test(`${endpoint.name} 401s without a token`, { tag: ['@api'] }, async ({ anonymousApi }) => {
      const response =
        endpoint.call === 'listRuns' ? await anonymousApi.listRuns() : await anonymousApi.getFlaky();

      expect(response.status()).toBe(401);
      expect((await response.json()) as ApiError).toEqual({ error: 'unauthorized' });
    });
  }

  test('rejects a malformed bearer token', { tag: ['@api'] }, async ({ api }) => {
    const response = await api.as('not-a-real-token').listRuns();

    expect(response.status()).toBe(401);
  });

  test('accepts a valid bearer token', { tag: ['@api'] }, async ({ api }) => {
    const response = await api.listRuns();

    expect(response.status()).toBe(200);
  });
});

test.describe('GET /api/health', () => {
  test('is public and reports ok', { tag: ['@api', '@smoke'] }, async ({ anonymousApi }) => {
    const response = await anonymousApi.health();

    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });
});
