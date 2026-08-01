import { expect, test } from '../../fixtures';
import { validateFlakyResponse } from '../../utils/schema';
import { SEED } from '../../utils/test-data';
import type { FlakyResponse } from '../../utils/types';

test.describe('GET /api/flaky', () => {
  test('returns a series and the top flaky tests', { tag: ['@api', '@smoke'] }, async ({ api }) => {
    const response = await api.getFlaky(SEED.flakeWindowDays);

    expect(response.status()).toBe(200);
    const body = (await response.json()) as FlakyResponse;
    expect(body.series.length).toBeGreaterThan(0);
    expect(body.topFlaky.length).toBeGreaterThan(0);
  });

  test('matches the contract shape', { tag: ['@api', '@contract'] }, async ({ api }) => {
    const response = await api.getFlaky();

    expect(validateFlakyResponse(await response.json())).toSatisfyContract('GET /api/flaky');
  });

  test('the window length follows the days parameter', { tag: ['@api'] }, async ({ api }) => {
    const [thirty, seven] = await Promise.all([api.getFlaky(30), api.getFlaky(7)]);

    expect(((await thirty.json()) as FlakyResponse).series).toHaveLength(30);
    expect(((await seven.json()) as FlakyResponse).series).toHaveLength(7);
  });

  test('the series is in ascending date order', { tag: ['@api'] }, async ({ api }) => {
    const body = (await (await api.getFlaky()).json()) as FlakyResponse;

    const dates = body.series.map((p) => p.date);
    expect(dates).toEqual([...dates].sort());
  });

  test('the series has no duplicate days', async ({ api }) => {
    const body = (await (await api.getFlaky()).json()) as FlakyResponse;

    expect(new Set(body.series.map((p) => p.date)).size).toBe(body.series.length);
  });

  test('top flaky tests are ranked by flake rate', { tag: ['@api'] }, async ({ api }) => {
    const body = (await (await api.getFlaky()).json()) as FlakyResponse;

    const rates = body.topFlaky.map((t) => t.flakeRate);
    expect(rates, 'topFlaky should be sorted descending').toEqual([...rates].sort((a, b) => b - a));
  });

  test('surfaces the four reliably flaky seeded tests', { tag: ['@api'] }, async ({ api }) => {
    const body = (await (await api.getFlaky()).json()) as FlakyResponse;

    const genuinelyFlaky = body.topFlaky.filter((t) => t.flakeRate > 0);
    expect(genuinelyFlaky.length).toBeGreaterThanOrEqual(SEED.reliablyFlakyCount);
  });

  test('no test reports more failures than runs', { tag: ['@api', '@contract'] }, async ({ api }) => {
    const body = (await (await api.getFlaky()).json()) as FlakyResponse;

    for (const t of body.topFlaky) {
      expect(t.failures, `${t.testId} has more failures than runs`).toBeLessThanOrEqual(t.runs);
    }
  });

  test('is deterministic', { tag: ['@api'] }, async ({ api }) => {
    const [first, second] = await Promise.all([api.getFlaky(), api.getFlaky()]);

    expect(await first.text()).toBe(await second.text());
  });

  test('401s without a token', { tag: ['@api'] }, async ({ anonymousApi }) => {
    const response = await anonymousApi.getFlaky();

    expect(response.status()).toBe(401);
  });
});
