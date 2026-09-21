/**
 * What a demo fixture may never contain. Shared by the recorder, which refuses
 * to write a violating recording, and `tests/unit/demo-fixtures.test.ts`, which
 * fails if a hand edit slips one in.
 *
 * - People are obviously fictional: reserved example domains, 555 numbers.
 * - No known demo password.
 * - The non-fiscal boundary: nothing says paid, payment processed or revenue.
 */

const EMAIL_RE = /[A-Za-z0-9._%+-]+@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;
const FICTIONAL_DOMAIN_RE = /(^|\.)(example\.(com|org|net)|example|invalid|test)$/i;
/** A value that reads as a phone number: E.164-style, or under a phone-named key. */
const PHONE_RE = /^\+[0-9][0-9 ()-]{6,}[0-9]$/;
const PHONE_KEY_RE = /phone|mobile|(^|_)tel($|_)/i;
const FORBIDDEN = [
  // Written so this file never contains the literal the portfolio export guards.
  [/password(?:123)(?![0-9])/, "a known demo password"],
  [/(^|[^a-z])paid([^a-z]|$)/i, "“paid”"],
  [/payment[ _-]processed/i, "“payment processed”"],
  [/(^|[^a-z])revenue([^a-z]|$)/i, "“revenue”"],
];

/**
 * Backend copy that names "revenue" only to deny it, allowed by EXACT text.
 * `server/app/services/reporting_service.py` VALUE_DISCLOSURE. If the backend
 * rewords it, recording fails here until this is revisited — deliberately.
 */
const ALLOWED_PRODUCT_DISCLAIMERS = new Set([
  "Ordered value is what guests asked for. Open-tab value is what is still on tables. Externally settled value is what this venue's own register recorded. They are three different figures and none of them is revenue.",
]);

/** A reserved number that stands in for any phone the recording must not ship. */
export const FICTIONAL_PHONE = "+12025550199";

function isPhoneLike(text, key) {
  const digits = text.replace(/\D/g, "");
  return PHONE_RE.test(text) || (PHONE_KEY_RE.test(key) && digits.length >= 6);
}

/**
 * Replaces every phone number outside the reserved 555 range with
 * FICTIONAL_PHONE, in place of dropping the field, so shapes stay exact. The
 * seed gives the venue and its supplier German numbers that could be real.
 */
export function scrubNonFictionalPhones(value, key = "") {
  if (typeof value === "string") {
    return isPhoneLike(value, key) && !value.replace(/\D/g, "").includes("555") ? FICTIONAL_PHONE : value;
  }
  if (Array.isArray(value)) return value.map((item) => scrubNonFictionalPhones(item, key));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, item]) => [k, scrubNonFictionalPhones(item, k)]),
    );
  }
  return value;
}

function checkString(text, where, problems, key = "") {
  for (const match of text.matchAll(EMAIL_RE)) {
    if (!FICTIONAL_DOMAIN_RE.test(match[1])) {
      problems.push(`${where}: email outside a reserved example domain (${match[1]})`);
    }
  }
  if (isPhoneLike(text, key) && !text.replace(/\D/g, "").includes("555")) {
    problems.push(`${where}: phone number outside the reserved 555 range`);
  }
  if (ALLOWED_PRODUCT_DISCLAIMERS.has(text)) return;
  for (const [pattern, label] of FORBIDDEN) {
    if (pattern.test(text)) problems.push(`${where}: contains ${label}`);
  }
}

/**
 * @param {unknown} value
 * @param {string} [where]
 * @returns {string[]} one line per problem; empty when the value is clean
 */
export function findFixtureViolations(value, where = "$", problems = [], key = "") {
  if (typeof value === "string") {
    checkString(value, where, problems, key);
  } else if (Array.isArray(value)) {
    value.forEach((item, index) => findFixtureViolations(item, `${where}[${index}]`, problems, key));
  } else if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      checkString(key, `${where} key`, problems);
      findFixtureViolations(item, `${where}.${key}`, problems, key);
    }
  }
  return problems;
}
