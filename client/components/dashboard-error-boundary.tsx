"use client";

import React from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

interface State {
  hasError: boolean;
  message?: string;
}

export class DashboardErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("DashboardErrorBoundary caught:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-1 items-center justify-center p-6">
          <Card className="w-full max-w-md text-center">
            <CardHeader className="pb-3">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
                <AlertTriangle className="h-6 w-6 text-destructive" />
              </div>
              <CardTitle>Something went wrong</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              <p>An unexpected error occurred in this section.</p>
              {process.env.NODE_ENV === "development" && this.state.message && (
                <p className="mt-3 rounded bg-muted px-3 py-2 font-mono text-xs text-left break-all">
                  {this.state.message}
                </p>
              )}
            </CardContent>
            <CardFooter className="flex justify-center gap-3">
              <Button
                variant="outline"
                onClick={() => this.setState({ hasError: false })}
              >
                Try again
              </Button>
              <Button asChild variant="ghost">
                <Link href="/business/overview">Go to Overview</Link>
              </Button>
            </CardFooter>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}
