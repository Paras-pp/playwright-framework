# Selenium to Playwright: what actually changed

I spent 20 months at LTIMindtree owning a Selenium + Java + JUnit 5 suite — Page Object
Model, PageFactory in the older packages, TestNG in one module we never finished migrating,
Selenium Grid on three nodes, Jenkins, Allure reports. Somewhere north of 400 UI tests by
the time I left. I maintained it, I triaged it every morning, and I quarantined more of it
than I would like to admit.

This document is me writing the same tests twice — once the way I used to, once the way I
do now — and being specific about what improved, what did not, and where I would still
reach for Selenium. It is not a sales pitch. I liked Selenium. It paid my rent and taught
me most of what I know about test design, and a good chunk of what is written below is
"Playwright made this easy" only because Selenium made me learn why it was hard.

A note on the code: the Java side is real. It is the shape of what I was maintaining, down
to the `FluentWait` helper and the `ExpectedConditions` imports, because that is the honest
comparison. Idealised Selenium that nobody writes would be a strawman.

---

## Contents

1. [Six tests, both ways](#six-tests-both-ways)
   - [1. Login with valid credentials](#1-login-with-valid-credentials)
   - [2. Filter a table and assert the filtered rows](#2-filter-a-table-and-assert-the-filtered-rows)
   - [3. Assert the error state when the API returns 500](#3-assert-the-error-state-when-the-api-returns-500)
   - [4. Assert error output on the right row of a table](#4-assert-error-output-on-the-right-row-of-a-table)
   - [5. Log in once for the whole suite](#5-log-in-once-for-the-whole-suite)
   - [6. Verify the UI against the API in one test](#6-verify-the-ui-against-the-api-in-one-test)
2. [Explicit waits vs auto-waiting](#explicit-waits-vs-auto-waiting)
3. [Locator strategy and brittleness](#locator-strategy-and-brittleness)
4. [Flake rate](#flake-rate)
5. [Suite runtime](#suite-runtime)
6. [CI cost](#ci-cost)
7. [Debugging: screenshots vs the trace viewer](#debugging-screenshots-vs-the-trace-viewer)
8. [Setup and teardown: @Before vs fixtures](#setup-and-teardown-before-vs-fixtures)
9. [Where Selenium is still the right choice](#where-selenium-is-still-the-right-choice)
10. [How I would actually run a migration](#how-i-would-actually-run-a-migration)
11. [What I miss from the Java stack](#what-i-miss-from-the-java-stack)

---

## Six tests, both ways

All six are real tests from this repo's suite against Flakeboard. The Playwright versions
are the ones that actually ship in `tests/`; the Java versions are what I would have
written for the same behaviour.

---

### 1. Login with valid credentials

The simplest possible test, and already a fair bit of scaffolding on the Java side.

#### Selenium / Java / JUnit 5

```java
// src/test/java/com/flakeboard/pages/LoginPage.java
package com.flakeboard.pages;

import org.openqa.selenium.By;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.support.ui.ExpectedConditions;
import org.openqa.selenium.support.ui.WebDriverWait;

import java.time.Duration;

public class LoginPage {

    private static final By EMAIL       = By.cssSelector("[data-testid='login-email']");
    private static final By PASSWORD    = By.cssSelector("[data-testid='login-password']");
    private static final By SUBMIT      = By.cssSelector("[data-testid='login-submit']");
    private static final By ERROR       = By.cssSelector("[data-testid='login-error']");
    private static final By LOGIN_FORM  = By.cssSelector("[data-testid='login-form']");

    private final WebDriver driver;
    private final WebDriverWait wait;

    public LoginPage(WebDriver driver) {
        this.driver = driver;
        this.wait = new WebDriverWait(driver, Duration.ofSeconds(10));
    }

    public LoginPage open() {
        driver.get(Config.baseUrl() + "/login");
        wait.until(ExpectedConditions.visibilityOfElementLocated(LOGIN_FORM));
        return this;
    }

    public LoginPage enterEmail(String email) {
        WebElement field = wait.until(ExpectedConditions.elementToBeClickable(EMAIL));
        field.clear();
        field.sendKeys(email);
        return this;
    }

    public LoginPage enterPassword(String password) {
        WebElement field = wait.until(ExpectedConditions.elementToBeClickable(PASSWORD));
        field.clear();
        field.sendKeys(password);
        return this;
    }

    public DashboardPage submit() {
        wait.until(ExpectedConditions.elementToBeClickable(SUBMIT)).click();
        return new DashboardPage(driver);
    }

    public String errorText() {
        return wait.until(ExpectedConditions.visibilityOfElementLocated(ERROR)).getText();
    }

    public boolean isDisplayed() {
        try {
            return driver.findElement(LOGIN_FORM).isDisplayed();
        } catch (org.openqa.selenium.NoSuchElementException e) {
            return false;
        }
    }
}
```

```java
// src/test/java/com/flakeboard/tests/LoginTest.java
package com.flakeboard.tests;

import com.flakeboard.pages.DashboardPage;
import com.flakeboard.pages.LoginPage;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.chrome.ChromeDriver;
import org.openqa.selenium.chrome.ChromeOptions;
import org.openqa.selenium.support.ui.ExpectedConditions;
import org.openqa.selenium.support.ui.WebDriverWait;

import java.time.Duration;

import static org.junit.jupiter.api.Assertions.assertTrue;

class LoginTest {

    private WebDriver driver;
    private LoginPage loginPage;

    @BeforeEach
    void setUp() {
        ChromeOptions options = new ChromeOptions();
        options.addArguments("--headless=new", "--window-size=1280,800");
        driver = new ChromeDriver(options);
        driver.manage().timeouts().implicitlyWait(Duration.ZERO); // never mix implicit + explicit
        loginPage = new LoginPage(driver).open();
    }

    @AfterEach
    void tearDown() {
        if (driver != null) {
            driver.quit();
        }
    }

    @Test
    @DisplayName("signs in with valid credentials and lands on the dashboard")
    void signsInWithValidCredentials() {
        DashboardPage dashboard = loginPage
                .enterEmail("paras@flakeboard.dev")
                .enterPassword("demo1234")
                .submit();

        new WebDriverWait(driver, Duration.ofSeconds(10))
                .until(ExpectedConditions.urlMatches(".*/$"));

        assertTrue(dashboard.isLoaded(), "dashboard should be visible after login");
        assertTrue(!loginPage.isDisplayed(), "login form should be gone");
    }
}
```

#### Playwright / TypeScript

```ts
// tests/auth/login.spec.ts
import { STORAGE_STATE_ANONYMOUS, expect, test } from '../../fixtures';
import { CREDENTIALS, ROUTES } from '../../utils/test-data';

test.use({ storageState: STORAGE_STATE_ANONYMOUS });

test('signs in with valid credentials and lands on the dashboard', async ({
  page,
  loginPage,
  dashboardPage,
}) => {
  await loginPage.goto();
  await loginPage.login(CREDENTIALS.valid);

  await expect(page).toHaveURL(new RegExp(`${ROUTES.dashboard}$`));
  await expect(dashboardPage.root).toBeVisible();
  await expect(loginPage.root).toBeHidden();
});
```

```ts
// pages/login.page.ts — the whole page object
export class LoginPage extends BasePage {
  readonly path = ROUTES.login;
  readonly root: Locator;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly submitButton: Locator;
  readonly errorMessage: Locator;

  constructor(page: Page) {
    super(page);
    this.root = page.getByTestId('login-form');
    this.emailInput = page.getByLabel(/e-?mail/i);
    this.passwordInput = page.getByLabel(/password/i);
    this.submitButton = page.getByRole('button', { name: /sign in|log ?in/i });
    this.errorMessage = page.getByTestId('login-error');
  }

  async login({ email, password }: Credentials): Promise<void> {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.submitButton.click();
  }
}
```

**What changed.** 130-odd lines became about 35. But line count is the least interesting
part. Three things actually matter here:

- Every `wait.until(...)` disappeared. Not because Playwright hides the waiting, but
  because the wait moved to where it belongs: the assertion and the action, not the
  page object. `expect(...).toBeVisible()` polls; `click()` waits for actionability.
- `driver` lifecycle — construct, configure, quit — is gone from my code entirely. It is
  a fixture. Forgetting `driver.quit()` used to leak a Chrome process into the Jenkins
  agent until the box ran out of memory at 2am.
- The Java page object returns `DashboardPage` from `submit()` to model navigation. That
  pattern reads nicely and is a liability: it bakes in an assumption about where the app
  goes next, so a redirect change breaks the compile of tests that never cared. I stopped
  doing it in the Playwright port and I would stop doing it in Java too.

---

### 2. Filter a table and assert the filtered rows

Where Selenium starts costing real time: dynamic content that re-renders under you.

#### Selenium / Java

```java
// src/test/java/com/flakeboard/pages/RunsListPage.java
public class RunsListPage {

    private static final By TABLE   = By.cssSelector("[data-testid='runs-table']");
    private static final By ROW     = By.cssSelector("[data-testid='run-row']");
    private static final By SEARCH  = By.cssSelector("[data-testid='run-search']");
    private static final By SPINNER = By.cssSelector("[data-testid='loading-spinner']");

    private final WebDriver driver;
    private final WebDriverWait wait;

    public RunsListPage(WebDriver driver) {
        this.driver = driver;
        this.wait = new WebDriverWait(driver, Duration.ofSeconds(10));
    }

    public RunsListPage search(String term) {
        WebElement input = wait.until(ExpectedConditions.elementToBeClickable(SEARCH));

        // Capture a row we expect to go stale, so we can wait for the re-render rather
        // than guessing. Without this the assertion reads the OLD rows and passes for
        // the wrong reason — the single most common false green in our suite.
        WebElement firstRowBefore = driver.findElements(ROW).isEmpty()
                ? null
                : driver.findElements(ROW).get(0);

        input.clear();
        input.sendKeys(term);

        if (firstRowBefore != null) {
            wait.until(ExpectedConditions.stalenessOf(firstRowBefore));
        }
        wait.until(ExpectedConditions.invisibilityOfElementLocated(SPINNER));
        wait.until(ExpectedConditions.visibilityOfElementLocated(TABLE));
        return this;
    }

    public List<String> rowTexts() {
        return wait.until(ExpectedConditions.presenceOfAllElementsLocatedBy(ROW))
                .stream()
                .map(WebElement::getText)
                .collect(Collectors.toList());
    }

    public int rowCount() {
        return driver.findElements(ROW).size();
    }
}
```

```java
@Test
@DisplayName("search narrows the list to a branch")
void searchNarrowsToBranch() {
    RunsListPage runs = new RunsListPage(driver);
    driver.get(Config.baseUrl() + "/runs");

    runs.search("feat/checkout");

    List<String> rows = runs.rowTexts();
    assertFalse(rows.isEmpty(), "expected at least one matching run");
    assertTrue(
        rows.stream().allMatch(text -> text.contains("feat/checkout")),
        () -> "some rows did not match the search term: " + rows
    );
}
```

That `stalenessOf` dance is the part I want to draw attention to. It is not incidental
complexity I invented; it is what you have to do when your assertion reads a snapshot of
the DOM. And it is still not airtight: if the search is debounced and the re-render has
not started when `stalenessOf` is called, the old element is not stale yet, the wait
returns immediately on the *next* poll after the re-render — or, on an unlucky machine,
times out because React reused the DOM node instead of replacing it. I had one of these
in quarantine for four months.

#### Playwright / TypeScript

```ts
test('search narrows the list to a branch', async ({ runsPage }) => {
  await runsPage.goto();
  const branch = 'feat/checkout';

  const response = await runsPage.waitForRunsResponse(() => runsPage.search(branch));

  expect(queryOf(response.request()).get('search')).toBe(branch);
  await expect(runsPage.rows.filter({ hasNotText: branch })).toHaveCount(0);
  expect(await runsPage.rowCount()).toBeGreaterThan(0);
});
```

**What changed.** `runsPage.rows` is not a list of elements. It is a *description* of
"every element with `data-testid=run-row`", re-evaluated every time an assertion touches
it. So `expect(rows.filter({ hasNotText: branch })).toHaveCount(0)` polls until either the
re-render lands and no non-matching rows remain, or the timeout expires. There is nothing
to go stale, so there is nothing to wait for going stale.

The `waitForRunsResponse` wrapper is not compensating for a missing wait — the assertion
would work without it. It is there so the test can also assert that the *request* carried
`?search=feat/checkout`, which catches the class of bug where the UI filters client-side
and the server never hears about it.

`StaleElementReferenceException` was, by my count, the largest single category of failure
in the LTIMindtree suite. In Playwright it is not a category. It is not a thing that exists.

---

### 3. Assert the error state when the API returns 500

This is the test that convinced me. In Java I could not write it honestly.

#### Selenium / Java

There are three options and I have used all three.

**Option A — a test-only backend toggle.** Ask the backend team for an endpoint that makes
`/api/runs` fail, then hit it before the test. This works, and it means production code now
contains a switch whose only purpose is to break the application, which is a conversation
I have had more than once and lost about half of them.

```java
@Test
@DisplayName("shows the error state when the runs API fails")
void showsErrorStateOnServerError() {
    // Requires a test-only hook shipped in the app itself.
    given().baseUri(Config.apiUrl())
           .header("Authorization", "Bearer " + Config.token())
           .post("/__test__/fail-next/runs")
           .then().statusCode(204);

    driver.get(Config.baseUrl() + "/runs");

    WebDriverWait wait = new WebDriverWait(driver, Duration.ofSeconds(10));
    WebElement error = wait.until(ExpectedConditions.visibilityOfElementLocated(
            By.cssSelector("[data-testid='error-state']")));

    assertTrue(error.isDisplayed());
    assertTrue(driver.findElement(By.cssSelector("[data-testid='retry-button']")).isDisplayed());
}
```

**Option B — a proxy.** BrowserMob or mitmproxy in front of the browser, rewriting the
response. This is the "proper" answer and it is a genuine piece of infrastructure: another
process per test, another port to allocate, another thing that breaks on the Grid nodes but
not on your laptop, and CDP-based alternatives that only work on Chrome anyway.

```java
@BeforeEach
void startProxy() {
    proxy = new BrowserMobProxyServer();
    proxy.start(0);
    proxy.addResponseFilter((response, contents, messageInfo) -> {
        if (messageInfo.getOriginalUrl().contains("/api/runs")) {
            response.setStatus(HttpResponseStatus.INTERNAL_SERVER_ERROR);
            contents.setTextContents("{\"error\":\"server_error\"}");
        }
    });

    Proxy seleniumProxy = ClientUtil.createSeleniumProxy(proxy);
    ChromeOptions options = new ChromeOptions();
    options.setCapability(CapabilityType.PROXY, seleniumProxy);
    options.setAcceptInsecureCerts(true);   // the proxy re-signs TLS
    driver = new ChromeDriver(options);
}
```

Note what that `@BeforeEach` now owns: a proxy lifecycle, a TLS exception, and a driver
that cannot be shared with any other test class. Also note it is Chrome-specific in
practice — getting the same proxy working reliably on the Firefox and Safari nodes of the
Grid was a week I am not getting back.

**Option C — don't test it.** Which is what most teams do, including mine for the first
year. The error state ships untested, and the first time anyone sees it is in production,
usually with a blank white div because someone renamed a prop.

#### Playwright / TypeScript

```ts
test('renders the error state with a retry button on a 500', async ({ runsPage, mock }) => {
  await mock.runsFail(500);

  await runsPage.goto();

  await expect(runsPage.state.error).toBeVisible();
  await expect(runsPage.state.retryButton).toBeVisible();
  await expect(runsPage.table).toBeHidden();
  await expect(runsPage.state.empty).toBeHidden();
});

test('retry refetches and recovers', async ({ runsPage, mock }) => {
  await mock.failThenRecover(API_GLOB.runsListAny, 1); // fail once, then let it through

  await runsPage.goto();
  await expect(runsPage.state.error).toBeVisible();

  await runsPage.state.retry();

  await expect(runsPage.table).toBeVisible();
  await expect(runsPage.rows).toHaveCount(10);
});
```

Underneath, `mock.runsFail` is four lines:

```ts
await page.route('**/api/runs{,?*}', (route) =>
  route.fulfill({ status: 500, headers: { 'content-type': 'application/json' },
                  body: JSON.stringify({ error: 'server_error' }) }),
);
```

**What changed.** No proxy, no production test hook, no per-test infrastructure, and it
works identically on Chromium, Firefox and WebKit because interception happens in
Playwright's own network layer rather than in a browser-specific debug protocol.

The knock-on effect is bigger than the test itself. Once faking a response is four lines,
you start testing the states nobody tests: empty results, dropped connections, a 401
mid-session, and — the one I am proudest of — the loading state, asserted deterministically
by holding the request open and releasing it on command:

```ts
test('shows a loading state while the request is in flight', async ({ runsPage, mock }) => {
  const release = await mock.runsStall();   // holds the request open

  await runsPage.goto();

  await expect(runsPage.state.loading).toBeVisible();
  await expect(runsPage.table).toBeHidden();

  release();                                 // and now let it answer

  await expect(runsPage.state.loading).toBeHidden();
  await expect(runsPage.table).toBeVisible();
});
```

In Selenium, testing a loading spinner means `Thread.sleep(200)` and hoping the spinner is
still up. That is a test that fails on a fast CI box and passes on a slow one, which is
precisely backwards.

---

### 4. Assert error output on the right row of a table

Table-row scoping: easy to get subtly wrong, and the wrongness is invisible.

#### Selenium / Java

```java
public class RunDetailPage {

    private static final By TEST_ROW = By.cssSelector("[data-testid='test-row']");

    private final WebDriver driver;
    private final WebDriverWait wait;

    public RunDetailPage(WebDriver driver) { /* ... */ }

    public WebElement rowByTitle(String title) {
        List<WebElement> rows = wait.until(
                ExpectedConditions.presenceOfAllElementsLocatedBy(TEST_ROW));

        return rows.stream()
                .filter(row -> row.getText().contains(title))
                .findFirst()
                .orElseThrow(() -> new AssertionError(
                        "no test row titled '" + title + "'. Rows present: "
                        + rows.stream().map(WebElement::getText).collect(Collectors.toList())));
    }

    public String errorTextFor(String title) {
        WebElement row = rowByTitle(title);
        List<WebElement> errors = row.findElements(By.cssSelector("[data-testid='test-error']"));
        return errors.isEmpty() ? null : errors.get(0).getText();
    }

    public int errorBlockCount() {
        return driver.findElements(By.cssSelector("[data-testid='test-error']")).size();
    }
}
```

```java
@Test
@DisplayName("shows error output for failing tests only")
void showsErrorOutputForFailingTestsOnly() {
    // No interception, so this needs a seeded run known to contain exactly one failure —
    // a fixture that lives in the backend repo and that I have to keep in sync by hand.
    driver.get(Config.baseUrl() + "/runs/" + Config.seededFailingRunId());

    RunDetailPage detail = new RunDetailPage(driver);

    assertNotNull(detail.errorTextFor("checkout retries the payment webhook"));
    assertTrue(detail.errorTextFor("checkout retries the payment webhook").contains("TimeoutError"));
    assertNull(detail.errorTextFor("login renders the form"));
    assertEquals(1, detail.errorBlockCount());
}
```

Two problems, both of which bit me. First, `rowByTitle` throws an `AssertionError` from
inside a page object — my page objects were supposed to be assertion-free and this one
lies about it, because there was no clean alternative that produced a useful message.
Second, the whole test depends on `Config.seededFailingRunId()`: a magic id in a properties
file that has to match whatever the backend seeder produced this week. When the seed
changed, this test failed and told me "no test row titled 'checkout retries...'", which is
true, unhelpful, and cost me an hour.

#### Playwright / TypeScript

```ts
test('shows error output for failing tests only', async ({ runDetailPage, mock }) => {
  const failing = makeFailingTest({ title: 'checkout retries the payment webhook' });
  const passing = makeTest({ title: 'login renders the form' });

  await mock.runDetail(MOCK_RUN_ID, makeRunDetail({ id: MOCK_RUN_ID, tests: [passing, failing] }));
  await runDetailPage.gotoRun(MOCK_RUN_ID);

  await expect(runDetailPage.errorOf(failing.title)).toBeVisible();
  await expect(runDetailPage.errorOf(failing.title)).toContainText('TimeoutError');
  await expect(runDetailPage.errorOf(passing.title)).toHaveCount(0);
  await expect(runDetailPage.errorBlocks).toHaveCount(1);
});
```

```ts
// pages/run-detail.page.ts
testRowByTitle(title: string | RegExp): Locator {
  return this.testRows.filter({ hasText: title });
}

errorOf(title: string | RegExp): Locator {
  return this.testRowByTitle(title).getByTestId('test-error');
}
```

**What changed.** `errorOf()` is two lines, throws nothing, asserts nothing, and returns a
locator that composes. The failure message when the row is missing is generated by
Playwright and includes the resolved selector chain and a screenshot at the moment of
failure. And because the payload is fabricated by a factory, the test no longer depends on
a seeded id maintained in someone else's repo — the data is right there in the test, which
means the test also documents what it needs.

The `toHaveCount(0)` assertion is worth a mention: it is a web-first assertion, so it
retries. Asserting absence in Selenium is a genuine trap — `findElements(...).isEmpty()`
returns true immediately, including in the window before the element renders. I have
shipped a passing "the error is not shown" test that could never have failed.

---

### 5. Log in once for the whole suite

The setup/teardown comparison, which is really a comparison of two different ideas about
what a test framework is for.

#### Selenium / Java / JUnit 5

```java
// src/test/java/com/flakeboard/BaseTest.java
public abstract class BaseTest {

    protected static final ThreadLocal<WebDriver> DRIVER = new ThreadLocal<>();
    private static String sessionToken;   // shared across the JVM

    @BeforeAll
    static void loginOnce() {
        // RestAssured, because doing this through the UI once per class is too slow.
        sessionToken = given()
                .baseUri(Config.apiUrl())
                .contentType(ContentType.JSON)
                .body(Map.of("email", Config.email(), "password", Config.password()))
                .post("/api/auth/login")
                .then().statusCode(200)
                .extract().path("token");
    }

    @BeforeEach
    void startDriver() {
        ChromeOptions options = new ChromeOptions();
        options.addArguments("--headless=new", "--window-size=1280,800");
        WebDriver driver = new RemoteWebDriver(Config.gridUrl(), options);
        DRIVER.set(driver);

        // localStorage is per-origin, so you have to load the origin first, write the
        // token, then reload. Three navigations before the test has done anything.
        driver.get(Config.baseUrl() + "/login");
        ((JavascriptExecutor) driver).executeScript(
                "window.localStorage.setItem('flakeboard.token', arguments[0]);", sessionToken);
        driver.navigate().refresh();
    }

    @AfterEach
    void stopDriver() {
        WebDriver driver = DRIVER.get();
        if (driver != null) {
            try {
                driver.quit();
            } finally {
                DRIVER.remove();   // forget this and the ThreadLocal leaks on the Grid
            }
        }
    }
}
```

Everything inherits `BaseTest`. Which means:

- Every test class carries every dependency in the base class, whether it uses it or not.
- Parallelism is a `ThreadLocal` you must not get wrong, and `@BeforeAll` being `static`
  means shared state that is awkward to make per-thread.
- Adding one thing that only three tests need (say, a second logged-in user) means either
  putting it in the base class for all 400 tests, or starting a second base class, and
  within a year you have `BaseTest`, `AuthenticatedBaseTest` and `ApiBaseTest`, and a
  new joiner picks the wrong one.
- Test-level opt-outs are inheritance overrides, which read badly and execute worse.

#### Playwright / TypeScript

```ts
// tests/auth.setup.ts — runs ONCE for the entire suite, in its own project
setup('authenticate and persist storage state', async ({ page, loginPage }) => {
  await loginPage.goto();
  await loginPage.login(CREDENTIALS.valid);

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId('app-shell')).toBeVisible();

  await page.context().storageState({ path: STORAGE_STATE });
});
```

```ts
// playwright.config.ts
projects: [
  { name: 'setup', testMatch: /.*\.setup\.ts/ },
  {
    name: 'chromium',
    dependencies: ['setup'],
    use: { ...devices['Desktop Chrome'], storageState: STORAGE_STATE },
  },
  // firefox, webkit identical
]
```

```ts
// and a test that needs to be logged OUT says so, at the top of the file:
test.use({ storageState: STORAGE_STATE_ANONYMOUS });
```

Fixtures replace the base class entirely:

```ts
// fixtures/pages.fixture.ts
export const pagesTest = authTest.extend<PageObjectFixtures>({
  loginPage: async ({ page }, use) => { await use(new LoginPage(page)); },
  runsPage:  async ({ page }, use) => { await use(new RunsListPage(page)); },
  // ...
});
```

**What changed, and this is the part I would spend the most interview time on:**

1. **Lazy by dependency, not by inheritance.** A test that destructures `{ runsPage }` gets
   exactly that fixture built. The other five page objects are never constructed. In the
   Java suite every test paid for everything in `BaseTest` whether it touched it or not.

2. **Login happens once for the whole run, not once per test.** With ~79 browser tests on
   three browsers, that is 237 logins removed. At roughly 1.5s each that is close to six
   minutes of wall clock, but the real win is that 237 opportunities for an unrelated login
   hiccup to fail an unrelated test are gone.

3. **Opting out is a declaration, not an override.** `test.use({ storageState: ANONYMOUS })`
   sits at the top of the file where you can see it. The JUnit equivalent — a subclass that
   overrides `startDriver()` and remembers to call `super` in three of four branches — is a
   thing I have debugged.

4. **Composition instead of a hierarchy.** `options → auth → pages → network → api` is a
   chain of `extend()` calls. Adding a fixture is a new file plus one line; it touches no
   test. There is no second base class, ever.

5. **Teardown is the code after `await use(...)`.** Setup and teardown for one concern live
   in one function, six lines apart, instead of in a `@BeforeEach` and an `@AfterEach` a
   hundred lines away from each other in a class nobody owns.

---

### 6. Verify the UI against the API in one test

At LTIMindtree, UI tests and API tests were two frameworks, two repos, two reports, two
CI jobs, and two sets of credentials that drifted apart twice a year.

#### Selenium + RestAssured / Java

```java
class RunDetailTest extends BaseTest {

    @Test
    @DisplayName("the run detail page renders the tests the API returned")
    void rendersTheTestsTheApiReturned() {
        // 1. API call, RestAssured — a completely separate HTTP client with its own
        //    auth handling, its own base URI config, and its own idea of a timeout.
        Response listResponse = given()
                .baseUri(Config.apiUrl())
                .header("Authorization", "Bearer " + sessionToken)
                .queryParam("pageSize", 1)
                .get("/api/runs")
                .then().statusCode(200)
                .extract().response();

        String runId  = listResponse.path("items[0].id");
        String branch = listResponse.path("items[0].branch");
        int    total  = listResponse.path("items[0].total");

        // 2. UI, Selenium
        WebDriver driver = DRIVER.get();
        driver.get(Config.baseUrl() + "/runs/" + runId);

        WebDriverWait wait = new WebDriverWait(driver, Duration.ofSeconds(10));
        wait.until(ExpectedConditions.visibilityOfElementLocated(
                By.cssSelector("[data-testid='run-detail']")));
        wait.until(ExpectedConditions.numberOfElementsToBe(
                By.cssSelector("[data-testid='test-row']"), total));

        assertTrue(driver.findElement(By.cssSelector("[data-testid='run-detail-title']"))
                .getText().contains(branch));
    }
}
```

It works. But `sessionToken` came from `@BeforeAll` in the base class, RestAssured has its
own config object, and the API assertions live in a different module of the build with
different conventions. When the auth header format changed, I fixed it in two places and
found the third one in CI.

#### Playwright / TypeScript

```ts
test('renders the tests of a real run', async ({ api, runDetailPage }) => {
  const listResponse = await api.listRuns({ pageSize: 1 });
  expect(listResponse.ok()).toBeTruthy();

  const { items } = (await listResponse.json()) as RunsPage;
  const run = items[0]!;

  await runDetailPage.gotoRun(run.id);

  await expect(runDetailPage.root).toBeVisible();
  await expect(runDetailPage.title).toContainText(run.branch);
  await expect(runDetailPage.testRows).toHaveCount(run.total);
});
```

**What changed.** The `api` fixture is the same authenticated client the pure-API tests in
`tests/api/` use, sharing the same worker-scoped token obtained by the same login. One
framework, one report, one auth path. If the bearer format changes, it changes in
`utils/api-client.ts` and nowhere else.

And the pure API tests sit right alongside:

```ts
test('every run matches the contract shape', async ({ api }) => {
  const response = await api.listRuns({ pageSize: 47 });
  expect(validateRunsPage(await response.json())).toSatisfyContract('GET /api/runs');
});
```

They run in a browserless project, so 50 API tests execute in a couple of seconds and gate
the UI shards. When the contract breaks, the API tests go red and tell me the field name;
the UI tests do not have to be the messenger.

---

## Explicit waits vs auto-waiting

The single biggest behavioural difference, and the one most commonly misunderstood in
interviews. Playwright did not delete waiting. It moved it.

| | Selenium | Playwright |
|---|---|---|
| Where the wait lives | In my code, at every interaction | Inside the action and the assertion |
| What it waits for | One `ExpectedCondition` I chose | Attached, visible, stable, enabled, receives events |
| Element identity | A resolved `WebElement` that can go stale | A lazy query re-run on every use |
| Asserting absence | Returns immediately — a false green | `toHaveCount(0)` retries properly |
| Failure output | `TimeoutException` and a stack trace | The failing locator, actual vs expected, and a trace |

Three specifics worth knowing cold:

**Actionability.** `locator.click()` waits until the element is attached, visible, stable
(not animating), enabled, and actually receives pointer events at the click point. That
last one is the killer feature. In Selenium, `elementToBeClickable` returns true for a
button sitting *behind* a cookie banner, the click lands on the banner, and the failure
surfaces three assertions later as "expected dashboard, got login". Playwright waits, and
if the banner never moves, tells you exactly which element intercepted the pointer.

**Web-first assertions retry; plain ones don't.** `await expect(locator).toHaveText('x')`
polls to the assertion timeout. `expect(await locator.textContent()).toBe('x')` reads once
and fails immediately. Both compile. Both look reasonable in review. Only one of them is
correct, and knowing the difference is most of what separates a stable suite from a flaky
one. Where there is genuinely no locator — `localStorage`, a computed value — `expect.poll()`
gives the same retry semantics to an arbitrary read.

**The mixing trap, which applies to both.** In Selenium, combining an implicit wait with an
explicit one produces undefined timeout behaviour; the drivers do not document how they
compose and it varies by browser. Our suite had `implicitlyWait(10)` set in the base class
*and* ten-second `WebDriverWait`s, so a genuine failure took anywhere from 10 to 100
seconds. Playwright's equivalent mistake is mixing `waitForTimeout` into an
otherwise-auto-waiting suite, which is why this repo has a CI step that fails the build if
the string appears anywhere in `tests/`, `pages/`, `fixtures/` or `utils/`.

---

## Locator strategy and brittleness

My Selenium locators were, honestly, about 70% CSS, 20% XPath, 10% id. The XPath was the
problem, and I wrote most of it.

```java
// Genuinely from a suite I maintained. It survived about six weeks.
By.xpath("//div[@class='runs-container']//table/tbody/tr[3]/td[2]//span[contains(@class,'badge')]")
```

That locator encodes: a class name, the table structure, the row *position*, the column
*position*, and a partial class match. Six independent reasons to break, none of which have
anything to do with whether the feature works. When the designer added a wrapper div for a
tooltip, forty tests went red and nothing was broken.

The hierarchy I use now, in order:

1. **`getByRole`** — `getByRole('button', { name: /sign in/i })`. Ties the test to what the
   user perceives: a thing that announces itself as a button and is named "Sign in". It
   breaks when the *user experience* breaks, which is the only kind of breakage worth a red
   test. It also fails when a `<div onClick>` is masquerading as a button, so it doubles as
   an accessibility check that costs nothing.
2. **`getByLabel`** — for form fields. Same argument. If `getByLabel(/email/i)` cannot find
   the input, a screen reader cannot name it either, and that is a bug in the app.
3. **`getByText` / `getByPlaceholder`** — for content and, sparingly, for inputs.
4. **`getByTestId`** — the deliberate fallback for elements with no semantics: an SVG chart,
   a spinner, a stat tile, a table row wrapper. This is what the `data-testid` block in
   CONTRACT.md is for. Not a default; a documented exception.
5. **CSS** — only inside a component's own subtree, and never as a chain.
6. **XPath** — no. In four years I have not found a case in a modern app that
   `getByRole` + `filter()` could not express more clearly.

The thing that actually replaced my XPath habit is **filtering and chaining**:

```ts
// "the row that mentions this branch, and the link inside it"
runsPage.rows.filter({ hasText: 'feat/checkout' }).getByRole('link').first();

// "every row that does NOT mention the search term" — should be none
runsPage.rows.filter({ hasNotText: branch });
```

That reads like the sentence I would say out loud to describe the intent, and it does not
care where the element sits in the tree. `tr[3]/td[2]` cares about nothing else.

Two more that changed how I write tests:

- **Strict mode.** A locator matching two elements is an error, not a silent "take the
  first". Selenium's `findElement` quietly returns element zero, so an ambiguous locator
  passes for years and then breaks when the order changes. Playwright forces me to say
  `.first()` on purpose, which is a decision I can review.
- **ARIA snapshots.** `toMatchAriaSnapshot` asserts the accessibility tree. It fails when a
  `<label>` is dropped, a heading level changes, or a `<button>` becomes a `<div>` — the
  regressions that break assistive tech and that no CSS-selector test will ever notice. It
  is also stable across a CSS rewrite, which is the exact inverse of a screenshot diff.

---

## Flake rate

Numbers from my own suites. These are not benchmarks and I would not present them as
industry figures — they are what I measured on the work I did, and the comparison is not
perfectly like-for-like because the applications differ.

**The Selenium suite at LTIMindtree**, ~400 tests, Grid, three parallel nodes, in the state
I inherited it and then improved it to:

| | When I joined | After ~14 months of work |
|---|---|---|
| Runs needing at least one retry | ~35% | ~12% |
| Tests in the quarantine list | 22 | 9 |
| Average retries per full run | 6–8 | 2–3 |
| Median triage time per red build | 25–40 min | 15–20 min |

Breakdown of what was actually failing, from the triage notes I kept over one quarter:

| Cause | Share |
|---|---|
| `StaleElementReferenceException` | ~40% |
| Timing — element not ready, wait too short | ~25% |
| Grid / node / session issues | ~15% |
| Genuine application bugs | ~12% |
| Test data collisions between parallel tests | ~8% |

**Only about one failure in eight was a real bug.** That ratio is the whole argument. Seven
out of eight red builds trained the team to ignore red builds, and once that happens the
suite has negative value — it costs time and no longer buys confidence.

**This Playwright suite**, 288 tests across three browsers plus a browserless API project,
is too young for a fair long-run figure and I will not invent one. What I can say
structurally is that the two largest categories above cannot occur here: staleness is not a
concept in the locator model, and there is no Grid. The third — timing — is what retries
and `trace: 'on-first-retry'` exist for, and any test that passes only on retry shows up in
the report marked flaky rather than passing silently. Which is the same thing Flakeboard,
the app under test, exists to make visible. That is not a coincidence; I built the app
because I wanted the data I never had.

The honest caveat: Playwright makes the *mechanical* flake categories go away. It does
nothing about the two hardest ones — tests that share mutable server state, and tests that
assert on things the application genuinely does not guarantee. Those are design problems.
In this repo they are handled by making every UI test read-only against a deterministic
seed and fabricating any other state through interception, which is a decision I made, not
something the tool did for me.

---

## Suite runtime

| | Selenium suite (~400 tests) | This suite (288 tests) |
|---|---|---|
| Local, single-threaded | ~55 min | not the way I run it |
| Local, parallel | ~18 min (3 Grid nodes) | ~4 min (8 workers) |
| CI, unsharded | ~22 min | ~9 min (3 browsers) |
| CI, sharded | n/a — we never got this working | ~3 min (4 shards) |
| Per-test overhead | ~1.5 s driver start + ~1.5 s login | ~0.15 s context + 0 login |

Where the Selenium time actually went:

- **Driver startup per test.** `new ChromeDriver()` in `@BeforeEach` is roughly 1.5s, times
  400. That is ten minutes of the suite doing nothing. Reusing the driver across a class is
  possible and trades away isolation, which we did, and then paid for with cross-test
  pollution bugs.
- **Login per class.** Even hoisted to `@BeforeAll`, that is one login per test class.
- **Grid round-trips.** Every single command is an HTTP request to the hub, then to the
  node. A test with 40 interactions is 40 round-trips over the network. Playwright talks to
  the browser over one persistent connection using the browser's own protocol.
- **Defensive sleeps.** I am not going to pretend these were not in there. Every
  `Thread.sleep(500)` that somebody added to "fix" a flake is 500ms paid on every run
  forever, and they are almost impossible to remove safely once the suite depends on them.

Playwright's structural advantages: a browser *context* is a few tens of milliseconds
rather than a browser process; contexts are isolated by default so parallelism is safe
rather than aspirational; and `fullyParallel` parallelises within a file, not just across
files.

Sharding deserves its own note because it is the config line that turns nine minutes into
three. `--shard=2/4` splits the test list four ways; four GitHub Actions runners each take
a quarter and emit a `blob` report; a merge job stitches them into one HTML report. Wall
clock drops by roughly the shard count, minus about 40 seconds of per-runner setup. The
same trick with the Grid means provisioning more nodes, which is a capacity conversation
with an infrastructure team, not a matrix entry in a YAML file.

---

## CI cost

Selenium Grid, at the scale we ran it:

- 3 EC2 nodes, always on because provisioning them per-run took longer than the tests.
- One hub, plus the monitoring to notice when a node had silently stopped accepting
  sessions — which happened about monthly and presented as "everything is flaky today".
- Roughly a day a month of someone's time on Grid maintenance. Browser version drift
  between nodes was a recurring cause of "passes on node 1, fails on node 3".
- Docker images for browser versions, rebuilt when Chrome moved, which is every four weeks.

Playwright on GitHub Actions:

- Zero standing infrastructure. Four `ubuntu-latest` runners, alive for about three minutes.
- Browser binaries are pinned to the Playwright version in `package-lock.json`, so every
  machine runs identical browsers by construction. "Works on my machine" stops being a
  category of bug.
- Browser binaries are cached, keyed on that version. Cold install is roughly a minute;
  cached is a few seconds.
- The whole thing is one 200-line YAML file in the repo, reviewed like code.

The comparison I would actually make in an interview, though, is not about the money. It is
that the Grid was a *system that could be down*. A test suite that depends on standing
infrastructure has an availability problem, and on the mornings when the Grid was the
problem, the suite told us nothing about the application at all.

---

## Debugging: screenshots vs the trace viewer

My Selenium failure workflow:

1. Jenkins goes red.
2. Open Allure, find the failed test.
3. Look at the one screenshot captured by the `TestWatcher` on failure. It shows the page
   *after* everything went wrong — usually a login screen or a blank div, which tells me
   the symptom and nothing about the cause.
4. Read the stack trace: `TimeoutException: Expected condition failed: waiting for
   visibility of element located by By.cssSelector: [data-testid='runs-table']`.
5. Not enough. Add more screenshots, or more logging, push, wait 20 minutes for CI.
6. Still not enough. Try to reproduce locally, where it passes, because my machine is
   faster than the agent.
7. Repeat. A genuinely hard flake could eat two days across a week.

We built things to help — a `TestWatcher` that grabbed a screenshot and the browser console
log, an Allure step decorator, video recording on the Grid nodes for a while (we turned it
off; the storage cost was not worth 400 videos of nothing). It was still fundamentally
archaeology from artifacts.

The Playwright workflow:

1. CI goes red.
2. Download the trace from the run artifacts, or open the merged HTML report on Pages and
   click the trace link.
3. `npx playwright show-trace trace.zip`.
4. Scrub a filmstrip of every action. Click any action and get: a DOM snapshot you can
   *inspect with real devtools* at that instant, the network log, the console, the source
   line, and the locator that was being resolved.
5. Usually done in two minutes. Most of the time the answer is visible in the filmstrip
   before I open anything.

The DOM snapshot is the part people underrate. It is not an image — it is the live DOM at
that moment, so I can hover elements, check computed styles, and run selectors against it.
The number of times that has immediately shown me "the button is behind a modal backdrop"
is high enough that I now consider a screenshot-only failure artifact to be inadequate.

Configuration is one line, and `on-first-retry` is the setting I would defend: tracing
always is expensive and slows every test; tracing never leaves you blind. Trace on the
retry means the first failure costs nothing and the automatic retry produces a full
recording of the same failure.

```ts
use: {
  trace: 'on-first-retry',
  screenshot: 'only-on-failure',
  video: isCI ? 'retain-on-failure' : 'off',
}
```

Two more that changed my loop day to day:

- **UI mode** (`npx playwright test --ui`) — watch mode with time-travel, a locator picker,
  and per-action DOM snapshots while you write the test. There is no Selenium equivalent.
- **`page.pause()`** — opens Inspector mid-test and lets you step and try locators live
  against the real page state. The Java equivalent is a breakpoint plus typing CSS into a
  devtools console in a browser you must not touch or the state changes.

---

## Setup and teardown: @Before vs fixtures

Covered in [test case 5](#5-log-in-once-for-the-whole-suite), but the conceptual difference
is worth stating on its own because it is the question I would most want to be asked.

**JUnit is inheritance-based.** `@BeforeEach` in a base class runs for every subclass test.
Setup is something you *are* (a `LoginTest` **is a** `BaseTest`), and the hierarchy is the
only mechanism for sharing. That has three consequences I lived with for two years: every
test pays for every dependency in its base class; opting out means overriding a method; and
the base class grows monotonically because adding to it is always easier than restructuring.

**Playwright fixtures are dependency-injection-based.** Setup is something you *ask for*.
A test declares `async ({ runsPage, mock, api }) => ...` and gets exactly those three
things constructed, in dependency order, with teardown for each. It is closer to Spring's
constructor injection than to JUnit's lifecycle, and if I had to explain it to my old team
in one sentence, that is the sentence I would use.

What follows from that:

| | JUnit lifecycle | Playwright fixtures |
|---|---|---|
| Mechanism | Inheritance | Dependency injection |
| Granularity | Everything in the base class, always | Only what the test destructures |
| Scopes | `@BeforeEach`, `@BeforeAll` (static) | test, worker |
| Teardown | Separate `@AfterEach`, elsewhere in the file | The code after `await use()`, six lines away |
| Sharing across classes | A second base class | An `extend()` call in one file |
| Opting out | Override and remember `super` | `test.use({ ... })` at the top of the file |
| Parallel safety | `ThreadLocal`, by hand | Worker isolation, by construction |
| Type safety | Compile-time, via the hierarchy | Compile-time, via the fixture generics |

The worker scope is the one with no clean JUnit analogue. `apiContext` and `authToken` in
this repo are worker-scoped: created once per parallel worker process, reused by every test
that worker runs, torn down when it exits. `@BeforeAll` is static and therefore
JVM-scoped — shared across threads, which is exactly the wrong granularity for parallel
execution and the reason we had `ThreadLocal` scattered through the base classes.

One thing I will defend about the JUnit model: it is *obvious*. A new joiner reads
`BaseTest` top to bottom and knows what happens before their test. Playwright's fixture
graph is resolved at runtime, and a fixture five levels up the chain that does something
surprising is harder to discover. My mitigation in this repo is that every fixture file has
a comment explaining what it does and why it exists at that scope, and the chain is linear
and named after what it adds. That is a discipline, not a language feature, and a team that
skips it will build something genuinely harder to reason about than a base class.

---

## Where Selenium is still the right choice

I want to be careful here, because "the new tool is better at everything" is the position of
someone who has only used the new tool. I maintained a Selenium suite for 20 months. There
are situations where I would choose it again today, without hesitation, and being able to
name them is more useful than being able to list Playwright's features.

### 1. You need browsers Playwright does not support

Playwright ships Chromium, Firefox and WebKit. That covers the modern web. It does not
cover:

- **Internet Explorer 11.** Still real in banking, insurance, healthcare and public sector.
  Selenium has an IE driver. Playwright will never have one, and no amount of enthusiasm
  changes that.
- **Legacy Edge, old Safari, specific pinned Chrome versions.** If your compliance
  requirement is "certified on Chrome 109 because that is what the hospital estate runs",
  Selenium plus a Grid node with that exact binary is the answer. Playwright's channels
  give you stable/beta/dev, not "the version from 2023".
- **Real device clouds and embedded browsers.** BrowserStack and Sauce Labs support
  Playwright now, but their deepest, best-supported, most-documented integration is still
  W3C WebDriver, and if you need a specific Android WebView on a specific handset, WebDriver
  is the protocol that gets you there.
- **Anything non-browser sharing the WebDriver protocol.** Appium for mobile native, and
  the various desktop drivers, are all WebDriver. If your team already runs Appium, staying
  in that ecosystem means one protocol, one set of skills, one reporting stack.

This is not a gap Playwright is going to close. WebDriver is a W3C standard with vendor
buy-in; Playwright's CDP-and-friends approach is what buys it the speed and the
interception, and the price of that is the browser list. That is an engineering trade-off,
not an oversight.

### 2. The team is a Java team and owns the suite

This is the one I feel most strongly about, and it has nothing to do with the tools.

If five QA engineers know Java, the CI templates are Maven, the reporting is Allure, the
shared libraries are in an internal Nexus, and the code review culture is built around
Java conventions — then rewriting in TypeScript does not just change the test framework. It
makes every one of those five people a beginner again, for months. The suite gets worse
before it gets better, and "worse" means bugs reach production during the dip.

There is a Java binding for Playwright, and it is decent. But most of what makes Playwright
pleasant in TypeScript — the fixture model, the typed `test.extend`, the ecosystem, the
examples you find when you search an error — is centred on TypeScript. Playwright-Java gets
you auto-waiting and the trace viewer without the fixture model, so you keep writing
`@BeforeEach`. That is a real improvement and a much smaller change, and for a Java team it
is often the right middle path. But it is not the thing people mean when they say "we moved
to Playwright".

The honest version of this argument: **tooling choices are mostly people choices.** A
Selenium suite that five engineers can confidently modify is worth more than a Playwright
suite that one engineer understands and the rest are afraid to touch. I have seen the second
thing. It looks like success for about four months.

### 3. Deep enterprise integrations already exist

Large organisations accumulate infrastructure around whatever they standardised on ten years
ago:

- A **Selenium Grid** with autoscaling, per-team quotas, and dashboards someone maintains.
- **Test management integration** — Zephyr, qTest, ALM — wired to JUnit XML with custom
  listeners and a results-sync job.
- **Reporting** the business actually looks at. Allure with a decade of history, trend
  graphs the QA manager takes to a steering committee, and a defined RAG status.
- **Compliance and audit.** In regulated industries the test framework can be part of a
  validated system. Changing it means requalification: documentation, sign-off, sometimes an
  external auditor. That cost is measured in months and can dwarf any efficiency gain.
- **Shared internal libraries.** The company's own `test-commons` jar with authentication
  for the internal SSO, PII-safe test data generation, and the encryption helper for the
  payments sandbox. Rewriting all of that in TypeScript is the real project, and the
  Selenium-to-Playwright part is the easy bit.

None of these are reasons Selenium is *technically* better. They are reasons the total cost
of the change is far higher than the framework comparison suggests, and an engineer who
only compares frameworks will underestimate it by an order of magnitude.

### 4. The suite works

This is the important one, so it goes last.

**A working test suite is rarely worth rewriting because something newer exists.**

If your Selenium suite runs in 20 minutes, has a 3% flake rate, catches real regressions,
and the team trusts it — the correct engineering answer is to leave it alone. The value of a
test suite is the confidence it produces, and a rewrite spends that confidence to buy
efficiency you may not need. During a rewrite you have two suites: the old one nobody wants
to fix because it is going away, and the new one that does not cover everything yet. That
gap is where production bugs live, and it lasts as long as the migration does, which is
always longer than planned.

I would only argue for migrating if I could point at a specific, measured pain:

- Flake rate high enough that the team has stopped believing the results — the real
  threshold is behavioural, not numerical. When people re-run before reading, you are done.
- Runtime blocking the deployment pipeline, after parallelism has been genuinely exhausted.
- Whole categories of behaviour that cannot be tested at all — error states, offline,
  slow networks — and those gaps are producing incidents.
- Grid maintenance consuming a meaningful share of a person.
- Hiring: you cannot find people who want to write Selenium in 2026, and the suite is
  becoming a single point of human failure.

Absent at least two of those, "we should move to Playwright" is a preference, not an
engineering case, and I would say so in the meeting even though Playwright is what I would
rather be writing.

---

## How I would actually run a migration

If the case *is* made, I would not do a rewrite. I would do a strangler.

1. **Instrument first.** Before changing anything, measure: flake rate per test, runtime per
   test, failure causes for a month. Without a baseline you cannot tell whether the
   migration helped, and you will be asked. (This is the entire reason I built Flakeboard.)
2. **New tests only, for one quarter.** Every new feature gets Playwright tests. Nothing is
   ported. Both suites run in CI. The team learns on low-stakes work.
3. **Port the worst offenders, not the easiest.** Take the ten tests with the highest flake
   rate from step 1. They are usually the ones fighting timing or needing network control,
   which is where the new tool wins biggest — a visible result that funds the rest.
4. **Port by feature area, deleting as you go.** Never leave both versions of the same test
   running: the day they disagree, nobody knows which to believe.
5. **Keep Selenium for the things it is better at,** if any remain. Running an IE11 smoke
   suite in Selenium alongside a Playwright suite for everything else is not a failure of
   the migration. It is the right architecture for a requirement that has not gone away.
6. **Delete the Grid last,** and only when nothing needs it. The standing infrastructure is
   the biggest cost saving and the most disruptive thing to remove prematurely.

Expected shape: a quarter before it feels normal, two to three quarters before the old suite
is mostly gone, and a permanent residue of Selenium if there is a legacy browser requirement.
Anyone promising a clean six-week cutover for a 400-test suite has not done one.

---

## What I miss from the Java stack

To be fair to the tool I spent two years with:

- **The IDE.** IntelliJ's Java support is better than any TypeScript tooling I have used.
  Refactoring across 400 test classes was genuinely safe. `rename symbol` in TypeScript is
  good; it is not "IntelliJ moving a method and updating every call site including the ones
  in Spring XML" good.
- **The type system, at the edges.** TypeScript's types vanish at runtime. A malformed API
  response in Java fails at deserialisation with a clear message; in TypeScript a
  `as RunsPage` cast is a promise the compiler believes and the runtime does not check. That
  is exactly why `utils/schema.ts` in this repo validates payloads field by field rather
  than trusting a cast — I am rebuilding, by hand, a guarantee Jackson gave me for free.
- **JUnit 5's parameterised tests.** `@ParameterizedTest` with `@CsvSource`, `@MethodSource`
  and argument converters is more expressive than a `for` loop around `test()`. The loop
  works and Playwright reports each iteration as its own test, but I miss the declarative
  version.
- **Maven's reproducibility.** `mvn clean verify` builds the same thing on every machine in
  a way `npm ci` mostly does but not quite as absolutely. The JVM ecosystem's attitude to
  breaking changes is also, frankly, more grown-up than npm's.
- **Allure.** Playwright's HTML report is better for debugging a single run. Allure is
  better at trends across runs, history, and being the thing a QA manager screenshots for a
  steering committee. Playwright's report is a developer tool; Allure is also a
  communication tool.

---

## The summary I would give in an interview

Playwright removed the two things that made my Selenium suite expensive: staleness and the
inability to control the network. That eliminated about two-thirds of my failure triage and
opened up whole categories of test — error states, empty states, loading states — that were
previously untestable without infrastructure I could not get approved.

It did not make test design easier. Deciding what to assert, keeping tests independent,
choosing the right level to test at, and knowing when a UI test is the wrong tool — all of
that is the same job, and I learned it writing Selenium.

If I joined a team with a working Selenium suite tomorrow, I would not propose replacing it
in my first month. I would measure it first, fix the top ten flakes in place, and only make
the case for a migration if the numbers made it. If they did not, I would be happy writing
Java, and the suite would be better either way.
