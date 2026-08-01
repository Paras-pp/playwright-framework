import type { StatusFilter } from './types';

/**
 * Every literal the suite depends on lives here. Specs read like prose and a contract
 * change is a one-file edit, not a grep-and-pray.
 */

export const CREDENTIALS = {
  valid: {
    email: process.env.E2E_EMAIL ?? 'paras@flakeboard.dev',
    password: process.env.E2E_PASSWORD ?? 'demo1234',
  },
  /** Right shape, wrong values — must 401 per the contract. */
  wrongPassword: { email: 'paras@flakeboard.dev', password: 'not-the-password' },
  unknownUser: { email: 'nobody@flakeboard.dev', password: 'demo1234' },
} as const;

/** localStorage key the app stores the JWT under (CONTRACT.md § Frontend routes). */
export const TOKEN_STORAGE_KEY = 'flakeboard.token';

export const ROUTES = {
  login: '/login',
  dashboard: '/',
  runs: '/runs',
  runDetail: (id: string): string => `/runs/${id}`,
  notFound: '/this-route-does-not-exist',
} as const;

export const API = {
  login: '/api/auth/login',
  runs: '/api/runs',
  run: (id: string): string => `/api/runs/${id}`,
  flaky: '/api/flaky',
  health: '/api/health',
} as const;

/**
 * Glob patterns for page.route(). Deliberately host-agnostic (`**`) so the same
 * interception works against localhost, a preview deploy, or a proxied CI URL.
 */
export const API_GLOB = {
  runsList: '**/api/runs?*',
  /** Matches the collection with or without a query string. */
  runsListAny: '**/api/runs{,?*}',
  runDetail: (id: string): string => `**/api/runs/${id}`,
  runDetailAny: '**/api/runs/*',
  flaky: '**/api/flaky*',
  login: '**/api/auth/login',
} as const;

/** Seed-data facts asserted by the suite. Fixed by CONTRACT.md § Seed data. */
export const SEED = {
  totalRuns: 47,
  defaultPageSize: 10,
  /** ceil(47 / 10) */
  totalPages: 5,
  branches: ['main', 'feat/checkout', 'fix/auth-retry', 'chore/deps'] as const,
  /** ~20 stable tests, 4 of which are reliably flaky. */
  reliablyFlakyCount: 4,
  flakeWindowDays: 30,
} as const;

export const STATUS_FILTERS: readonly StatusFilter[] = ['', 'passed', 'failed', 'flaky'] as const;

/** A run id that is well-formed but cannot exist, for the 404 path. */
export const NON_EXISTENT_RUN_ID = 'run-does-not-exist-000';

/** Query params the server exposes purely so error states are testable end to end. */
export const FAILURE_HOOKS = {
  serverError: '__fail=500',
  slow: '__slow=1',
} as const;
