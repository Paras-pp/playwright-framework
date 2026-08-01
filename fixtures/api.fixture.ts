import { FlakeboardApi } from '../utils/api-client';
import { networkTest } from './network.fixture';

export interface ApiFixtures {
  /** Authenticated API client. Shares the worker's token and HTTP context. */
  api: FlakeboardApi;
  /** Same client with no `Authorization` header, for the 401 paths. */
  anonymousApi: FlakeboardApi;
}

/**
 * API fixtures sit alongside the UI ones in the same `test` object on purpose.
 *
 * That is what makes hybrid tests possible: seed or verify through the API, drive through
 * the UI, in one test, with one login. A test can assert that the runs table shows what
 * `GET /api/runs` actually returned rather than what a fixture file claims it returns.
 */
export const apiTest = networkTest.extend<ApiFixtures>({
  api: async ({ apiContext, authToken }, use) => {
    await use(new FlakeboardApi(apiContext, authToken));
  },
  anonymousApi: async ({ apiContext }, use) => {
    await use(new FlakeboardApi(apiContext));
  },
});
