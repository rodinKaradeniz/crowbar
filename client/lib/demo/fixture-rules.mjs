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
const PHONE_RE = /^\+?[0-9][0-9 ()-]{6,}[0-9]$/;
const FORBIDDEN = [
  // Written so this file never contains the literal the portfolio export guards.
  [/password(?:123)(?![0-9])/, "a known demo password"],
  [/(^|[^a-z])paid([^a-z]|$)/i, "“paid”"],
  [/payment[ _-]processed/i, "“payment processed”"],
  [/(^|[^a-z])revenue([^a-z]|$)/i, "“revenue”"],
];

function checkString(text, where, problems) {
  for (const match of text.matchAll(EMAIL_RE)) {
    if (!FICTIONAL_DOMAIN_RE.test(match[1])) {
      problems.push(`${where}: email outside a reserved example domain (${match[1]})`);
    }
  }
  if (PHONE_RE.test(text) && text.replace(/\D/g, "").length >= 8 && !text.replace(/\D/g, "").includes("555")) {
    problems.push(`${where}: phone number outside the reserved 555 range`);
  }
  for (const [pattern, label] of FORBIDDEN) {
    if (pattern.test(text)) problems.push(`${where}: contains ${label}`);
  }
}

/**
 * @param {unknown} value
 * @param {string} [where]
 * @returns {string[]} one line per problem; empty when the value is clean
 */
export function findFixtureViolations(value, where = "$", problems = []) {
  if (typeof value === "string") {
    checkString(value, where, problems);
  } else if (Array.isArray(value)) {
    value.forEach((item, index) => findFixtureViolations(item, `${where}[${index}]`, problems));
  } else if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      checkString(key, `${where} key`, problems);
      findFixtureViolations(item, `${where}.${key}`, problems);
    }
  }
  return problems;
}
