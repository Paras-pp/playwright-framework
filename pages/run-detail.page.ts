import type { Locator, Page } from '@playwright/test';

import { NAME } from '../utils/accessible-names';
import { ROUTES } from '../utils/test-data';
import { BasePage } from './base.page';
import { AppShell } from './components/app-shell.component';

export class RunDetailPage extends BasePage {
  readonly root: Locator;
  readonly shell: AppShell;

  readonly title: Locator;
  readonly testsTable: Locator;
  readonly testRows: Locator;
  readonly backLink: Locator;

  /**
   * Unlike the other pages this one is parameterised, so `path` is derived from the id
   * handed to the constructor. `gotoRun(id)` exists for the common case where a spec
   * gets the page object from a fixture and only learns the id later.
   */
  constructor(
    page: Page,
    private runId: string = '',
  ) {
    super(page);
    this.shell = new AppShell(page);
    this.root = page.getByTestId('run-detail');
    this.title = page.getByTestId('run-detail-title');
    this.testsTable = page.getByTestId('tests-table');
    this.testRows = page.getByTestId('test-row');
    this.backLink = page.getByRole('link', { name: NAME.backToRuns });
  }

  get path(): string {
    return ROUTES.runDetail(this.runId);
  }

  async gotoRun(id: string): Promise<void> {
    this.runId = id;
    await this.goto();
  }

  /* ---------------------------------------------------------------- locators */

  /** The row for a named test. Filtering by text beats indexing by position. */
  testRowByTitle(title: string | RegExp): Locator {
    return this.testRows.filter({ hasText: title });
  }

  statusOf(title: string | RegExp): Locator {
    return this.testRowByTitle(title).getByTestId('test-status');
  }

  errorOf(title: string | RegExp): Locator {
    return this.testRowByTitle(title).getByTestId('test-error');
  }

  /** Every error block on the page, however many tests failed. */
  get errorBlocks(): Locator {
    return this.page.getByTestId('test-error');
  }

  get columnHeaders(): Locator {
    return this.testsTable.getByRole('columnheader');
  }

  async goBackToRuns(): Promise<void> {
    await this.backLink.click();
  }
}
