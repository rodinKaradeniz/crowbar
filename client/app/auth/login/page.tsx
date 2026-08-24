import { GalleryVerticalEnd } from "lucide-react";
import Link from "next/link";
import { LoginForm } from "@/components/login-form";
import { AuthVisual } from "@/components/auth-visual";

export default function LoginPage() {
  return (
    <div className="flex min-h-svh w-full">
      {/* Left side - Image */}
      <div className="hidden w-1/2 items-center justify-center bg-muted lg:flex">
        <AuthVisual />
      </div>

      {/* Right side - Form */}
      <div className="flex w-full flex-col gap-4 p-6 md:w-1/2 md:p-10">
        <div className="flex justify-center gap-2 md:justify-start">
          <Link href="/" className="flex items-center gap-2 font-medium">
            <div className="bg-primary text-primary-foreground flex size-6 items-center justify-center rounded-md">
              <GalleryVerticalEnd className="size-4" />
            </div>
            Crowbar
          </Link>
        </div>
        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-xs">
            <LoginForm />
          </div>
        </div>
      </div>
    </div>
  );
}
