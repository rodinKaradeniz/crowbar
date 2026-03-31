"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Mail, Phone, MapPin, ExternalLink, Copy, Check } from "lucide-react";
import { Business } from "@/types";
import { clientUpdateBusiness } from "@/lib/client-api";
import { toast } from "sonner";

interface BusinessInfoClientProps {
  businessId: string;
  initialBusiness: Business | undefined;
}

export default function BusinessInfoClient({
  businessId,
  initialBusiness,
}: BusinessInfoClientProps) {
  const router = useRouter();
  const [businessName, setBusinessName] = useState(initialBusiness?.name || "");
  const [businessDescription, setBusinessDescription] = useState(
    initialBusiness?.description || ""
  );
  const [businessEmail, setBusinessEmail] = useState(initialBusiness?.email || "");
  const [businessPhone, setBusinessPhone] = useState(initialBusiness?.phone || "");
  const [businessAddress, setBusinessAddress] = useState(initialBusiness?.address || "");
  const [businessImage, setBusinessImage] = useState(initialBusiness?.image || "");
  const [slugCopied, setSlugCopied] = useState(false);

  const slug = initialBusiness?.slug ?? "";
  const bookingUrl = typeof window !== "undefined"
    ? `${window.location.origin}/reserve/${slug}`
    : `/reserve/${slug}`;

  const handleCopyUrl = async () => {
    const fullUrl = `${window.location.origin}/reserve/${slug}`;
    await navigator.clipboard.writeText(fullUrl).catch(() => {});
    setSlugCopied(true);
    setTimeout(() => setSlugCopied(false), 2000);
  };

  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await clientUpdateBusiness(businessId, {
        name: businessName,
        description: businessDescription,
        email: businessEmail,
        phone: businessPhone,
        address: businessAddress,
        image: businessImage,
      });
      toast.success("Business info saved");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save business info");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="page-container-split">
      <div className="flex-1">
        <div className="page-header">
          <h1 className="page-title">Business Information</h1>
          <p className="page-description">
            Basic details visible to customers
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <FieldGroup>
            <FieldSet>
              <FieldLegend>Public Information</FieldLegend>
              <FieldDescription>
                This information is visible to customers when they make reservations
              </FieldDescription>

              <Field>
                <FieldLabel htmlFor="businessName">Business Name</FieldLabel>
                <Input
                  id="businessName"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  required
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="businessDescription">Description</FieldLabel>
                <Textarea
                  id="businessDescription"
                  value={businessDescription}
                  onChange={(e) => setBusinessDescription(e.target.value)}
                  rows={3}
                />
              </Field>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field>
                  <FieldLabel htmlFor="businessEmail">Email</FieldLabel>
                  <Input
                    id="businessEmail"
                    type="email"
                    value={businessEmail}
                    onChange={(e) => setBusinessEmail(e.target.value)}
                    required
                  />
                </Field>

                <Field>
                  <FieldLabel htmlFor="businessPhone">Phone</FieldLabel>
                  <Input
                    id="businessPhone"
                    type="tel"
                    value={businessPhone}
                    onChange={(e) => setBusinessPhone(e.target.value)}
                    required
                  />
                </Field>
              </div>

              <Field>
                <FieldLabel htmlFor="businessAddress">Address</FieldLabel>
                <Input
                  id="businessAddress"
                  value={businessAddress}
                  onChange={(e) => setBusinessAddress(e.target.value)}
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="businessImage">Image URL</FieldLabel>
                <Input
                  id="businessImage"
                  type="url"
                  value={businessImage}
                  onChange={(e) => setBusinessImage(e.target.value)}
                />
              </Field>
            </FieldSet>

            <Field>
              <div className="button-group-end">
                <Button type="submit" disabled={isSaving}>
                  {isSaving ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </Field>
          </FieldGroup>
        </form>
      </div>

      <div className="lg:w-80">
        <div className="sticky top-6">
          <div className="rounded-lg border bg-card overflow-hidden">
            <div className="relative h-32 w-full">
              {businessImage && (
                <Image
                  src={businessImage}
                  alt={businessName}
                  fill
                  className="object-cover"
                />
              )}
              <div className="absolute inset-0 bg-black/40" />
            </div>
            <div className="p-4 space-y-3">
              <h2 className="font-semibold">{businessName || "Business Name"}</h2>
              {businessDescription && (
                <p className="text-sm text-muted-foreground line-clamp-2">
                  {businessDescription}
                </p>
              )}
              <div className="space-y-2 text-sm">
                {businessPhone && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Phone className="h-3 w-3" />
                    <span>{businessPhone}</span>
                  </div>
                )}
                {businessEmail && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Mail className="h-3 w-3" />
                    <span className="truncate">{businessEmail}</span>
                  </div>
                )}
                {businessAddress && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <MapPin className="h-3 w-3" />
                    <span>{businessAddress}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-2 text-center">
            Customer preview
          </p>

          {/* Booking URL */}
          {slug && (
            <div className="mt-4 rounded-lg border bg-muted/40 p-3 space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Booking URL</p>
              <p className="text-xs font-mono text-foreground break-all">/reserve/{slug}</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleCopyUrl}
                  className="flex-1 flex items-center justify-center gap-1.5 text-xs px-2 py-1.5 rounded-md border hover:bg-muted transition-colors"
                >
                  {slugCopied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  {slugCopied ? "Copied" : "Copy URL"}
                </button>
                <a
                  href={bookingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 flex items-center justify-center gap-1.5 text-xs px-2 py-1.5 rounded-md border hover:bg-muted transition-colors"
                >
                  <ExternalLink className="w-3 h-3" /> Preview
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
