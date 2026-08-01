/**
 * Accessible names the suite locates by.
 *
 * Kept as case-insensitive regexes in one file for a specific reason: `getByRole` couples
 * the test to user-visible copy, which is exactly what you want (it breaks when the user's
 * experience breaks) but is also the thing product changes most often. Centralising them
 * turns "we renamed the button" from a 30-file sed into a one-line diff.
 */
export const NAME = {
  /* Login */
  emailField: /e-?mail/i,
  passwordField: /password/i,
  signInButton: /sign in|log ?in/i,

  /* Layout */
  dashboardLink: /dashboard/i,
  runsLink: /runs/i,
  logoutButton: /log ?out|sign out/i,

  /* Runs list */
  searchField: /search/i,
  statusFilter: /status/i,
  nextPage: /next/i,
  previousPage: /prev/i,

  /* Run detail */
  backToRuns: /back to runs|all runs/i,

  /* Shared */
  retryButton: /retry|try again/i,
} as const;

/** `<h1>` copy per route. One h1 per page is a contract requirement. */
export const HEADING = {
  login: /flakeboard|sign in|log ?in/i,
  dashboard: /dashboard/i,
  runs: /runs/i,
  notFound: /not found|404/i,
} as const;
