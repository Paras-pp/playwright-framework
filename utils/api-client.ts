import type { APIRequestContext, APIResponse } from '@playwright/test';

import { API } from './test-data';
import type { StatusFilter } from './types';

export interface RunsQuery {
  search?: string;
  status?: StatusFilter;
  page?: number;
  pageSize?: number;
  /** Artificial failure hooks from CONTRACT.md, e.g. `{ __fail: 500 }`. */
  __fail?: number;
  __slow?: number;
}

/**
 * Typed client for the Flakeboard API.
 *
 * It returns raw `APIResponse` objects rather than parsed bodies: the API specs need to
 * assert on status codes and headers, not just payloads, and a client that swallows the
 * response envelope makes negative testing awkward. Same rule as the page objects —
 * no assertions in here.
 */
export class FlakeboardApi {
  constructor(
    private readonly request: APIRequestContext,
    private readonly token?: string,
  ) {}

  /** A copy of this client that sends a different (or no) bearer token. */
  as(token: string | undefined): FlakeboardApi {
    return new FlakeboardApi(this.request, token);
  }

  private headers(): Record<string, string> {
    return this.token ? { Authorization: `Bearer ${this.token}` } : {};
  }

  login(email: string, password: string): Promise<APIResponse> {
    return this.request.post(API.login, { data: { email, password } });
  }

  listRuns(query: RunsQuery = {}): Promise<APIResponse> {
    const params: Record<string, string | number> = {};
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) params[key] = value as string | number;
    }
    return this.request.get(API.runs, { headers: this.headers(), params });
  }

  getRun(id: string): Promise<APIResponse> {
    return this.request.get(API.run(id), { headers: this.headers() });
  }

  getFlaky(days = 30): Promise<APIResponse> {
    return this.request.get(API.flaky, { headers: this.headers(), params: { days } });
  }

  health(): Promise<APIResponse> {
    return this.request.get(API.health);
  }
}
