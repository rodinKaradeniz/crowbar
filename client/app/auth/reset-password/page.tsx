import type { Metadata } from "next";

import { AuthPage } from "@/components/auth/auth-shell";
import { ResetPasswordForm } from "@/components/reset-password-form";

export const metadata: Metadata = {
  title: "Set a new password · Crowbar",
};

/**
 * The form owns its own card, because its three states sit on three different
 * grounds: paper while setting the password, ink when the link is dead, brand
 * when it worked.
 */
export default function ResetPasswordPage() {
  return (
    <AuthPage>
      <div className="mx-auto w-full max-w-[440px]">
        <ResetPasswordForm />
      </div>
    </AuthPage>
  );
}
