import type { Metadata } from "next";

import {
  AuthMark,
  AuthPage,
  AuthPanel,
  AuthSplit,
} from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/login-form";

export const metadata: Metadata = {
  title: "Sign in · Crowbar",
};

/**
 * The panel sells the product and names no venue. A sign-in page does not know
 * who is arriving, and a venue's live status is not public.
 */
export default function LoginPage() {
  return (
    <AuthPage>
      <AuthSplit
        panel={
          <AuthPanel>
            <AuthMark />

            <div>
              <h2 className="auth-panel-h mb-4">
                One venue.
                <br />
                One workspace.
              </h2>
              <p className="mb-6 max-w-[34ch] text-[15.5px] leading-[1.5] text-muted-foreground">
                The door, the boards, the stock and the book — in one place, for
                the people working the room tonight.
              </p>

              <ul className="flex flex-col border-t border-border">
                {[
                  "Reservations · queue · tickets",
                  "Stock to the pour",
                  "Your register stays your register",
                ].map((line, index) => (
                  <li
                    key={line}
                    className={
                      index === 2
                        ? "mkt-eyebrow py-[11px] tracking-[0.08em] text-text-on-ink-faint"
                        : "mkt-eyebrow border-b border-border py-[11px] tracking-[0.08em] text-text-on-ink-faint"
                    }
                  >
                    {line}
                  </li>
                ))}
              </ul>
            </div>

            <p className="type-label text-[var(--text-on-ink-dimmer)]">
              crowbar.co · Berlin
            </p>
          </AuthPanel>
        }
      >
        <LoginForm />
      </AuthSplit>
    </AuthPage>
  );
}
