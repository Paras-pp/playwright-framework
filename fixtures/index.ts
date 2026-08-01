import { expect as baseExpect } from '@playwright/test';

import { apiTest } from './api.fixture';
import type { Violations } from '../utils/schema';

/**
 * The single `test` object every spec imports.
 *
 *   import { test, expect } from '../../fixtures';
 *
 * Composition is a linear chain — options → auth → pages → network → api — rather than
 * `mergeTests()`. `mergeTests` is for combining fixture trees that were written
 * independently; ours all descend from the same `optionsTest` root because they genuinely
 * depend on each other (the API client needs the worker token, which needs the API
 * origin option). Chaining keeps that dependency order explicit and the types exact.
 *
 * The upshot: one import, full type inference, and adding a fixture never touches a spec.
 */
export const test = apiTest;

/**
 * `expect` with one project-specific matcher.
 *
 * Custom matchers earn their place when the same three-line assertion appears in a dozen
 * specs AND the default failure message is unhelpful. `toSatisfyContract` prints the exact
 * field that violated the contract instead of "expected [] to equal []".
 */
export const expect = baseExpect.extend({
  toSatisfyContract(violations: Violations, label = 'payload') {
    const pass = violations.length === 0;
    return {
      pass,
      name: 'toSatisfyContract',
      message: () =>
        pass
          ? `Expected ${label} to violate the contract, but it was valid.`
          : `${label} violated CONTRACT.md:\n` + violations.map((v) => `  • ${v}`).join('\n'),
    };
  },
});

export { STORAGE_STATE, STORAGE_STATE_ANONYMOUS } from './auth.fixture';
export type { FlakeboardOptions } from './options.fixture';
export type { PageObjectFixtures } from './pages.fixture';
export type { NetworkFixtures } from './network.fixture';
export type { ApiFixtures } from './api.fixture';
