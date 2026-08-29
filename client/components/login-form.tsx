"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import {
  AuthField,
  AuthNotice,
  RevealToggle,
} from "@/components/auth/auth-field";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";

/**
 * Sign in, and the credential-failure ladder.
 *
 * WHAT THE CANVAS SPECIFIES AND WHAT THE BACKEND BACKS. The canvas ladder runs
 * "attempt 1 generic → attempt 2 names attempts remaining → attempt 3 warns of
 * the lock → locked, with a countdown". There is no account-lockout model in
 * `server/app`: `auth_login_identity` is a 10-per-10-minute rate limit keyed on
 * IP plus email, and a 401 carries no attempt count. So:
 *
 *   · Rung 1 and 2 ship — the second failure reveals the password, which is the
 *     rung that actually helps, because mistyping in the dark is the likeliest
 *     cause.
 *   · "Two attempts left" does NOT ship. The client does not hold the server's
 *     counter, and a wrong number told to someone under pressure is worse than
 *     no number.
 *   · The locked rung ships against the real 429, counting down from the
 *     server's own `Retry-After`, with the two routes back in.
 *
 * Recorded in `docs/TODO.md` §7a.
 */
export function LoginForm() {
  const router = useRouter();
  const { login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [failures, setFailures] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [throttled, setThrottled] = useState(false);
  const [throttledUntil, setThrottledUntil] = useState<number | null>(null);
  const [unreachable, setUnreachable] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setUnreachable(false);
    setSubmitting(true);
    try {
      const result = await login(email, password);

      if (result.ok) {
        if (result.user.type !== "staff") {
          setFailures((count) => count + 1);
          return;
        }
        const requested = new URLSearchParams(window.location.search).get(
          "redirect",
        );
        router.push(
          requested?.startsWith("/business") ? requested : "/business/overview",
        );
        router.refresh();
        return;
      }

      if (result.reason === "throttled") {
        // No header means no honest countdown, so the screen shows the state
        // without a clock rather than guessing at the window.
        setThrottled(true);
        setThrottledUntil(
          result.retryAfterSeconds
            ? Date.now() + result.retryAfterSeconds * 1000
            : null,
        );
        return;
      }

      if (result.reason === "unreachable") {
        setUnreachable(true);
        return;
      }

      setFailures((count) => count + 1);
      setRevealed(true);
    } finally {
      setSubmitting(false);
    }
  };

  if (throttled) {
    return <ThrottledCard until={throttledUntil} />;
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <p className="mkt-eyebrow mb-2.5 text-text-muted">Sign in</p>
      <h1 className="auth-title mb-8">Open your workspace</h1>

      {unreachable ? (
        <AuthNotice>
          <p className="text-[13.5px] leading-[1.45]">
            Crowbar is not answering from this device. Check the connection and
            try again — nothing was signed in.
          </p>
        </AuthNotice>
      ) : null}

      {failures > 0 && !unreachable ? (
        <AuthNotice>
          <p className="text-[13.5px] leading-[1.45]">
            {failures === 1
              ? "That email and password don't match. Check the address first — most sign-in trouble is a personal address instead of the work one."
              : "Still no match. The password is shown below so you can read what you typed."}
          </p>
          <Link
            href="/auth/forgot-password"
            className="self-start border-b border-[var(--field-invalid-ring)] text-[13.5px] font-semibold"
          >
            Send me a reset link instead
          </Link>
        </AuthNotice>
      ) : null}

      <AuthField
        label="Email"
        type="email"
        autoComplete="email"
        placeholder="du@lokal.de"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        required
        disabled={submitting}
        invalid={failures > 0 && !unreachable}
        className="mb-[18px]"
      />

      <AuthField
        label="Password"
        type={revealed ? "text" : "password"}
        autoComplete="current-password"
        placeholder="••••••••••"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        required
        disabled={submitting}
        invalid={failures > 0 && !unreachable}
        trailing={
          failures > 0 ? (
            <RevealToggle
              shown={revealed}
              onToggle={() => setRevealed((shown) => !shown)}
            />
          ) : undefined
        }
      />

      <Link
        href="/auth/forgot-password"
        className="mb-1.5 inline-flex h-11 items-center text-[13.5px] text-text-secondary hover:text-primary"
      >
        Forgot your password?
      </Link>

      <Button
        type="submit"
        size="auth"
        className="mt-[18px] w-full text-[15.5px] font-semibold"
        disabled={submitting}
      >
        {submitting ? "Signing in" : "Sign in"}
      </Button>

      <p className="mt-[22px] text-[length:var(--ui-size)] text-text-secondary">
        New venue?{" "}
        <Link
          href="/auth/register"
          className="border-b border-border-strong font-semibold"
        >
          Create an account
        </Link>
      </p>
    </form>
  );
}

/**
 * Too many attempts. Ink ground, a real countdown, and two routes back in —
 * "you are not locked out of the venue" is the whole point of the screen.
 *
 * Mounted only while throttled, so the ticking clock starts on mount.
 */
function ThrottledCard({ until }: { until: number | null }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (until === null) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [until]);

  const remaining = until === null ? null : Math.max(0, until - now);
  const clear = remaining !== null && remaining === 0;

  return (
    <div className="ground-ink -m-[13px] flex flex-col bg-background p-[13px] text-foreground">
      <p className="type-label mb-4 text-critical-text">
        {remaining === null
          ? "Too many attempts"
          : clear
            ? "You can try again"
            : `Locked · ${formatCountdown(remaining)} remaining`}
      </p>

      <h1 className="type-t1 mb-2.5">
        {clear
          ? "You can sign in again now."
          : "Too many sign-in attempts from this device."}
      </h1>

      <p className="mb-5 max-w-[38ch] text-[length:var(--ui-size)] text-muted-foreground">
        You are not locked out of the venue. The email link below works right
        now, and a manager can reset your password from Staff in a few seconds.
      </p>

      <div className="mt-auto flex flex-wrap gap-2.5">
        <Button asChild size="tablet">
          <Link href="/auth/forgot-password">Email me a reset link</Link>
        </Button>
        <Button asChild size="tablet" variant="secondary">
          <Link href="/auth/login">Back to sign in</Link>
        </Button>
      </div>
    </div>
  );
}

/** mm:ss — this is a duration, not a time of day. */
function formatCountdown(milliseconds: number): string {
  const total = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
