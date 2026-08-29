/** The product's real minimum. The canvas says 10; `PASSWORD_MIN_LENGTH` is 12. */
export const PASSWORD_MIN_LENGTH = 12;

export type PasswordVerdict = {
  /** 0–4 filled segments. */
  score: number;
  label: string;
  tone: "invalid" | "neutral" | "brand";
};

/**
 * Length and character variety, and nothing else. Both are checkable in the
 * browser, so the meter never makes a claim it cannot back.
 */
export function gradePassword(password: string): PasswordVerdict {
  if (password.length === 0) {
    return { score: 0, label: "", tone: "neutral" };
  }
  if (password.length < PASSWORD_MIN_LENGTH) {
    return {
      score: 1,
      label: `Too short — ${PASSWORD_MIN_LENGTH} characters minimum`,
      tone: "invalid",
    };
  }

  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((pattern) =>
    pattern.test(password),
  ).length;

  if (password.length >= 16 && classes >= 3) {
    return { score: 4, label: "Strong enough", tone: "brand" };
  }
  if (password.length >= 14 || classes >= 3) {
    return { score: 3, label: "Strong enough", tone: "brand" };
  }
  return { score: 2, label: "Long enough. Longer is better.", tone: "neutral" };
}

/**
 * Four segments and one line of verdict.
 *
 * IT DOES NOT USE THE ATTEND COLOUR. The Auth canvas's notes say "amber is a
 * password that isn't strong enough yet", but §08 of the System canvas puts
 * exactly this case on the form-validation channel instead — "'Too short — 10
 * characters minimum' is this, not attend" — and §08 is the governing rank.
 * A weak-but-valid password is drawn neutral rather than borrowing a service
 * alarm. Recorded as an open design question in `docs/TODO.md` §7b.
 */
export function PasswordStrength({ verdict }: { verdict: PasswordVerdict }) {
  if (verdict.score === 0) return null;

  const fill =
    verdict.tone === "invalid"
      ? "bg-field-invalid"
      : verdict.tone === "brand"
        ? "bg-primary"
        : "bg-text-faint";

  return (
    <div className="mt-2">
      <div className="flex gap-[5px]" aria-hidden>
        {[0, 1, 2, 3].map((segment) => (
          <span
            key={segment}
            className={`h-[3px] flex-1 ${segment < verdict.score ? fill : "bg-line-soft-2"}`}
          />
        ))}
      </div>
      <p
        className={`mkt-eyebrow mt-2 tracking-[0.06em] ${
          verdict.tone === "invalid"
            ? "text-field-invalid"
            : verdict.tone === "brand"
              ? "text-primary"
              : "text-muted-foreground"
        }`}
      >
        {verdict.label}
      </p>
    </div>
  );
}
