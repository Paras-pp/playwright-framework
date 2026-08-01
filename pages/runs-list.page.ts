import type { Locator, Page, Response } from '@playwright/test';

import { NAME } from '../utils/accessible-names';
import { API_GLOB, ROUTES } from '../utils/test-data';
import type { StatusFilter } from '../utils/types';
import { BasePage } from './base.page';
import { AppShell } from './components/app-shell.component';

export class RunsListPage extends BasePage {
  get path(): string {
    return ROUTES.runs;
  }
  readonly root: Locator;
  readonly shell: AppShell;

  readonly table: Locator;
  readonly rows: Locator;

  readonly searchInput: Locator;
  readonly statusFilter: Locator;

  readonly pagination: Locator;
  readonly nextPageButton: Locator;
  readonly previousPageButton: Locator;
  readonly pageIndicator: Locator;

  constructor(page: Page) {
    super(page);
    this.shell = new AppShell(page);
    this.root = page.getByTestId('runs-table');

    this.table = page.getByTestId('runs-table');
    this.rows = page.getByTestId('run-row');

    /* Labelled form controls → getByLabel. Never a CSS chain like
     * `.filters > div:nth-child(2) input`, which is the classic Selenium habit that
     * breaks the moment a designer adds a wrapper div. */
    this.searchInput = page.getByLabel(NAME.searchField);
    this.statusFilter = page.getByLabel(NAME.statusFilter);

    this.pagination = page.getByTestId('pagination');
    this.nextPageButton = page.getByTestId('page-next');
    this.previousPageButton = page.getByTestId('page-prev');
    this.pageIndicator = page.getByTestId('page-indicator');
  }

  /* ------------------------------------------------------------------ actions */

  async search(term: string): Promise<void> {
    await this.searchInput.fill(term);
  }

  async clearSearch(): Promise<void> {
    await this.searchInput.clear();
  }

  async filterByStatus(status: StatusFilter): Promise<void> {
    await this.statusFilter.selectOption(status);
  }

  async goToNextPage(): Promise<void> {
    await this.nextPageButton.click();
  }

  async goToPreviousPage(): Promise<void> {
    await this.previousPageButton.click();
  }

  async openRunAt(index: number): Promise<void> {
    await this.rows.nth(index).getByRole('link').first().click();
  }

  async openRunByBranch(branch: string): Promise<void> {
    await this.rowByBranch(branch).getByRole('link').first().click();
  }

  /**
   * Performs `action` and resolves once the runs request it triggers has come back.
   *
   * This is the disciplined alternative to sleeping after a filter change. It waits on a
   * real event — the response — rather than on the clock, so it is as fast as the app is
   * and never flaky on a slow machine.
   */
  async waitForRunsResponse(action: () => Promise<void>): Promise<Response> {
    const [response] = await Promise.all([
      this.page.waitForResponse(
        (res) => res.url().includes('/api/runs?') || res.url().endsWith('/api/runs'),
      ),
      action(),
    ]);
    return response;
  }

  /* ---------------------------------------------------------------- locators */

  rowByBranch(branch: string): Locator {
    return this.rows.filter({ hasText: branch });
  }

  /** A cell inside a row, located by its accessible name. */
  cell(row: Locator, cellName: string | RegExp): Locator {
    return row.getByRole('cell', { name: cellName });
  }

  get columnHeaders(): Locator {
    return this.table.getByRole('columnheader');
  }

  /** Row count right now. A read, not an assertion — the spec still does the asserting. */
  rowCount(): Promise<number> {
    return this.rows.count();
  }

  /**
   * Text of every visible row, top to bottom.
   *
   * Returns whole-row text rather than reaching into a specific `<td>` by position:
   * column order is a presentational detail the contract does not pin down, so a spec
   * asserting "this row mentions feat/checkout" stays green through a column reshuffle
   * while still failing if the wrong run is listed.
   */
  async rowTexts(): Promise<string[]> {
    return this.rows.allInnerTexts();
  }

  /** The glob a spec should intercept to control this page's data. */
  static readonly apiGlob = API_GLOB.runsListAny;
}
