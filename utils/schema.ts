import type { Run, RunDetail, RunsPage, RunStatus, TestResult } from './types';

/**
 * Hand-rolled structural validation.
 *
 * Deliberately no zod/ajv: this is a portfolio repo and the point is to show the contract
 * being checked field by field, not to show that a dependency can be installed. Each
 * validator returns a list of human-readable violations and asserts nothing itself, so a
 * failure message names the exact field rather than "expected true, received false".
 */

export type Violations = string[];

const STATUSES: readonly RunStatus[] = ['passed', 'failed', 'flaky'];

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const check = (out: Violations, ok: boolean, message: string): void => {
  if (!ok) out.push(message);
};

const isIsoDate = (v: unknown): boolean =>
  typeof v === 'string' && !Number.isNaN(Date.parse(v)) && v.includes('T');

const isNonEmptyString = (v: unknown): boolean => typeof v === 'string' && v.length > 0;

const isNonNegativeInt = (v: unknown): boolean =>
  typeof v === 'number' && Number.isInteger(v) && v >= 0;

export function validateRun(value: unknown, path = 'run'): Violations {
  const out: Violations = [];
  if (!isRecord(value)) return [`${path} is not an object`];

  check(out, isNonEmptyString(value.id), `${path}.id must be a non-empty string`);
  check(out, isNonEmptyString(value.branch), `${path}.branch must be a non-empty string`);
  check(out, typeof value.commitMessage === 'string', `${path}.commitMessage must be a string`);
  check(out, isNonEmptyString(value.commitSha), `${path}.commitSha must be a non-empty string`);
  check(
    out,
    STATUSES.includes(value.status as RunStatus),
    `${path}.status must be one of ${STATUSES.join('|')}, got ${String(value.status)}`,
  );
  check(out, isIsoDate(value.startedAt), `${path}.startedAt must be an ISO timestamp`);
  check(out, isNonNegativeInt(value.durationMs), `${path}.durationMs must be a non-negative integer`);

  for (const field of ['total', 'passed', 'failed', 'flaky'] as const) {
    check(out, isNonNegativeInt(value[field]), `${path}.${field} must be a non-negative integer`);
  }

  const { total, passed, failed, flaky } = value as unknown as Run;
  if ([total, passed, failed, flaky].every((n) => typeof n === 'number')) {
    check(
      out,
      passed + failed + flaky === total,
      `${path} counts do not reconcile: ${passed}+${failed}+${flaky} !== ${total}`,
    );
  }

  return out;
}

export function validateTestResult(value: unknown, path = 'test'): Violations {
  const out: Violations = [];
  if (!isRecord(value)) return [`${path} is not an object`];

  check(out, isNonEmptyString(value.id), `${path}.id must be a non-empty string`);
  check(out, isNonEmptyString(value.title), `${path}.title must be a non-empty string`);
  check(out, isNonEmptyString(value.file), `${path}.file must be a non-empty string`);
  check(
    out,
    STATUSES.includes(value.status as RunStatus),
    `${path}.status must be one of ${STATUSES.join('|')}`,
  );
  check(out, isNonNegativeInt(value.durationMs), `${path}.durationMs must be a non-negative integer`);
  check(out, isNonNegativeInt(value.retries), `${path}.retries must be a non-negative integer`);
  check(
    out,
    value.error === undefined || typeof value.error === 'string',
    `${path}.error must be a string when present`,
  );

  const t = value as unknown as TestResult;
  if (t.status === 'passed') {
    check(out, t.error === undefined, `${path} passed but carries an error string`);
  }

  return out;
}

export function validateRunDetail(value: unknown): Violations {
  const out = validateRun(value, 'runDetail');
  if (!isRecord(value)) return out;

  if (!Array.isArray(value.tests)) {
    out.push('runDetail.tests must be an array');
    return out;
  }

  (value.tests as unknown[]).forEach((t, i) => {
    out.push(...validateTestResult(t, `runDetail.tests[${i}]`));
  });

  const detail = value as unknown as RunDetail;
  check(
    out,
    detail.tests.length === detail.total,
    `runDetail.total (${detail.total}) must equal tests.length (${detail.tests.length})`,
  );

  return out;
}

export function validateRunsPage(value: unknown): Violations {
  const out: Violations = [];
  if (!isRecord(value)) return ['response is not an object'];

  if (!Array.isArray(value.items)) out.push('response.items must be an array');
  check(out, isNonNegativeInt(value.total), 'response.total must be a non-negative integer');
  check(out, isNonNegativeInt(value.page), 'response.page must be a non-negative integer');
  check(out, isNonNegativeInt(value.pageSize), 'response.pageSize must be a non-negative integer');

  if (Array.isArray(value.items)) {
    (value.items as unknown[]).forEach((run, i) => {
      out.push(...validateRun(run, `response.items[${i}]`));
    });
    const page = value as unknown as RunsPage;
    check(
      out,
      page.items.length <= page.pageSize,
      `page returned ${page.items.length} items for pageSize ${page.pageSize}`,
    );
  }

  return out;
}

export function validateFlakyResponse(value: unknown): Violations {
  const out: Violations = [];
  if (!isRecord(value)) return ['response is not an object'];

  if (!Array.isArray(value.series)) {
    out.push('response.series must be an array');
  } else {
    (value.series as unknown[]).forEach((point, i) => {
      if (!isRecord(point)) {
        out.push(`series[${i}] is not an object`);
        return;
      }
      check(
        out,
        typeof point.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(point.date),
        `series[${i}].date must be YYYY-MM-DD`,
      );
      check(
        out,
        typeof point.flakeRate === 'number' && point.flakeRate >= 0 && point.flakeRate <= 1,
        `series[${i}].flakeRate must be between 0 and 1`,
      );
    });
  }

  if (!Array.isArray(value.topFlaky)) {
    out.push('response.topFlaky must be an array');
  } else {
    (value.topFlaky as unknown[]).forEach((t, i) => {
      if (!isRecord(t)) {
        out.push(`topFlaky[${i}] is not an object`);
        return;
      }
      check(out, isNonEmptyString(t.testId), `topFlaky[${i}].testId must be a non-empty string`);
      check(out, isNonEmptyString(t.title), `topFlaky[${i}].title must be a non-empty string`);
      check(out, isNonEmptyString(t.file), `topFlaky[${i}].file must be a non-empty string`);
      check(
        out,
        typeof t.flakeRate === 'number' && t.flakeRate >= 0 && t.flakeRate <= 1,
        `topFlaky[${i}].flakeRate must be between 0 and 1`,
      );
      check(out, isNonNegativeInt(t.failures), `topFlaky[${i}].failures must be a non-negative integer`);
      check(out, isNonNegativeInt(t.runs), `topFlaky[${i}].runs must be a non-negative integer`);
      if (typeof t.failures === 'number' && typeof t.runs === 'number') {
        check(out, t.failures <= t.runs, `topFlaky[${i}] has more failures than runs`);
      }
    });
  }

  return out;
}
