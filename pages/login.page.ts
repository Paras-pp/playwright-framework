import type { Locator, Page } from '@playwright/test';

import { NAME } from '../utils/accessible-names';
import { ROUTES, TOKEN_STORAGE_KEY } from '../utils/test-data';
import { BasePage } from './base.page';

export interface Credentials {
  email: string;
  password: string;
}

export class LoginPage extends BasePage {
  get path(): string {
    return ROUTES.login;
  }
  readonly root: Locator;

  /* Real <label for> bindings are a contract requirement, so getByLabel is the primary
   * strategy here. If these ever break, the fix is in the app's markup, not the test —
   * a field a screen reader cannot name is a bug regardless of what Playwright thinks. */
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly submitButton: Locator;
  readonly errorMessage: Locator;

  constructor(page: Page) {
    super(page);
    this.root = page.getByTestId('login-form');
    this.emailInput = page.getByLabel(NAME.emailField);
    this.passwordInput = page.getByLabel(NAME.passwordField);
    this.submitButton = page.getByRole('button', { name: NAME.signInButton });
    this.errorMessage = page.getByTestId('login-error');
  }

  async fillCredentials({ email, password }: Credentials): Promise<void> {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
  }

  async submit(): Promise<void> {
    await this.submitButton.click();
  }

  /** Fill and submit. Returns immediately; the spec asserts on the outcome. */
  async login(credentials: Credentials): Promise<void> {
    await this.fillCredentials(credentials);
    await this.submit();
  }

  /**
   * Submit via the keyboard. Proves the form is a real `<form>` with a submit button
   * rather than a div with a click handler — a thing that only breaks for keyboard users
   * and is therefore never caught by hand-testing.
   */
  async loginWithEnterKey(credentials: Credentials): Promise<void> {
    await this.fillCredentials(credentials);
    await this.passwordInput.press('Enter');
  }

  /** Reads the persisted token. Returns null when logged out. */
  async storedToken(): Promise<string | null> {
    return this.page.evaluate(
      (key: string) => window.localStorage.getItem(key),
      TOKEN_STORAGE_KEY,
    );
  }
}
