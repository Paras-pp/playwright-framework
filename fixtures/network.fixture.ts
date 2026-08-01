import { ApiMock } from '../utils/network';
import { pagesTest } from './pages.fixture';

export interface NetworkFixtures {
  /** Route-level control over every Flakeboard endpoint. See utils/network.ts. */
  mock: ApiMock;
  /**
   * Console errors emitted during the test, in order.
   *
   * Opt-in rather than an automatic global check: turning every stray console warning
   * into a failure is how a suite earns a reputation for crying wolf. The specs that
   * care assert on it explicitly.
   */
  consoleErrors: string[];
}

export const networkTest = pagesTest.extend<NetworkFixtures>({
  mock: async ({ page }, use) => {
    const mock = new ApiMock(page);
    await use(mock);
    /* Tear interception down after the test so a leaked route cannot bleed into the
     * next test in the same worker — the classic source of "passes alone, fails in suite". */
    await mock.reset();
  },

  consoleErrors: async ({ page }, use) => {
    const errors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    page.on('pageerror', (error) => errors.push(error.message));
    await use(errors);
  },
});
