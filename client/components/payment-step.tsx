"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, CreditCard } from "lucide-react";

interface PaymentStepProps {
  amount: number;
  onSuccess: () => void;
  onBack: () => void;
}

export function PaymentStep({ amount, onSuccess, onBack }: PaymentStepProps) {
  const [isProcessing, setIsProcessing] = useState(false);

  const handlePayment = async () => {
    setIsProcessing(true);
    // Simulate payment processing
    // In real app, this would integrate with Stripe
    setTimeout(() => {
      setIsProcessing(false);
      onSuccess();
    }, 2000);
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold mb-2">Payment Required</h2>
        <p className="text-muted-foreground">
          Complete your reservation by processing payment
        </p>
      </div>

      <div className="space-y-4 p-6 bg-muted rounded-lg">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Reservation Fee</span>
          <span className="text-2xl font-bold">${amount.toFixed(2)}</span>
        </div>
      </div>

      {/* TODO: Replace with actual Stripe Payment Element */}
      <div className="p-6 border-2 border-dashed rounded-lg bg-muted/50">
        <div className="flex flex-col items-center justify-center gap-4 py-8">
          <CreditCard className="h-12 w-12 text-muted-foreground" />
          <div className="text-center">
            <p className="font-medium mb-1">Payment Integration</p>
            <p className="text-sm text-muted-foreground">
              Stripe payment form will be integrated here
            </p>
          </div>
        </div>
      </div>

      <div className="flex gap-3">
        <Button
          type="button"
          onClick={onBack}
          variant="outline"
          className="flex-1"
          disabled={isProcessing}
        >
          Back
        </Button>
        <Button
          type="button"
          onClick={handlePayment}
          className="flex-1"
          disabled={isProcessing}
        >
          {isProcessing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Processing...
            </>
          ) : (
            `Pay $${amount.toFixed(2)}`
          )}
        </Button>
      </div>
    </div>
  );
}