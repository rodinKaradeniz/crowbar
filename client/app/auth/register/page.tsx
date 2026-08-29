import type { Metadata } from "next";

import {
  AuthMark,
  AuthPage,
  AuthPanel,
  AuthSplit,
} from "@/components/auth/auth-shell";
import { RegisterForm } from "@/components/register-form";

export const metadata: Metadata = {
  title: "Create an account · Crowbar",
};

/**
 * Form first, panel second — the mirror of sign-in, so the two screens do not
 * read as the same page with different words.
 *
 * THE SETUP LIST IS NOT THE CANVAS'S. The canvas opens with "Upload the menu as
 * a spreadsheet"; there is no import endpoint anywhere in the product, and the
 * FAQ answer on the landing page was corrected for the same reason. These four
 * are what setting up a venue actually involves.
 */
const SETUP_STEPS = [
  "Set your service hours",
  "Draw the floor and name the tables",
  "Enter the menu and its recipes",
  "Invite the people on tonight",
];

export default function RegisterPage() {
  return (
    <AuthPage>
      <AuthSplit
        panelSide="end"
        panel={
          <AuthPanel>
            <AuthMark />

            <div>
              <h2 className="auth-panel-h-sm mb-6">
                Set up before
                <br />
                the next service.
              </h2>

              <ol className="flex flex-col border-t border-border">
                {SETUP_STEPS.map((label, index) => (
                  <li
                    key={label}
                    className={
                      index === SETUP_STEPS.length - 1
                        ? "flex gap-3.5 py-3.5"
                        : "flex gap-3.5 border-b border-border py-3.5"
                    }
                  >
                    <span
                      className={
                        index === 0
                          ? "font-mono text-[12px] text-primary"
                          : "font-mono text-[12px] text-text-on-ink-faint"
                      }
                    >
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span
                      className={
                        index === 0
                          ? "text-[14.5px] text-text-on-ink-2"
                          : "text-[14.5px] text-muted-foreground"
                      }
                    >
                      {label}
                    </span>
                  </li>
                ))}
              </ol>
            </div>

            {/* A commercial claim, not a product state — there is no
                subscription model on Business, so nothing here counts down. */}
            <p className="mkt-chip text-text-on-ink-faint">30 days · no card</p>
          </AuthPanel>
        }
      >
        <RegisterForm />
      </AuthSplit>
    </AuthPage>
  );
}
