import type {
  FlakyResponse,
  Run,
  RunDetail,
  RunsPage,
  RunStatus,
  TestResult,
  TopFlakyTest,
} from './types';

/**
 * Deterministic builders for contract-shaped payloads.
 *
 * Used only by the network-interception specs: when a test is about the UI's reaction to
 * a payload (empty list, 500, a run whose every test failed), inventing the payload is
 * faster, clearer and infinitely more stable than steering the real server into that state.
 *
 * No randomness anywhere. A factory that calls Math.random() is a flaky test with extra steps.
 */

let sequence = 0;
const nextId = (prefix: string): string => `${prefix}-${String(++sequence).padStart(4, '0')}`;

/** Fixed clock so snapshots and date assertions never drift. */
const EPOCH = Date.parse('2026-07-01T09:00:00.000Z');

export const isoAt = (dayOffset: number): string =>
  new Date(EPOCH + dayOffset * 24 * 60 * 60 * 1000).toISOString();

export function makeRun(overrides: Partial<Run> = {}): Run {
  const base: Run = {
    id: nextId('run'),
    branch: 'main',
    commitMessage: 'chore: bump playwright to 1.62',
    commitSha: 'a1b2c3d',
    status: 'passed',
    startedAt: isoAt(0),
    durationMs: 184_000,
    total: 20,
    passed: 20,
    failed: 0,
    flaky: 0,
  };
  return { ...base, ...overrides };
}

export function makeTest(overrides: Partial<TestResult> = {}): TestResult {
  const base: TestResult = {
    id: nextId('test'),
    title: 'checkout applies the discount code',
    file: 'tests/checkout/discount.spec.ts',
    status: 'passed',
    durationMs: 1_240,
    retries: 0,
  };
  return { ...base, ...overrides };
}

export function makeFailingTest(overrides: Partial<TestResult> = {}): TestResult {
  return makeTest({
    status: 'failed',
    retries: 2,
    error:
      'TimeoutError: locator.click: Timeout 10000ms exceeded.\n' +
      "Call log:\n  - waiting for getByRole('button', { name: 'Apply' })\n" +
      '    - locator resolved to hidden <button disabled>Apply</button>',
    ...overrides,
  });
}

export function makeRunDetail(overrides: Partial<RunDetail> = {}): RunDetail {
  const tests = overrides.tests ?? [makeTest(), makeTest(), makeFailingTest()];
  const counts = countByStatus(tests);
  return {
    ...makeRun({
      total: tests.length,
      passed: counts.passed,
      failed: counts.failed,
      flaky: counts.flaky,
      status: counts.failed > 0 ? 'failed' : counts.flaky > 0 ? 'flaky' : 'passed',
    }),
    ...overrides,
    tests,
  };
}

function countByStatus(tests: readonly TestResult[]): Record<RunStatus, number> {
  return tests.reduce<Record<RunStatus, number>>(
    (acc, t) => ({ ...acc, [t.status]: acc[t.status] + 1 }),
    { passed: 0, failed: 0, flaky: 0 },
  );
}

/** A full page envelope. `items` defaults to `count` runs so callers stay terse. */
export function makeRunsPage(overrides: Partial<RunsPage> & { count?: number } = {}): RunsPage {
  const { count = 3, ...rest } = overrides;
  const items = rest.items ?? Array.from({ length: count }, () => makeRun());
  return {
    items,
    total: rest.total ?? items.length,
    page: rest.page ?? 1,
    pageSize: rest.pageSize ?? 10,
  };
}

export const emptyRunsPage = (): RunsPage => makeRunsPage({ items: [], total: 0 });

export function makeTopFlaky(overrides: Partial<TopFlakyTest> = {}): TopFlakyTest {
  return {
    testId: nextId('test'),
    title: 'auth retries the refresh token once',
    file: 'tests/auth/refresh.spec.ts',
    flakeRate: 0.32,
    failures: 12,
    runs: 38,
    ...overrides,
  };
}

export function makeFlakyResponse(overrides: Partial<FlakyResponse> = {}): FlakyResponse {
  return {
    series:
      overrides.series ??
      Array.from({ length: 30 }, (_, i) => ({
        date: isoAt(i - 29).slice(0, 10),
        flakeRate: Number((0.05 + (i % 7) * 0.01).toFixed(3)),
      })),
    topFlaky: overrides.topFlaky ?? Array.from({ length: 5 }, () => makeTopFlaky()),
  };
}

/** Reset the id counter so a spec can assert on exact generated ids. */
export const resetFactorySequence = (): void => {
  sequence = 0;
};
