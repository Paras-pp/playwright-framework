/**
 * Types mirrored from CONTRACT.md.
 *
 * These are hand-written rather than imported from the app on purpose: the suite is a
 * separate repo and an independent observer of the contract. If the app changes a field
 * name, the tests should fail — not silently follow along because they share a type.
 */

export type RunStatus = 'passed' | 'failed' | 'flaky';

/** The only values the status filter accepts; '' means "no filter". */
export type StatusFilter = '' | RunStatus;

export interface Run {
  id: string;
  branch: string;
  commitMessage: string;
  commitSha: string;
  status: RunStatus;
  /** ISO 8601 */
  startedAt: string;
  durationMs: number;
  total: number;
  passed: number;
  failed: number;
  flaky: number;
}

export interface TestResult {
  id: string;
  title: string;
  file: string;
  status: RunStatus;
  durationMs: number;
  retries: number;
  error?: string;
}

export interface RunDetail extends Run {
  tests: TestResult[];
}

export interface RunsPage {
  items: Run[];
  total: number;
  page: number;
  pageSize: number;
}

export interface FlakePoint {
  /** ISO date, YYYY-MM-DD */
  date: string;
  /** 0..1 */
  flakeRate: number;
}

export interface TopFlakyTest {
  testId: string;
  title: string;
  file: string;
  flakeRate: number;
  failures: number;
  runs: number;
}

export interface FlakyResponse {
  series: FlakePoint[];
  topFlaky: TopFlakyTest[];
}

export interface LoginSuccess {
  token: string;
  user: { id: string; name: string; email: string };
}

export interface ApiError {
  error: string;
}

export const isApiError = (body: unknown): body is ApiError =>
  typeof body === 'object' && body !== null && typeof (body as ApiError).error === 'string';
