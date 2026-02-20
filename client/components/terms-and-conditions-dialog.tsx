"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface TermsAndConditionsDialogProps {
  children: React.ReactNode;
}

export function TermsAndConditionsDialog({
  children,
}: TermsAndConditionsDialogProps) {
  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Terms and Conditions</DialogTitle>
          <DialogDescription>
            Please read our terms and conditions carefully before proceeding.
          </DialogDescription>
        </DialogHeader>
        <div className="overflow-y-auto flex-1 pr-2">
          <div className="space-y-4 text-sm">
            <section>
              <h3 className="font-semibold mb-2">1. Data Usage and Privacy</h3>
              <p className="text-muted-foreground mb-2">
                We collect and use your personal information (name, email, phone
                number) solely for the purpose of processing and managing your
                reservation. Your data will be securely stored and will not be
                shared with third parties without your explicit consent, except
                as required by law.
              </p>
              <p className="text-muted-foreground">
                By providing your contact information, you consent to receive
                reservation confirmations, reminders, and important updates
                regarding your booking via email or SMS.
              </p>
            </section>

            <section>
              <h3 className="font-semibold mb-2">2. Reservation Policies</h3>
              <p className="text-muted-foreground mb-2">
                Reservations are subject to availability and confirmation by the
                establishment. We reserve the right to modify or cancel
                reservations if necessary due to unforeseen circumstances.
              </p>
              <p className="text-muted-foreground">
                You are responsible for arriving on time for your reservation.
                Late arrivals may result in the forfeiture of your table.
              </p>
            </section>

            <section>
              <h3 className="font-semibold mb-2">
                3. Cancellation and Modifications
              </h3>
              <p className="text-muted-foreground mb-2">
                Cancellations or modifications to your reservation should be
                made as early as possible. Some establishments may have specific
                cancellation policies that will be communicated to you at the
                time of booking.
              </p>
            </section>

            <section>
              <h3 className="font-semibold mb-2">4. Data Retention</h3>
              <p className="text-muted-foreground mb-2">
                We retain your reservation data for a period necessary to
                fulfill the purpose for which it was collected, comply with
                legal obligations, resolve disputes, and enforce our agreements.
                Typically, this period is 12 months after your last reservation,
                unless a longer retention period is required by law.
              </p>
            </section>

            <section>
              <h3 className="font-semibold mb-2">5. Your Rights</h3>
              <p className="text-muted-foreground mb-2">
                You have the right to access, update, or delete your personal
                information at any time. You may also request a copy of your
                data or object to certain processing activities. To exercise
                these rights, please contact us through the provided contact
                information.
              </p>
            </section>

            <section>
              <h3 className="font-semibold mb-2">6. Security Measures</h3>
              <p className="text-muted-foreground">
                We implement appropriate technical and organizational measures
                to protect your personal information against unauthorized
                access, alteration, disclosure, or destruction. However, no
                method of transmission over the Internet or electronic storage
                is 100% secure.
              </p>
            </section>

            <section>
              <h3 className="font-semibold mb-2">7. Changes to Terms</h3>
              <p className="text-muted-foreground">
                We reserve the right to modify these terms and conditions at any
                time. Continued use of our reservation service after changes
                constitutes acceptance of the updated terms.
              </p>
            </section>

            <section>
              <h3 className="font-semibold mb-2">8. Contact Information</h3>
              <p className="text-muted-foreground">
                If you have any questions about these terms and conditions or
                our data handling practices, please contact us through the
                support channels provided on our platform.
              </p>
            </section>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
