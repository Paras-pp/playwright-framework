import type { Locator, Page } from '@playwright/test';

import { HEADING, NAME } from '../utils/accessible-names';
import { ROUTES } from '../utils/test-data';
import { BasePage } from './base.page';

/** The `*` route. Small, but it earns a page object so 404 specs read like the others. */
export class NotFoundPage extends BasePage {
  get path(): string {
    return ROUTES.notFound;
  }
  readonly root: Locator;
  readonly backLink: Locator;

  constructor(page: Page) {
    super(page);
    this.root = page.getByRole('heading', { level: 1, name: HEADING.notFound });
    this.backLink = page.getByRole('link', { name: NAME.runsLink });
  }

  /** Navigate to an arbitrary bad URL rather than the canned one. */
  async gotoPath(path: string): Promise<void> {
    await this.page.goto(path);
  }
}
