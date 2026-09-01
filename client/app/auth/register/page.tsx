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

              {/* THE SEQUENCING HAS TO BE UNMISTAKABLE. This list was read as
                  part of registration: it sat in numbered order beside a form
                  that says "Step 1 of 2", so two numbered sequences shared one
                  screen and only one of them was the form. The eyebrow says
                  when these happen, and the ordinals are gone — the <ol> still
                  carries the order for anything that needs it, but there are no
                  digits left to mistake for a step of the form. */}
              <p className="mkt-eyebrow mb-3.5 text-text-on-ink-faint">
                After you create the account
              </p>

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
                          ? "mkt-num text-primary"
                          : "mkt-num text-text-on-ink-faint"
                      }
                      aria-hidden
                    >
                      —
                    </span>
                    <span
                      className={
                        index === 0
                          ? "mkt-item-lg text-text-on-ink-2"
                          : "mkt-item-lg text-muted-foreground"
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
