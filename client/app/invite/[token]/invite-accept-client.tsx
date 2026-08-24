"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Field,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";

interface Props {
  invite: {
    email: string;
    role: string;
    business_name: string;
  };
}

export default function InviteAcceptClient({ invite }: Props) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const roleDisplay = invite.role.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/invite/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.code === "EMAIL_EXISTS") {
          setError(
            "An account with this email already exists. Please log in at /auth/login."
          );
        } else if (data.code === "INVITATION_EXPIRED") {
          setError("This invitation has expired. Please ask the business owner to send a new one.");
        } else if (data.code === "INVITATION_USED") {
          setError("This invitation has already been accepted.");
        } else {
          setError(data.error || "Something went wrong. Please try again.");
        }
        return;
      }

      router.push("/business/overview");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="max-w-md w-full mx-auto p-8 border rounded-lg bg-card">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-semibold mb-1">You&apos;re invited</h1>
          <p className="text-muted-foreground">
            Join <strong>{invite.business_name}</strong> as{" "}
            <strong>{roleDisplay}</strong>
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel>Email</FieldLabel>
              <Input value={invite.email} disabled />
            </Field>

            <Field>
              <FieldLabel>Your name</FieldLabel>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Full name"
                required
                autoFocus
              />
            </Field>

            <Field>
              <FieldLabel>Password</FieldLabel>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Choose a password"
                required
                minLength={8}
              />
            </Field>
          </FieldGroup>

          {error && (
            <p className="mt-4 text-sm text-destructive">{error}</p>
          )}

          <Button type="submit" className="w-full mt-6" disabled={isSubmitting}>
            {isSubmitting ? "Creating account..." : "Accept Invitation"}
          </Button>
        </form>
      </div>
    </div>
  );
}
