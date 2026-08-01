import type { Page, Request, Route } from '@playwright/test';

import { API_GLOB } from './test-data';
import type { FlakyResponse, RunDetail, RunsPage } from './types';

/** Handle returned by {@link ApiMock.stall} — call it to let the held request through. */
export type ReleaseFn = () => void;

/** Live counter returned by {@link ApiMock.track}. */
export interface RequestCounter {
  readonly count: number;
  readonly urls: readonly string[];
}

const JSON_HEADERS = { 'content-type': 'application/json' } as const;

/**
 * A small facade over `page.route()`.
 *
 * Why this exists: `route.fulfill()` calls are noisy and every spec would otherwise
 * re-declare the same JSON headers, the same glob, the same status codes. Pushing them
 * behind intention-revealing names (`mock.runsFail(500)`, `mock.runsEmpty()`) keeps the
 * spec about behaviour and makes the interception layer swappable in one place.
 *
 * Three distinct tools, deliberately:
 *   fulfill — replace the response (empty results, exact payloads, error bodies)
 *   abort   — kill the connection (the "user's wifi died" case, which is NOT a 500)
 *   stall   — hold the request open until the test says go (loading states with no timers)
 */
export class ApiMock {
  constructor(private readonly page: Page) {}

  /* ------------------------------------------------------------------ generic */

  /** Fulfil any glob with a JSON body. */
  async json(glob: string, body: unknown, status = 200): Promise<void> {
    await this.page.route(glob, async (route: Route) => {
      await route.fulfill({ status, headers: { ...JSON_HEADERS }, body: JSON.stringify(body) });
    });
  }

  /** Respond with an error envelope in the contract's shape: `{ error: string }`. */
  async fail(glob: string, status: number, error = 'server_error'): Promise<void> {
    await this.json(glob, { error }, status);
  }

  /** Simulate a dropped connection rather than an HTTP error. */
  async abort(glob: string, errorCode: 'failed' | 'connectionrefused' | 'timedout' = 'failed'): Promise<void> {
    await this.page.route(glob, (route: Route) => route.abort(errorCode));
  }

  /**
   * Hold the next matching request open. The returned function releases it, after which
   * the request continues to the real server.
   *
   * This is how the suite tests loading states with ZERO `waitForTimeout`: the spec
   * controls the clock explicitly instead of guessing at a sleep long enough to be
   * reliable and short enough to be bearable.
   */
  async stall(glob: string, times = 1): Promise<ReleaseFn> {
    let release: ReleaseFn = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    await this.page.route(
      glob,
      async (route: Route) => {
        await gate;
        await route.fallback();
      },
      { times },
    );

    return release;
  }

  /**
   * Fail the first `times` attempts, then let everything through.
   * Exactly what you need to prove a retry button actually retries.
   */
  async failThenRecover(glob: string, times = 1, status = 500): Promise<void> {
    await this.page.route(
      glob,
      async (route: Route) => {
        await route.fulfill({
          status,
          headers: { ...JSON_HEADERS },
          body: JSON.stringify({ error: 'server_error' }),
        });
      },
      { times },
    );
  }

  /** Count matching requests without modifying them. Useful for "did it refetch?". */
  async track(glob: string): Promise<RequestCounter> {
    const urls: string[] = [];
    await this.page.route(glob, async (route: Route) => {
      urls.push(route.request().url());
      await route.fallback();
    });
    return {
      get count() {
        return urls.length;
      },
      get urls() {
        return [...urls];
      },
    };
  }

  /** Remove every interception this page has installed. */
  async reset(): Promise<void> {
    await this.page.unrouteAll({ behavior: 'ignoreErrors' });
  }

  /* ------------------------------------------------------- contract shortcuts */

  runs(payload: RunsPage): Promise<void> {
    return this.json(API_GLOB.runsListAny, payload);
  }

  runsEmpty(): Promise<void> {
    return this.json(API_GLOB.runsListAny, { items: [], total: 0, page: 1, pageSize: 10 });
  }

  runsFail(status = 500, error = 'server_error'): Promise<void> {
    return this.fail(API_GLOB.runsListAny, status, error);
  }

  runsAbort(): Promise<void> {
    return this.abort(API_GLOB.runsListAny);
  }

  runsStall(): Promise<ReleaseFn> {
    return this.stall(API_GLOB.runsListAny);
  }

  runDetail(id: string, payload: RunDetail): Promise<void> {
    return this.json(API_GLOB.runDetail(id), payload);
  }

  runDetailNotFound(id: string): Promise<void> {
    return this.fail(API_GLOB.runDetail(id), 404, 'not_found');
  }

  flaky(payload: FlakyResponse): Promise<void> {
    return this.json(API_GLOB.flaky, payload);
  }

  flakyFail(status = 500): Promise<void> {
    return this.fail(API_GLOB.flaky, status);
  }

  flakyStall(): Promise<ReleaseFn> {
    return this.stall(API_GLOB.flaky);
  }
}

/** Read the query string off an intercepted request. */
export const queryOf = (request: Request): URLSearchParams =>
  new URL(request.url()).searchParams;
