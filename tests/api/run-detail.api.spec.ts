import { expect, test } from '../../fixtures';
import type { FlakeboardApi } from '../../utils/api-client';
import { validateRunDetail } from '../../utils/schema';
import { NON_EXISTENT_RUN_ID, SEED } from '../../utils/test-data';
import type { ApiError, RunDetail, RunsPage } from '../../utils/types';

/** Fetch a real run id once per test rather than hard-coding one the seed may renumber. */
async function firstRunId(api: FlakeboardApi): Promise<string> {
  const response = await api.listRuns({ pageSize: 1 });
  const { items } = (await response.json()) as RunsPage;
  const run = items[0];
  if (!run) throw new Error('seed data contains no runs — cannot test run detail');
  return run.id;
}

test.describe('GET /api/runs/:id', () => {
  test('returns a run with its tests', { tag: ['@api', '@smoke'] }, async ({ api }) => {
    const id = await firstRunId(api);

    const response = await api.getRun(id);

    expect(response.status()).toBe(200);
    const detail = (await response.json()) as RunDetail;
    expect(detail.id).toBe(id);
    expect(Array.isArray(detail.tests)).toBeTruthy();
    expect(detail.tests.length).toBeGreaterThan(0);
  });

  test('matches the RunDetail contract', { tag: ['@api', '@contract'] }, async ({ api }) => {
    const id = await firstRunId(api);

    const response = await api.getRun(id);

    expect(validateRunDetail(await response.json())).toSatisfyContract(`GET /api/runs/${id}`);
  });

  test('test ids are unique within a run', { tag: ['@api'] }, async ({ api }) => {
    const id = await firstRunId(api);

    const detail = (await (await api.getRun(id)).json()) as RunDetail;

    expect(new Set(detail.tests.map((t) => t.id)).size).toBe(detail.tests.length);
  });

  test('failing tests carry error output', { tag: ['@api'] }, async ({ api }) => {
    /* Find a run the API itself calls failed, then insist it can explain why.
     * "The build is red and nobody can tell you which assertion blew up" is the exact
     * pain this product exists to remove, so it gets a test. */
    const failed = (await (await api.listRuns({ status: 'failed', pageSize: 1 })).json()) as RunsPage;
    const run = failed.items[0];
    expect(run, 'seed should contain at least one failed run').toBeDefined();

    const detail = (await (await api.getRun(run!.id)).json()) as RunDetail;
    const failingTests = detail.tests.filter((t) => t.status === 'failed');

    expect(failingTests.length).toBeGreaterThan(0);
    for (const t of failingTests) {
      expect(t.error, `test ${t.id} failed without an error message`).toBeTruthy();
    }
  });

  test('flaky tests report at least one retry', { tag: ['@api'] }, async ({ api }) => {
    const flakyRuns = (await (await api.listRuns({ status: 'flaky', pageSize: 1 })).json()) as RunsPage;
    const run = flakyRuns.items[0];
    expect(run, 'seed should contain at least one flaky run').toBeDefined();

    const detail = (await (await api.getRun(run!.id)).json()) as RunDetail;

    for (const t of detail.tests.filter((x) => x.status === 'flaky')) {
      expect(t.retries, `flaky test ${t.id} reports no retries`).toBeGreaterThan(0);
    }
  });

  test('the summary counts reconcile with the test list', { tag: ['@api', '@contract'] }, async ({
    api,
  }) => {
    const id = await firstRunId(api);
    const detail = (await (await api.getRun(id)).json()) as RunDetail;

    const counted = {
      passed: detail.tests.filter((t) => t.status === 'passed').length,
      failed: detail.tests.filter((t) => t.status === 'failed').length,
      flaky: detail.tests.filter((t) => t.status === 'flaky').length,
    };

    expect({ passed: detail.passed, failed: detail.failed, flaky: detail.flaky }).toEqual(counted);
    expect(detail.total).toBe(detail.tests.length);
  });

  test('404s for an unknown id', { tag: ['@api', '@states'] }, async ({ api }) => {
    const response = await api.getRun(NON_EXISTENT_RUN_ID);

    expect(response.status()).toBe(404);
    expect((await response.json()) as ApiError).toEqual({ error: 'not_found' });
  });

  test('401s without a token', { tag: ['@api'] }, async ({ anonymousApi }) => {
    const response = await anonymousApi.getRun(NON_EXISTENT_RUN_ID);

    /* Auth is checked before existence — a 404 here would leak which ids exist. */
    expect(response.status()).toBe(401);
  });

  test('every seeded run is individually retrievable', { tag: ['@api'] }, async ({ api }) => {
    const page = (await (await api.listRuns({ pageSize: SEED.totalRuns })).json()) as RunsPage;

    const statuses = await Promise.all(
      page.items.map(async (run) => (await api.getRun(run.id)).status()),
    );

    expect(statuses.filter((s) => s !== 200)).toEqual([]);
    expect(statuses).toHaveLength(SEED.totalRuns);
  });
});
