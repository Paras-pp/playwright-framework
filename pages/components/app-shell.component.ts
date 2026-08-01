import type { Locator, Page } from '@playwright/test';

import { NAME } from '../../utils/accessible-names';

/**
 * Persistent chrome: the nav landmark, the user menu and logout.
 *
 * Composed into the authenticated page objects rather than inherited, because "the app
 * shell is on this page" is a has-a relationship. Inheriting it would also put shell
 * locators on the login page, where they do not exist.
 */
export class AppShell {
  readonly root: Locator;
  readonly nav: Locator;
  readonly dashboardLink: Locator;
  readonly runsLink: Locator;
  readonly userMenu: Locator;
  readonly logoutButton: Locator;

  constructor(page: Page) {
    this.root = page.getByTestId('app-shell');
    this.nav = page.getByRole('navigation');
    /* Real links inside a <nav> — role first, testid never needed. */
    this.dashboardLink = this.nav.getByRole('link', { name: NAME.dashboardLink });
    this.runsLink = this.nav.getByRole('link', { name: NAME.runsLink });
    this.userMenu = page.getByTestId('user-menu');
    this.logoutButton = page.getByRole('button', { name: NAME.logoutButton });
  }

  async goToDashboard(): Promise<void> {
    await this.dashboardLink.click();
  }

  async goToRuns(): Promise<void> {
    await this.runsLink.click();
  }

  /**
   * Opens the user menu if the logout control is not already exposed, then logs out.
   * The conditional is a visibility read, not a wait — the menu may be a disclosure on
   * narrow viewports and always-open on wide ones.
   */
  async logout(): Promise<void> {
    if (!(await this.logoutButton.isVisible())) {
      await this.userMenu.click();
    }
    await this.logoutButton.click();
  }
}
