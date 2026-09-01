"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
  FieldSeparator,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  clientChangeEmail,
  clientChangePassword,
  clientDisableAccount,
  clientUpdateNotificationChannels,
} from "@/lib/client-api";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";

interface BusinessAccountSettingsClientProps {
  userEmail: string;
  businessId: string;
}

export default function BusinessAccountSettingsClient({
  userEmail,
  businessId,
}: BusinessAccountSettingsClientProps) {
  const router = useRouter();
  const { logout, meContext } = useAuth();

  // SMS notification state
  const [smsEnabled, setSmsEnabled] = useState(false);
  const [savingSms, setSavingSms] = useState(false);

  useEffect(() => {
    if (meContext?.business.notificationChannels) {
      setSmsEnabled(meContext.business.notificationChannels.includes("sms"));
    }
  }, [meContext]);

  const handleSmsToggle = async (enabled: boolean) => {
    setSavingSms(true);
    try {
      const channels = enabled ? ["email", "sms"] : ["email"];
      await clientUpdateNotificationChannels(businessId, channels);
      setSmsEnabled(enabled);
      toast.success(enabled ? "SMS notifications enabled" : "SMS notifications disabled");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update notification settings");
    } finally {
      setSavingSms(false);
    }
  };

  // Email change state
  const [newEmail, setNewEmail] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [isChangingEmail, setIsChangingEmail] = useState(false);
  const [emailError, setEmailError] = useState("");

  // Password change state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState("");

  // Account disable state
  const [showDisableDialog, setShowDisableDialog] = useState(false);
  const [isDisabling, setIsDisabling] = useState(false);

  const handleEmailChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailError("");

    if (!newEmail.includes("@")) {
      setEmailError("Please enter a valid email address");
      return;
    }

    if (newEmail === userEmail) {
      setEmailError("New email must be different from current email");
      return;
    }

    setIsChangingEmail(true);
    try {
      await clientChangeEmail({ new_email: newEmail, password: emailPassword });
      toast.success("Email updated. Please sign in again.");
      await logout();
      router.push("/auth/login");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to change email";
      setEmailError(message);
      toast.error(message);
    } finally {
      setIsChangingEmail(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError("");

    if (newPassword !== confirmPassword) {
      setPasswordError("New passwords do not match");
      return;
    }

    if (newPassword.length < 12 || newPassword.length > 128) {
      setPasswordError("Password must be between 12 and 128 characters");
      return;
    }

    setIsChangingPassword(true);
    try {
      await clientChangePassword({
        current_password: currentPassword,
        new_password: newPassword,
      });
      toast.success("Password updated. Please sign in again.");
      await logout();
      router.push("/auth/login");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to change password";
      setPasswordError(message);
      toast.error(message);
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleDisableAccount = async () => {
    setIsDisabling(true);
    try {
      await clientDisableAccount();
      toast.success("Account disabled");
      await logout();
      router.push("/auth/login");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to disable account";
      toast.error(message);
    } finally {
      setIsDisabling(false);
      setShowDisableDialog(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 px-[clamp(16px,2.5vw,32px)] py-6">
      <div>
        <h1 className="type-t1">Account Settings</h1>
        <p className="mt-1 text-[length:var(--ui-size)] text-muted-foreground">
          Manage your account security and preferences
        </p>
      </div>

      {/* Email Change Section */}
      <form onSubmit={handleEmailChange}>
        {/* Hidden dummy fields to absorb autofill */}
        <input type="email" name="dummy-email" autoComplete="email" className="hidden" aria-hidden="true" />
        <input type="password" name="dummy-password" autoComplete="current-password" className="hidden" aria-hidden="true" />

        <FieldGroup>
          <FieldSet>
            <FieldLegend>Email Address</FieldLegend>
            <FieldDescription>
              Change the email address associated with your account
            </FieldDescription>

            <Field>
              <FieldLabel>Current Email</FieldLabel>
              <Input value={userEmail} disabled className="bg-muted" />
            </Field>

            <Field>
                <FieldLabel htmlFor="newEmail">New Email Address</FieldLabel>
                <Input
                    id="newEmail"
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="Enter new email address"
                    autoComplete="off"
                    required
                />
            </Field>

            <Field>
                <FieldLabel htmlFor="emailPassword">
                    Confirm with Password
                </FieldLabel>
                <Input
                    id="emailPassword"
                    type="password"
                    value={emailPassword}
                    onChange={(e) => setEmailPassword(e.target.value)}
                    placeholder="Enter your current password"
                    autoComplete="off"
                    required
                />
                <FieldDescription>
                    For security, please enter your password to confirm this change
                </FieldDescription>
            </Field>

            {emailError && (
              <p className="text-sm text-destructive">{emailError}</p>
            )}
          </FieldSet>

          <Field>
            <div className="flex justify-end">
              <Button type="submit" disabled={isChangingEmail}>
                {isChangingEmail ? "Sending..." : "Update Email"}
              </Button>
            </div>
          </Field>
        </FieldGroup>
      </form>

      {/* Password Change Section */}
      <form onSubmit={handlePasswordChange}>
        <FieldGroup>
          <FieldSeparator />
          <FieldSet>
            <FieldLegend>Change Password</FieldLegend>
            <FieldDescription>
              Update your password to keep your account secure
            </FieldDescription>

            <Field>
                <FieldLabel htmlFor="currentPassword">Current Password</FieldLabel>
                <Input
                    id="currentPassword"
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    autoComplete="off"
                    required
                />
                </Field>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field>
                        <FieldLabel htmlFor="newPassword">New Password</FieldLabel>
                        <Input
                        id="newPassword"
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        autoComplete="new-password"
                        required
                        />
                    </Field>

                    <Field>
                        <FieldLabel htmlFor="confirmPassword">
                        Confirm New Password
                        </FieldLabel>
                        <Input
                        id="confirmPassword"
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        autoComplete="new-password"
                        required
                        />
                    </Field>
                </div>

            {passwordError && (
              <p className="text-sm text-destructive">{passwordError}</p>
            )}
          </FieldSet>

          <Field>
            <div className="flex justify-end">
              <Button type="submit" disabled={isChangingPassword}>
                {isChangingPassword ? "Updating..." : "Update Password"}
              </Button>
            </div>
          </Field>
        </FieldGroup>
      </form>

      {/* Notification Channels Section */}
      <FieldGroup>
        <FieldSeparator />
        <FieldSet>
          <FieldLegend>Notification channels</FieldLegend>
          <FieldDescription>
            How guests receive reservation confirmations, reminders and status updates.
          </FieldDescription>

          <div className="space-y-3 mt-2">
            {/* Email — always on */}
            <div className="border-b border-border py-[var(--space-16)]">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h3 className="type-t2">Email</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Sent to {userEmail}. Email notifications are always enabled.
                  </p>
                </div>
                {/* No green "on" tick. It is a fact, not good news. */}
                <span className="type-micro shrink-0 text-muted-foreground">Always on</span>
              </div>
            </div>

            {/* SMS — toggleable */}
            {/* A checkbox, not a hand-rolled sliding switch. §06 declares no
                switch primitive, and the old one carried its own rounded-full
                track, a shadow-lg (E1 — a dialog's elevation, on a settings
                row) and disabled:opacity-50, which is the disabled treatment
                the system forbids. */}
            <div className="flex items-start gap-[var(--space-12)] border-b border-border py-[var(--space-16)]">
              <Checkbox
                id="sms-notifications"
                checked={smsEnabled}
                disabled={savingSms}
                onCheckedChange={(next: boolean | "indeterminate") => handleSmsToggle(next === true)}
                className="mt-0.5"
              />
              <div className="flex-1">
                <Label htmlFor="sms-notifications" className="type-t2 normal-case">
                  SMS
                </Label>
                <p className="mt-0.5 text-[length:var(--ui-size)] text-muted-foreground">
                  Guests receive an SMS when reservations are confirmed, updated
                  or cancelled. Requires SMS delivery to be configured on the
                  server.
                </p>
              </div>
            </div>
          </div>
        </FieldSet>
      </FieldGroup>

      {/* Account Actions Section */}
      <FieldGroup>
        <FieldSeparator />
        <FieldSet>
          <FieldLegend>Danger zone</FieldLegend>
          <FieldDescription>
            Actions that cannot be undone.
          </FieldDescription>

          <div className="border-t-2 border-critical-fill pt-[var(--space-16)] space-y-4">
            <div>
              <h3 className="type-t2 mb-2">Disable account</h3>
              <p className="mb-4 text-[length:var(--ui-size)] text-muted-foreground">
                Temporarily disable your account. You can reactivate it by
                logging in again within 30 days.
              </p>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setShowDisableDialog(true)}
              >
                Disable Account
              </Button>
            </div>
          </div>
        </FieldSet>
      </FieldGroup>

      {/* Disable Account Dialog */}
      <Dialog open={showDisableDialog} onOpenChange={setShowDisableDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Disable Account</DialogTitle>
            <DialogDescription>
              Are you sure you want to disable your account?
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              Your account will be disabled immediately. We will keep your data
              for 30 days. If you log in again during this period, your account
              will be automatically re-enabled. After 30 days, your account and
              all associated data will be permanently deleted.
            </p>
            <p className="text-sm font-medium">Account: {userEmail}</p>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowDisableDialog(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleDisableAccount}
              disabled={isDisabling}
            >
              {isDisabling ? "Disabling..." : "Disable Account"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
