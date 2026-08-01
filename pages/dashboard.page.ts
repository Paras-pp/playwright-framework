import type { Locator, Page } from '@playwright/test';

import { ROUTES } from '../utils/test-data';
import { BasePage } from './base.page';
import { AppShell } from './components/app-shell.component';

export class DashboardPage extends BasePage {
  get path(): string {
    return ROUTES.dashboard;
  }
  readonly root: Locator;
  readonly shell: AppShell;

  /* An SVG chart has no ARIA role worth locating by, so testid is the right tool.
   * This is what "testid as a fallback" means in practice — not a default. */
  readonly chart: Locator;
  readonly chartPoints: Locator;

  readonly statTotalRuns: Locator;
  readonly statFlakeRate: Locator;
  readonly statAvgDuration: Locator;

  /* A real <table>, so role-based locators work and also prove the semantics. */
  readonly topFlakyTable: Locator;
  readonly topFlakyRows: Locator;

  constructor(page: Page) {
    super(page);
    this.shell = new AppShell(page);
    this.root = page.getByTestId('app-shell');

    this.chart = page.getByTestId('flake-chart');
    this.chartPoints = page.getByTestId('flake-chart-point');

    this.statTotalRuns = page.getByTestId('stat-total-runs');
    this.statFlakeRate = page.getByTestId('stat-flake-rate');
    this.statAvgDuration = page.getByTestId('stat-avg-duration');

    this.topFlakyTable = page.getByTestId('top-flaky-table');
    this.topFlakyRows = page.getByTestId('top-flaky-row');
  }

  /** All three stat tiles, in DOM order. Handy for a single "tiles render" assertion. */
  get statTiles(): readonly Locator[] {
    return [this.statTotalRuns, this.statFlakeRate, this.statAvgDuration];
  }

  /** Row in the top-flaky table whose test title matches. */
  flakyRowByTitle(title: string | RegExp): Locator {
    return this.topFlakyRows.filter({ hasText: title });
  }

  /** Column header cells of the top-flaky table, located by table semantics. */
  get topFlakyHeaders(): Locator {
    return this.topFlakyTable.getByRole('columnheader');
  }
}
