import { STORAGE_STATE_ANONYMOUS, expect, test } from '../../fixtures';
import { API_GLOB, CREDENTIALS, ROUTES, TOKEN_STORAGE_KEY } from '../../utils/test-data';

/**
 * Login.
 *
 * The whole file opts out of the shared authenticated storage state — you cannot test
 * signing in while already signed in. Declaring it once at file level is clearer than
 * clearing cookies in a hook, and it means the context starts clean rather than being
 * cleaned up after the fact.
 */
test.use({ storageState: STORAGE_STATE_ANONYMOUS });

test.describe('Login', () => {
  test.beforeEach(async ({ loginPage }) => {
    await loginPage.goto();
  });

  test(
    'signs in with valid credentials and lands on the dashboard',
    { tag: ['@smoke', '@auth'] },
    async ({ page, loginPage, dashboardPage }) => {
      await loginPage.login(CREDENTIALS.valid);

      /* toHaveURL polls until the SPA finishes routing. No waitForNavigation, no sleep. */
      await expect(page).toHaveURL(new RegExp(`${ROUTES.dashboard}$`));
      await expect(dashboardPage.root).toBeVisible();
      await expect(loginPage.root).toBeHidden();
    },
  );

  test('persists the session token to localStorage', async ({ loginPage }) => {
    await loginPage.login(CREDENTIALS.valid);

    /* expect.poll turns a plain read into a web-first assertion: it re-reads until the
     * condition holds. This is the escape hatch for state that has no locator. */
    await expect
      .poll(() => loginPage.storedToken(), {
        message: `token should be written to ${TOKEN_STORAGE_KEY}`,
      })
      .toBeTruthy();
  });

  test('submits with the Enter key', { tag: ['@a11y'] }, async ({ page, loginPage }) => {
    await loginPage.loginWithEnterKey(CREDENTIALS.valid);

    await expect(page).toHaveURL(new RegExp(`${ROUTES.dashboard}$`));
  });

  test('rejects a wrong password without navigating away', async ({ page, loginPage }) => {
    await loginPage.login(CREDENTIALS.wrongPassword);

    await expect(loginPage.errorMessage).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`${ROUTES.login}$`));
    /* Negative assertion on state, not on a timer: nothing was stored. */
    expect(await loginPage.storedToken()).toBeNull();
  });

  test('rejects an unknown user', async ({ loginPage }) => {
    await loginPage.login(CREDENTIALS.unknownUser);

    await expect(loginPage.errorMessage).toBeVisible();
  });

  test('does not reveal which half of the credentials was wrong', async ({ loginPage }) => {
    await loginPage.login(CREDENTIALS.unknownUser);
    const unknownUserMessage = await loginPage.errorMessage.textContent();

    await loginPage.login(CREDENTIALS.wrongPassword);
    await expect(loginPage.errorMessage).toHaveText(unknownUserMessage ?? '');
  });

  test('keeps the typed email after a failed attempt', async ({ loginPage }) => {
    await loginPage.login(CREDENTIALS.wrongPassword);

    await expect(loginPage.errorMessage).toBeVisible();
    await expect(loginPage.emailInput).toHaveValue(CREDENTIALS.wrongPassword.email);
  });

  test('masks the password field', { tag: ['@a11y'] }, async ({ loginPage }) => {
    await expect(loginPage.passwordInput).toHaveAttribute('type', 'password');
  });

  test('surfaces a server outage during login', async ({ loginPage, mock }) => {
    /* The API is up in every other test; here we make it fall over on demand.
     * Interception is the only way to test this branch without a chaos toolkit. */
    await mock.fail(API_GLOB.login, 500, 'server_error');

    await loginPage.login(CREDENTIALS.valid);

    await expect(loginPage.errorMessage).toBeVisible();
    expect(await loginPage.storedToken()).toBeNull();
  });

  test('survives the login request being dropped', async ({ loginPage, mock }) => {
    await mock.abort(API_GLOB.login);

    await loginPage.login(CREDENTIALS.valid);

    /* A dead connection is not an HTTP error — the app must still tell the user something
     * rather than spinning forever. */
    await expect(loginPage.errorMessage).toBeVisible();
  });

  test('exposes an accessible, labelled form', { tag: ['@a11y'] }, async ({ loginPage }) => {
    /* ARIA snapshot: asserts the accessibility tree, not the DOM. It fails if a <label>
     * is dropped, a heading level changes, or a <button> becomes a <div> — the changes
     * that break assistive tech and that a CSS-selector test sails straight past. */
    await expect(loginPage.root).toMatchAriaSnapshot(`
      - textbox "Email"
      - textbox "Password"
      - button "Sign in"
    `);
  });
});
