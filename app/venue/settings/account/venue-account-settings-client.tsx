"use client";

import { useState } from "react";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface VenueAccountSettingsClientProps {
  userId: string;
  userEmail: string;
}

export default function VenueAccountSettingsClient({
  userId,
  userEmail,
}: VenueAccountSettingsClientProps) {
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
    // TODO: Call API to change email (typically sends verification to new email)
    setTimeout(() => {
      setIsChangingEmail(false);
      setNewEmail("");
      setEmailPassword("");
      // Show success message: "Verification email sent to new address"
    }, 500);
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError("");

    if (newPassword !== confirmPassword) {
      setPasswordError("New passwords do not match");
      return;
    }

    if (newPassword.length < 8) {
      setPasswordError("Password must be at least 8 characters");
      return;
    }

    setIsChangingPassword(true);
    // TODO: Call API to change password
    setTimeout(() => {
      setIsChangingPassword(false);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      // Show success message
    }, 500);
  };

  const handleDisableAccount = async () => {
    setIsDisabling(true);
    // TODO: Call API to disable account
    setTimeout(() => {
      setIsDisabling(false);
      setShowDisableDialog(false);
      // Redirect to login or show success
    }, 500);
  };

  return (
    <div className="page-container">
      <div>
        <h1 className="page-title">Account Settings</h1>
        <p className="page-description">
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
            <div className="button-group-end">
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
            <div className="button-group-end">
              <Button type="submit" disabled={isChangingPassword}>
                {isChangingPassword ? "Updating..." : "Update Password"}
              </Button>
            </div>
          </Field>
        </FieldGroup>
      </form>

      {/* Account Actions Section */}
      <FieldGroup>
        <FieldSeparator />
        <FieldSet>
          <FieldLegend>Danger Zone</FieldLegend>
          <FieldDescription>
            Irreversible actions for your account
          </FieldDescription>

          <div className="rounded-lg border border-destructive/50 p-4 space-y-4">
            <div>
              <h3 className="font-medium mb-2">Disable Account</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Temporarily disable your account. You can reactivate it by
                logging in again within 30 days.
              </p>
              <Button
                type="button"
                variant="outline"
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
              variant="outline"
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