"use client";

import { useState } from "react";
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

interface VenueProfileSettingsClientProps {
  userId: string;
  initialName: string;
  initialPhone: string;
  initialAvatar: string;
}

export default function VenueProfileSettingsClient({
  userId,
  initialName,
  initialPhone,
  initialAvatar,
}: VenueProfileSettingsClientProps) {
  const [name, setName] = useState(initialName);
  const [phone, setPhone] = useState(initialPhone);
  const [avatar, setAvatar] = useState(initialAvatar);
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    // TODO: Call API to update user profile
    setTimeout(() => {
      setIsSaving(false);
      // Show success message
    }, 500);
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <div className="page-container-split">
      <div className="flex-1">
        <div className="page-header">
          <h1 className="page-title">Profile Settings</h1>
          <p className="page-description">
            Update your personal information
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <FieldGroup>
            <FieldSet>
              <FieldLegend>Personal Information</FieldLegend>
              <FieldDescription>
                This information is visible to your team members
              </FieldDescription>

              <Field>
                <FieldLabel htmlFor="name">Full Name</FieldLabel>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="phone">Phone Number</FieldLabel>
                <Input
                  id="phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Enter your phone number"
                />
                <FieldDescription>
                  Used for internal contact purposes only
                </FieldDescription>
              </Field>

              <Field>
                <FieldLabel htmlFor="avatar">Avatar URL</FieldLabel>
                <Input
                  id="avatar"
                  type="url"
                  value={avatar}
                  onChange={(e) => setAvatar(e.target.value)}
                  placeholder="https://example.com/avatar.jpg"
                />
                <FieldDescription>
                  URL to your profile picture (optional)
                </FieldDescription>
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

      {/* Preview Card */}
      <div className="lg:w-80">
        <div className="sticky top-6">
          <div className="preview-card">
            <div className="flex items-center gap-4">
              {avatar ? (
                <div className="relative h-16 w-16 overflow-hidden rounded-full">
                  <Image
                    src={avatar}
                    alt={name}
                    fill
                    className="object-cover"
                  />
                </div>
              ) : (
                <div className="h-16 w-16 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-lg font-semibold">
                  {getInitials(name || "U")}
                </div>
              )}
              <div>
                <h2 className="font-semibold">{name || "Your Name"}</h2>
                <p className="text-sm text-muted-foreground">Staff Member</p>
              </div>
            </div>
            {phone && (
              <div className="mt-4 pt-4 border-t">
                <p className="text-sm text-muted-foreground">{phone}</p>
              </div>
            )}
          </div>
          <p className="preview-label">Preview of your profile</p>
        </div>
      </div>
    </div>
  );
}