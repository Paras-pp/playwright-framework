import { expect, test } from '../../fixtures';
import { validateRunsPage } from '../../utils/schema';
import { SEED } from '../../utils/test-data';
import type { ApiError, RunStatus, RunsPage } from '../../utils/types';

test.describe('GET /api/runs', () => {
  test('returns the first page of the seeded runs', { tag: ['@api', '@smoke'] }, async ({ api }) => {
    const response = await api.listRuns();

    expect(response.status()).toBe(200);
    const body = (await response.json()) as RunsPage;
    expect(body.total).toBe(SEED.totalRuns);
    expect(body.page).toBe(1);
    expect(body.pageSize).toBe(SEED.defaultPageSize);
    expect(body.items).toHaveLength(SEED.defaultPageSize);
  });

  test('every run matches the contract shape', { tag: ['@api', '@contract'] }, async ({ api }) => {
    const response = await api.listRuns({ pageSize: SEED.totalRuns });

    /* Custom matcher: prints the offending field path, not "expected [] to equal []". */
    expect(validateRunsPage(await response.json())).toSatisfyContract('GET /api/runs');
  });

  test('is deterministic across identical requests', { tag: ['@api'] }, async ({ api }) => {
    /* The contract promises a seeded PRNG and no Math.random() at request time. If this
     * ever fails, every exact-count assertion in the UI suite becomes flaky — so it is
     * worth one cheap test to catch it at the source. */
    const [first, second] = await Promise.all([api.listRuns(), api.listRuns()]);

    expect(await first.text()).toBe(await second.text());
  });

  test.describe('pagination', () => {
    test('the last page carries the remainder', { tag: ['@api'] }, async ({ api }) => {
      const response = await api.listRuns({ page: SEED.totalPages });

      const body = (await response.json()) as RunsPage;
      expect(body.items).toHaveLength(SEED.totalRuns % SEED.defaultPageSize);
      expect(body.page).toBe(SEED.totalPages);
    });

    test('a page beyond the end is empty, not an error', async ({ api }) => {
      const response = await api.listRuns({ page: 999 });

      expect(response.status()).toBe(200);
      expect(((await response.json()) as RunsPage).items).toHaveLength(0);
    });

    test('pages do not overlap', async ({ api }) => {
      const [p1, p2] = await Promise.all([api.listRuns({ page: 1 }), api.listRuns({ page: 2 })]);

      const idsOne = ((await p1.json()) as RunsPage).items.map((r) => r.id);
      const idsTwo = ((await p2.json()) as RunsPage).items.map((r) => r.id);

      expect(idsOne.filter((id) => idsTwo.includes(id))).toEqual([]);
    });

    test('honours a custom page size', async ({ api }) => {
      const response = await api.listRuns({ pageSize: 5 });

      const body = (await response.json()) as RunsPage;
      expect(body.items).toHaveLength(5);
      expect(body.pageSize).toBe(5);
      expect(body.total).toBe(SEED.totalRuns);
    });
  });

  test.describe('search', () => {
    test('matches a branch name', { tag: ['@api'] }, async ({ api }) => {
      const response = await api.listRuns({ search: 'feat/checkout', pageSize: 50 });

      const { items } = (await response.json()) as RunsPage;
      expect(items.length).toBeGreaterThan(0);
      for (const run of items) {
        expect(
          `${run.branch} ${run.commitMessage}`.toLowerCase(),
          `run ${run.id} matched the search but contains neither term`,
        ).toContain('feat/checkout');
      }
    });

    test('is case-insensitive', async ({ api }) => {
      const [lower, upper] = await Promise.all([
        api.listRuns({ search: 'main' }),
        api.listRuns({ search: 'MAIN' }),
      ]);

      expect(((await lower.json()) as RunsPage).total).toBe(
        ((await upper.json()) as RunsPage).total,
      );
    });

    test('matches commit messages as well as branches', async ({ api }) => {
      const response = await api.listRuns({ search: 'fix', pageSize: 50 });

      const { items } = (await response.json()) as RunsPage;
      expect(items.length).toBeGreaterThan(0);
      expect(items.some((r) => r.commitMessage.toLowerCase().includes('fix'))).toBeTruthy();
    });

    test('returns an empty page for no matches', async ({ api }) => {
      const response = await api.listRuns({ search: 'zzz-no-such-branch-zzz' });

      expect(response.status()).toBe(200);
      const body = (await response.json()) as RunsPage;
      expect(body.items).toHaveLength(0);
      expect(body.total).toBe(0);
    });
  });

  test.describe('status filter', () => {
    const statuses: readonly RunStatus[] = ['passed', 'failed', 'flaky'];

    for (const status of statuses) {
      test(`returns only ${status} runs`, { tag: ['@api'] }, async ({ api }) => {
        const response = await api.listRuns({ status, pageSize: 50 });

        const { items } = (await response.json()) as RunsPage;
        expect(items.length).toBeGreaterThan(0);
        expect(items.map((r) => r.status)).toEqual(items.map(() => status));
      });
    }

    test('the three statuses partition the whole set', async ({ api }) => {
      const responses = await Promise.all(statuses.map((status) => api.listRuns({ status })));
      const totals = await Promise.all(
        responses.map(async (r) => ((await r.json()) as RunsPage).total),
      );

      expect(totals.reduce((a, b) => a + b, 0)).toBe(SEED.totalRuns);
    });

    test('an empty status means no filter', async ({ api }) => {
      const response = await api.listRuns({ status: '' });

      expect(((await response.json()) as RunsPage).total).toBe(SEED.totalRuns);
    });

    test('composes with search', async ({ api }) => {
      const response = await api.listRuns({ search: 'main', status: 'flaky', pageSize: 50 });

      const { items } = (await response.json()) as RunsPage;
      for (const run of items) {
        expect(run.status).toBe('flaky');
        expect(`${run.branch} ${run.commitMessage}`.toLowerCase()).toContain('main');
      }
    });
  });

  test.describe('failure hooks', () => {
    test('__fail=500 returns a server error envelope', { tag: ['@api', '@states'] }, async ({
      api,
    }) => {
      const response = await api.listRuns({ __fail: 500 });

      expect(response.status()).toBe(500);
      expect((await response.json()) as ApiError).toEqual({ error: 'server_error' });
    });

    test('__slow=1 delays but still succeeds', { tag: ['@api', '@states'] }, async ({ api }) => {
      const startedAt = Date.now();
      const response = await api.listRuns({ __slow: 1 });
      const elapsed = Date.now() - startedAt;

      expect(response.status()).toBe(200);
      /* Measuring elapsed time is fine; *sleeping* for it is not. The lower bound is
       * loose (1.5s against a promised 2s) so a fast machine cannot make it flaky. */
      expect(elapsed).toBeGreaterThan(1_500);
    });
  });
});
