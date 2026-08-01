import type { Locator, Page } from '@playwright/test';

import { StatePanel } from './components/state-panel.component';

/**
 * Base for every page object.
 *
 * Rules this layer obeys, without exception:
 *
 *  1. NO ASSERTIONS. A page object that asserts hides the reason a test exists inside a
 *     class, produces failure messages pointing at the page object instead of the spec,
 *     and quietly makes every method a potential test failure. Page objects expose
 *     locators and actions; specs decide what "correct" means.
 *  2. NO WAITS. No `waitForTimeout`, no `waitForSelector`. Locators are lazy and
 *     Playwright auto-waits at the point of use, so a page object that waits is
 *     pre-empting the spec's assertion — and doing it worse.
 *  3. Locators are exposed as readonly properties, not getters that re-query. A Locator
 *     is a description, not a snapshot: building it once is safe and it re-resolves on
 *     every use.
 */
export abstract class BasePage {
  /** Loading / empty / error / retry, present on every route by contract. */
  readonly state: StatePanel;

  /** The `<main>` landmark. Every route renders exactly one. */
  readonly main: Locator;

  protected constructor(readonly page: Page) {
    this.state = new StatePanel(page);
    this.main = page.getByRole('main');
  }

  /**
   * Route this page lives at, relative to `baseURL`.
   *
   * Declared as an accessor rather than a field: `RunDetailPage` derives its path from a
   * run id, so it implements this as a getter. A field declaration here would emit
   * `this.path = undefined` in this constructor and throw against that getter.
   */
  abstract get path(): string;

  /** The element whose visibility proves this page has rendered. */
  abstract readonly root: Locator;

  /** The single `<h1>` for this route. */
  get heading(): Locator {
    return this.page.getByRole('heading', { level: 1 });
  }

  async goto(): Promise<void> {
    await this.page.goto(this.path);
  }

  /** Reload without losing the page object. Used by session-persistence specs. */
  async reload(): Promise<void> {
    await this.page.reload();
  }
}
