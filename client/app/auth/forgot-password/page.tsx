import type { Metadata } from "next";

import { AuthCard, AuthPage } from "@/components/auth/auth-shell";
import { ForgotPasswordForm } from "@/components/forgot-password-form";

export const metadata: Metadata = {
  title: "Reset your password · Crowbar",
};

/** A single-column card — §04 of the canvas. No panel, nothing to sell here. */
export default function ForgotPasswordPage() {
  return (
    <AuthPage>
      <div className="mx-auto w-full max-w-[440px]">
        <AuthCard>
          <ForgotPasswordForm />
        </AuthCard>
      </div>
    </AuthPage>
  );
}
