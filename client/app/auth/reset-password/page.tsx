import { GalleryVerticalEnd } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { ResetPasswordForm } from "@/components/reset-password-form";

export default function ResetPasswordPage() {
  return (
    <div className="flex min-h-svh w-full">
      {/* Left side - Form */}
      <div className="flex w-full flex-col gap-4 p-6 md:w-1/2 md:p-10">
        <div className="flex justify-center gap-2 md:justify-start">
          <Link href="/" className="flex items-center gap-2 font-medium">
            <div className="bg-primary text-primary-foreground flex size-6 items-center justify-center rounded-md">
              <GalleryVerticalEnd className="size-4" />
            </div>
            RK Reservations
          </Link>
        </div>
        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-xs">
            <ResetPasswordForm />
          </div>
        </div>
      </div>

      {/* Right side - Image */}
      <div className="hidden w-1/2 items-center justify-center bg-muted lg:flex">
        <div className="relative h-full w-full">
          <Image
            src="/website-img-2.jpg"
            alt="Bar interior"
            fill
            className="object-cover"
            priority
          />
        </div>
      </div>
    </div>
  );
}
