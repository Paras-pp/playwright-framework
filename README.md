# Flakeboard E2E — Playwright + TypeScript

End-to-end test framework for [Flakeboard](../flakeboard), a dashboard for flaky-test
triage. 288 tests across three browsers plus a browserless API project, built to
demonstrate framework architecture rather than a pile of specs.

> **Coming from Selenium?** [MIGRATION.md](./MIGRATION.md) writes six of these tests both
> ways — Selenium/Java/JUnit and Playwright/TypeScript, in full — and argues honestly about
> where Selenium is still the right choice.

---

## What this demonstrates

| Topic | Where to look |
|---|---|
| Page Object Model, assertion-free | [`pages/`](./pages) — one class per route, plus component objects |
| Custom typed fixtures | [`fixtures/`](./fixtures) — options → auth → pages → network → api |
| Auth once via `storageState` | [`tests/auth.setup.ts`](./tests/auth.setup.ts) + the `setup` project |
| Worker-scoped fixtures | `apiContext`, `authToken` in [`fixtures/auth.fixture.ts`](./fixtures/auth.fixture.ts) |
| Role/label-first locators | [`utils/accessible-names.ts`](./utils/accessible-names.ts), every page object |
| Zero hard waits | Enforced by a CI step, not by convention |
| Network interception | [`utils/network.ts`](./utils/network.ts) — fulfill, abort, stall, fail-then-recover |
| Deterministic loading states | `mock.stall()` holds a request open and releases it on command |
| API tests in the same runner | [`tests/api/`](./tests/api) — 50 tests, no browser |
| Contract validation | [`utils/schema.ts`](./utils/schema.ts) + a custom `toSatisfyContract` matcher |
| ARIA snapshot assertions | Login form, run-detail table, top-flaky table |
| Cross-browser projects | chromium, firefox, webkit |
| Sharding + merged reports | [`.github/workflows/e2e.yml`](./.github/workflows/e2e.yml), 4 shards |
| Traces on failure | `trace: 'on-first-retry'` |

---

## Architecture

```
playwright-framework/
├── playwright.config.ts      projects, sharding, reporters, webServer
├── fixtures/                 the composition root
│   ├── options.fixture.ts    typed custom option: apiBaseURL
│   ├── auth.fixture.ts       storageState paths, worker-scoped API context + token
│   ├── pages.fixture.ts      page objects, lazily constructed per test
│   ├── network.fixture.ts    the ApiMock facade + console-error collection
│   ├── api.fixture.ts        authenticated / anonymous API clients
│   └── index.ts              the single `test` + `expect` every spec imports
├── pages/                    page objects — locators and actions, NO assertions
│   ├── base.page.ts          goto, heading, main landmark, shared state panel
│   ├── login.page.ts
│   ├── dashboard.page.ts
│   ├── runs-list.page.ts
│   ├── run-detail.page.ts
│   ├── not-found.page.ts
│   └── components/           app-shell (nav), state-panel (loading/empty/error/retry)
├── utils/
│   ├── types.ts              contract types, hand-written on purpose
│   ├── test-data.ts          credentials, routes, API globs, seed facts
│   ├── accessible-names.ts   the accessible names locators depend on, in one file
│   ├── factories.ts          deterministic payload builders — no Math.random()
│   ├── network.ts            ApiMock: fulfill / abort / stall / failThenRecover / track
│   ├── api-client.ts         typed client over APIRequestContext
│   └── schema.ts             field-by-field contract validation
├── tests/
│   ├── auth.setup.ts         logs in ONCE, writes playwright/.auth/user.json
│   ├── auth/                 login (11) + session & route protection (10)
│   ├── runs/                 list behaviour (19) + states via interception (10)
│   ├── run-detail/           detail rendering, 404, error output (11)
│   ├── dashboard/            chart, stat tiles, top-flaky table (13)
│   ├── navigation/           SPA routing, back/forward, 404 route (5)
│   └── api/                  browserless contract tests (50)
└── .github/workflows/e2e.yml
```

### Three decisions worth explaining

**Fixtures over a base class.** There is no `BaseTest`. A spec declares what it needs —
`async ({ runsPage, mock, api }) => …` — and gets exactly those, constructed in dependency
order with teardown attached. Nothing else is built. Adding a fixture touches one file and
zero specs. The chain is linear (`options → auth → pages → network → api`) rather than
`mergeTests`, because these genuinely depend on each other: the API client needs the worker
token, which needs the API origin option.

**Authentication is a project dependency, not a hook.** `tests/auth.setup.ts` logs in
through the real UI once and saves cookies + `localStorage` to `playwright/.auth/user.json`.
The three browser projects declare `dependencies: ['setup']` and `storageState`. That
removes ~237 logins from a full run, and — more importantly — 237 chances for an unrelated
login hiccup to fail a test that was never about login. Specs that must be logged out say so
explicitly at the top of the file:

```ts
test.use({ storageState: STORAGE_STATE_ANONYMOUS });
```

**No hard waits, enforced.** There is no `waitForTimeout` anywhere in `tests/`, `pages/`,
`fixtures/` or `utils/`, and CI fails the build if one appears:

```bash
npm run lint:no-hard-waits   # grep -rn 'waitForTimeout' … must find nothing
```

Loading states are still tested — deterministically — by holding a request open and
releasing it when the test says so:

```ts
const release = await mock.runsStall();
await runsPage.goto();
await expect(runsPage.state.loading).toBeVisible();  // cannot race: the request is pinned
release();
await expect(runsPage.table).toBeVisible();
```

### Locator strategy

In order of preference, and the reason for each:

1. `getByRole` — ties the test to what a user perceives, and fails when a `<div onClick>`
   pretends to be a button.
2. `getByLabel` — for form fields. If Playwright cannot find it by label, a screen reader
   cannot name it either.
3. `getByText` / `getByPlaceholder` — content.
4. `getByTestId` — the deliberate fallback for elements with no semantics: the SVG chart,
   the spinner, stat tiles, table-row wrappers. Documented in `CONTRACT.md`, not a default.
5. CSS — only within a component's own subtree.
6. XPath — never.

Composition replaces selector chains:

```ts
runsPage.rows.filter({ hasText: 'feat/checkout' }).getByRole('link').first();
runsPage.rows.filter({ hasNotText: branch });   // should be none, and toHaveCount(0) retries
```

Accessible names live in [`utils/accessible-names.ts`](./utils/accessible-names.ts) so a copy
change is a one-line diff rather than a repo-wide `sed`.

---

## Running it

### Prerequisites

- Node 20+
- The app under test checked out as a sibling directory (`../flakeboard`)

```bash
npm ci
npx playwright install --with-deps
```

`playwright.config.ts` starts the app for you (`npm run dev --prefix ../flakeboard`) and
waits on `GET /api/health` before the first test — no sleep-and-hope step. Set
`PW_SKIP_WEBSERVER=1` if you are managing the app yourself.

### Common commands

```bash
npm test                      # everything: setup, api, chromium, firefox, webkit
npm run test:chromium         # one browser
npm run test:api              # 50 API tests, no browser, ~2s
npm run test:ui               # UI mode: watch, time-travel, locator picker
npm run test:headed           # watch it happen
npm run test:debug            # Playwright Inspector

npx playwright test --grep @smoke        # tagged subsets
npx playwright test --grep @a11y
npx playwright test --shard=1/4          # what CI does, four ways

npm run report                # open the HTML report
npm run trace path/to/trace.zip

npm run typecheck             # tsc --noEmit, strict
npm run lint:no-hard-waits    # the one non-negotiable rule
```

### Tags

`@smoke` (the deploy gate), `@api`, `@a11y`, `@states` (loading/empty/error paths),
`@contract` (payload shape), plus per-feature tags `@auth`, `@runs`, `@run-detail`,
`@dashboard`.

### Environment

Everything has a working default; see [`.env.example`](./.env.example).

| Variable | Default | Purpose |
|---|---|---|
| `BASE_URL` | `http://localhost:5173` | React app |
| `API_BASE_URL` | `http://localhost:3001` | Express API |
| `E2E_EMAIL` / `E2E_PASSWORD` | seeded demo user | login for the setup project |
| `PW_SKIP_WEBSERVER` | unset | don't manage the app |
| `SHARD_INDEX` / `SHARD_TOTAL` | unset | shard from env instead of the CLI |

---

## CI and the published report

[`.github/workflows/e2e.yml`](./.github/workflows/e2e.yml) runs on push, PR, manual
dispatch, and nightly at 06:30 UTC — the nightly matters because a test that fails once a
week never fails on the PR that introduced it.

```
static-checks ──► test (shard 1/4) ─┐
   typecheck      test (shard 2/4) ─┤
   no-hard-waits  test (shard 3/4) ─┼──► merge-report ──► publish-report
                  test (shard 4/4) ─┘     blob → html        GitHub Pages
```

- **Cheap gates first.** Typecheck and the hard-wait check run in ~40s. If the suite does
  not compile there is no point starting twelve browser jobs.
- **Four shards, `fail-fast: false`.** If shard 2 fails, the others still finish, so the
  merged report shows the whole picture instead of a truncated one.
- **`blob` reporter on CI.** That is what makes `playwright merge-reports` able to stitch
  four shards into one HTML report.
- **Browser binaries cached** on the Playwright version from the lockfile.
- **Artifacts:** blob reports (14 days), traces and screenshots from failing shards
  (7 days), the merged HTML report (30 days).

**Published report:** `https://<owner>.github.io/playwright-framework/` — the merged report
from the latest `main` run, with traces attached to every failure. It is also linked from
the job summary of every run.

Runtime: roughly 3 minutes wall clock for all 288 tests across three browsers.

---

## Test inventory

| Area | Tests | Notes |
|---|---|---|
| `auth/login.spec.ts` | 11 | valid, invalid, Enter-key submit, error parity, server outage, dropped connection, ARIA snapshot |
| `auth/session.spec.ts` | 10 | route protection ×3, no chrome before redirect, `/login` redirect when authed, reload, second tab, logout, back-after-logout, expired token |
| `runs/runs-list.spec.ts` | 19 | search ×4, status filter ×5, pagination ×4, table semantics, navigation |
| `runs/runs-list.states.spec.ts` | 10 | empty, 500, retry recovery, abort, in-flight loading, no empty-flash, exact payload rendering, console errors |
| `run-detail/run-detail.spec.ts` | 11 | real run rendering, error output scoping, all three statuses, retries, empty, 404, 500 + retry, loading, ARIA snapshot |
| `dashboard/dashboard.spec.ts` | 13 | stat tiles, seeded counts, chart points, top-flaky table, empty, error + retry, loading, ARIA snapshot |
| `navigation/navigation.spec.ts` | 5 | nav links, no full reload, back/forward, 404 route |
| `api/*.api.spec.ts` | 50 | auth + authorisation (12), runs list (19), run detail (9), flaky (10) |
| **Browser total** | **79 × 3 = 237** | chromium, firefox, webkit |
| `tests/auth.setup.ts` | 1 | the `setup` project |
| **Grand total** | **288** | `npx playwright test --list` |

The API project exercises the contract directly: schema validation field by field,
pagination boundaries, search case-insensitivity, status partitioning, the `__fail=500` and
`__slow=1` hooks, and a determinism check that two identical requests return byte-identical
bodies — because every exact-count assertion in the UI suite depends on that being true.

---

## Things I would point at in a code review

- **No assertions in page objects.** They expose locators and actions. Specs decide what
  correct means, so failure messages point at the test, not at a class.
- **Locators are properties, not getters.** A `Locator` is a description, not a snapshot —
  building it once in the constructor is safe and it re-resolves on every use.
- **Route handlers run last-registered-first.** The retry tests install the success handler
  *before* the one-shot failure. Getting that backwards is a confusing hour; there is a
  comment where it matters.
- **Interception is torn down after every test** in the `mock` fixture, so a leaked route
  cannot bleed into the next test in the same worker.
- **The factories have no randomness.** A factory that calls `Math.random()` is a flaky test
  with extra steps.
- **Types are hand-written, not imported from the app.** The suite is an independent
  observer of the contract. If the app renames a field, the tests should fail — not
  silently follow along.
- **`retries: 1` on CI, `0` locally.** Retries absorb infrastructure noise; they are not a
  fix. Anything that passes only on retry is reported as flaky and gets fixed. Which is,
  more or less, what the application under test is for.
