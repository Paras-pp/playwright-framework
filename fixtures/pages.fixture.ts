import { AppShell } from '../pages/components/app-shell.component';
import { DashboardPage } from '../pages/dashboard.page';
import { LoginPage } from '../pages/login.page';
import { NotFoundPage } from '../pages/not-found.page';
import { RunDetailPage } from '../pages/run-detail.page';
import { RunsListPage } from '../pages/runs-list.page';
import { authTest } from './auth.fixture';

/**
 * Page objects as fixtures.
 *
 * The alternative — `const loginPage = new LoginPage(page)` at the top of every test — is
 * three lines of ceremony per test and a constructor signature change that touches every
 * file. As fixtures they are:
 *
 *   - lazy: a fixture is only constructed if the test actually destructures it, so a test
 *     that asks for `runsPage` never builds the other five,
 *   - typed: `async ({ runsPage }) => ...` autocompletes and fails compilation on a typo,
 *   - swappable: a mobile project could bind the same names to different implementations.
 */
export interface PageObjectFixtures {
  loginPage: LoginPage;
  dashboardPage: DashboardPage;
  runsPage: RunsListPage;
  runDetailPage: RunDetailPage;
  notFoundPage: NotFoundPage;
  appShell: AppShell;
}

export const pagesTest = authTest.extend<PageObjectFixtures>({
  loginPage: async ({ page }, use) => {
    await use(new LoginPage(page));
  },
  dashboardPage: async ({ page }, use) => {
    await use(new DashboardPage(page));
  },
  runsPage: async ({ page }, use) => {
    await use(new RunsListPage(page));
  },
  runDetailPage: async ({ page }, use) => {
    /* Constructed without an id; specs call `gotoRun(id)`. */
    await use(new RunDetailPage(page));
  },
  notFoundPage: async ({ page }, use) => {
    await use(new NotFoundPage(page));
  },
  appShell: async ({ page }, use) => {
    await use(new AppShell(page));
  },
});
