"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { AuthField, AuthNotice, RevealToggle } from "@/components/auth/auth-field";
import {
  gradePassword,
  PASSWORD_MIN_LENGTH,
  PasswordStrength,
} from "@/components/auth/password-strength";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  clientGetRegionalOptions,
  clientGetRegionalSuggestion,
} from "@/lib/client-api";
import type { RegionalOption } from "@/types";

/**
 * Create an account, in two steps — §02 of the Auth canvas.
 *
 * The canvas's step 1 asks for venue name, your name, "covers a night" and work
 * email. `covers a night` is not a field this product has, so it is not
 * invented; the real registration payload also needs a slug, a country, a phone
 * and a password, and none of those is dropped to make the artboard fit. Step 1
 * is who and where; step 2 is the password and the optional detail.
 */
export function RegisterForm() {
  const router = useRouter();

  const [step, setStep] = useState<1 | 2>(1);
  const [ownerName, setOwnerName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [businessSlug, setBusinessSlug] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [countryCode, setCountryCode] = useState("DE");
  const [currencyCode, setCurrencyCode] = useState("EUR");
  const [formatLocale, setFormatLocale] = useState("de-DE");
  const [taxLabel, setTaxLabel] = useState("VAT");
  const [countries, setCountries] = useState<RegionalOption[]>([]);
  const [address, setAddress] = useState("");
  const [description, setDescription] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [timezone] = useState(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    } catch {
      return "UTC";
    }
  });

  useEffect(() => {
    void clientGetRegionalOptions("en")
      .then((options) => setCountries(options.countries))
      .catch(() => {});
  }, []);

  async function changeCountry(code: string) {
    setCountryCode(code);
    try {
      const suggestion = await clientGetRegionalSuggestion(code);
      setCurrencyCode(suggestion.currencyCode);
      setFormatLocale(suggestion.locale);
      setTaxLabel(suggestion.taxLabel);
    } catch {
      // Every regional field is editable during onboarding.
    }
  }

  const handleBusinessName = (value: string) => {
    setBusinessName(value);
    setBusinessSlug(
      value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, ""),
    );
  };

  const verdict = gradePassword(password);
  const mismatch = confirmPassword.length > 0 && confirmPassword !== password;

  const stepOneComplete =
    businessName.trim().length > 0 &&
    businessSlug.trim().length > 0 &&
    ownerName.trim().length > 0 &&
    email.trim().length > 0 &&
    phone.trim().length > 0;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (step === 1) {
      if (stepOneComplete) setStep(2);
      return;
    }

    if (password.length < PASSWORD_MIN_LENGTH || password !== confirmPassword) {
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: ownerName,
          email,
          phone,
          password,
          businessName,
          businessSlug,
          businessAddress: address || null,
          businessDescription: description || null,
          countryCode,
          currencyCode,
          locale: formatLocale,
          timezone,
          taxLabel,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(
          typeof body.error === "string"
            ? body.error
            : "Crowbar could not create the workspace. Try again in a moment.",
        );
        return;
      }
      router.push("/business/onboarding");
      router.refresh();
    } catch {
      setError(
        "Crowbar is not answering from this device. Nothing was created.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} noValidate>
      <p className="mkt-eyebrow mb-2.5 text-text-muted">
        Create account · Step {step} of 2
      </p>
      <h1 className="auth-title mb-7">
        {step === 1 ? "Name the venue" : "Pick a password"}
      </h1>

      {error ? (
        <AuthNotice>
          <p className="text-[13.5px] leading-[1.45]">{error}</p>
        </AuthNotice>
      ) : null}

      {step === 1 ? (
        <>
          <AuthField
            label="Venue name"
            placeholder="Zur Eiche"
            value={businessName}
            onChange={(event) => handleBusinessName(event.target.value)}
            required
            className="mb-4"
          />

          <AuthField
            label="Public address"
            value={businessSlug}
            onChange={(event) => setBusinessSlug(event.target.value)}
            required
            hint={`Guests will book at /reserve/${businessSlug || "your-venue"}`}
            className="mb-4"
          />

          <div className="mb-4 flex flex-wrap gap-3.5">
            <AuthField
              label="Your name"
              placeholder="Marisol Vega"
              autoComplete="name"
              value={ownerName}
              onChange={(event) => setOwnerName(event.target.value)}
              required
              className="flex-[1_1_150px]"
            />
            <div className="flex-[1_1_150px]">
              <Label className="mb-[7px]">Venue country</Label>
              <Select
                value={countryCode}
                onValueChange={(value) => void changeCountry(value)}
              >
                <SelectTrigger className="h-12 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {countries.map((option) => (
                    <SelectItem key={option.code} value={option.code}>
                      {option.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-2 text-[12.5px] text-text-muted">
                Sets your currency, date format and {taxLabel} label. All
                editable later.
              </p>
            </div>
          </div>

          <AuthField
            label="Work email"
            type="email"
            autoComplete="email"
            placeholder="du@lokal.de"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            hint="Staff get their own invitations later — this one is yours."
            className="mb-4"
          />

          <AuthField
            label="Venue phone"
            type="tel"
            autoComplete="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            required
            hint="A national or international number for the country above."
            className="mb-6"
          />

          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="submit"
              size="auth"
              className="px-[26px] text-[15.5px] font-semibold"
              disabled={!stepOneComplete}
            >
              Continue
            </Button>
            <Link
              href="/auth/login"
              className="inline-flex h-[50px] items-center px-1.5 text-[length:var(--ui-size)] text-text-secondary hover:text-primary"
            >
              I already have an account
            </Link>
          </div>
        </>
      ) : (
        <>
          <div className="mb-4">
            <AuthField
              label="Password"
              type={revealed ? "text" : "password"}
              autoComplete="new-password"
              placeholder={`At least ${PASSWORD_MIN_LENGTH} characters`}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              maxLength={128}
              invalid={verdict.tone === "invalid"}
              trailing={
                password.length > 0 ? (
                  <RevealToggle
                    shown={revealed}
                    onToggle={() => setRevealed((shown) => !shown)}
                  />
                ) : undefined
              }
            />
            <PasswordStrength verdict={verdict} />
          </div>

          <AuthField
            label="Confirm"
            type={revealed ? "text" : "password"}
            autoComplete="new-password"
            placeholder="Repeat it"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            required
            maxLength={128}
            invalid={mismatch}
            hint={mismatch ? "The two don't match yet." : undefined}
            className="mb-4"
          />

          <AuthField
            label="Address"
            autoComplete="street-address"
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            hint="Optional — you can add it during setup."
            className="mb-4"
          />

          <div className="mb-6">
            <Label htmlFor="business-description" className="mb-[7px]">
              What the venue is
            </Label>
            <Textarea
              id="business-description"
              rows={3}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
            <p className="mt-2 text-[12.5px] text-text-muted">
              Optional — shown on your public booking page.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="submit"
              size="auth"
              className="px-[26px] text-[15.5px] font-semibold"
              disabled={
                isSubmitting ||
                password.length < PASSWORD_MIN_LENGTH ||
                password !== confirmPassword
              }
            >
              {isSubmitting ? "Opening the workspace" : "Open the workspace"}
            </Button>
            <button
              type="button"
              onClick={() => setStep(1)}
              className="inline-flex h-[50px] items-center px-1.5 text-[length:var(--ui-size)] text-text-secondary hover:text-primary"
            >
              ← Back
            </button>
          </div>
        </>
      )}
    </form>
  );
}
