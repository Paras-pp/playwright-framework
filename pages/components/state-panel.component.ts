import type { Locator, Page } from '@playwright/test';

import { NAME } from '../../utils/accessible-names';

/**
 * The four states every Flakeboard route must render: loading, empty, error, success.
 *
 * A component object rather than four copy-pasted locators on four page objects. These
 * are non-semantic wrappers (a spinner div, an error panel), so `data-testid` is the
 * correct choice here — the fallback exists precisely for elements with no role.
 * The retry control is a real `<button>`, so it is located by role.
 */
export class StatePanel {
  readonly loading: Locator;
  readonly empty: Locator;
  readonly error: Locator;
  readonly retryButton: Locator;

  constructor(page: Page) {
    this.loading = page.getByTestId('loading-spinner');
    this.empty = page.getByTestId('empty-state');
    this.error = page.getByTestId('error-state');
    this.retryButton = page.getByRole('button', { name: NAME.retryButton });
  }

  async retry(): Promise<void> {
    await this.retryButton.click();
  }
}
