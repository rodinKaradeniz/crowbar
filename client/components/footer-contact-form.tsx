"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { CheckCircle2 } from "lucide-react";

/**
 * Inline contact form for the landing footer (Phase 2.2) — same fields and
 * stubbed submit as ContactDialog, rendered in place instead of a dialog.
 * Sits inside the theme-night footer, so inputs pick up the night tokens.
 */
export function FooterContactForm() {
  const [submitted, setSubmitted] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    message: "",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // TODO: Implement contact form submission
    console.log("Contact form:", formData);
    setSubmitted(true);
    setTimeout(() => {
      setSubmitted(false);
      setFormData({ name: "", email: "", message: "" });
    }, 3000);
  };

  if (submitted) {
    return (
      <div className="flex items-center gap-3 py-8 text-sm">
        <CheckCircle2 className="h-5 w-5 text-lager" />
        <span>Message sent — we&apos;ll get back to you soon.</span>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <FieldGroup className="gap-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field>
            <FieldLabel htmlFor="footer-contact-name">Name</FieldLabel>
            <Input
              id="footer-contact-name"
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              required
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="footer-contact-email">Email</FieldLabel>
            <Input
              id="footer-contact-email"
              type="email"
              value={formData.email}
              onChange={(e) =>
                setFormData({ ...formData, email: e.target.value })
              }
              required
            />
          </Field>
        </div>
        <Field>
          <FieldLabel htmlFor="footer-contact-message">Message</FieldLabel>
          <Textarea
            id="footer-contact-message"
            value={formData.message}
            onChange={(e) =>
              setFormData({ ...formData, message: e.target.value })
            }
            rows={4}
            required
          />
        </Field>
        <Button type="submit" className="w-full sm:w-auto self-start">
          Send message
        </Button>
      </FieldGroup>
    </form>
  );
}
