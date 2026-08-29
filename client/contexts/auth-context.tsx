"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { Customer, Staff, MeContext } from "@/types";
import { clientGetMeContext } from "@/lib/client-api";

export type AuthUser = Customer | Staff;

/**
 * Why sign-in failed, in the terms the sign-in screen can act on.
 *
 * `throttled` carries the server's own `Retry-After`, so the locked screen
 * counts down from a real number. There is NO account-lockout model in the
 * backend — `auth_login_identity` is a 10-per-10-minutes rate limit keyed on
 * IP plus email — which is why there is no "attempts remaining" here. The
 * client cannot know a counter it does not hold, and guessing at one would
 * tell an operator the wrong number under pressure.
 */
export type LoginResult =
  | { ok: true; user: AuthUser }
  | {
      ok: false;
      reason: "credentials" | "throttled" | "unreachable";
      /** Seconds until sign-in is accepted again. Only set for `throttled`. */
      retryAfterSeconds?: number;
    };

interface AuthContextType {
  user: AuthUser | null;
  meContext: MeContext | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<LoginResult>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [meContext, setMeContext] = useState<MeContext | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  async function loadMeContext(userData: AuthUser) {
    if (userData.type === "staff") {
      try {
        const ctx = await clientGetMeContext();
        setMeContext(ctx);
      } catch {
        setMeContext(null);
      }
    } else {
      setMeContext(null);
    }
  }

  // Load user from session on mount
  useEffect(() => {
    async function loadUser() {
      try {
        const response = await fetch("/api/auth/session");
        if (response.ok) {
          const userData = await response.json();
          if (userData) {
            setUser(userData);
            await loadMeContext(userData);
          }
        }
      } catch (error) {
        console.error("Failed to load session:", error);
      } finally {
        setIsLoading(false);
      }
    }

    loadUser();
  }, []);

  const login = async (
    email: string,
    password: string
  ): Promise<LoginResult> => {
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (response.ok) {
        const userData = await response.json();
        setUser(userData);
        await loadMeContext(userData);
        return { ok: true, user: userData };
      }

      if (response.status === 429) {
        const header = response.headers.get("Retry-After");
        const seconds = header ? Number.parseInt(header, 10) : Number.NaN;
        return {
          ok: false,
          reason: "throttled",
          retryAfterSeconds: Number.isFinite(seconds) ? seconds : undefined,
        };
      }

      return { ok: false, reason: "credentials" };
    } catch (error) {
      console.error("Login failed:", error);
      return { ok: false, reason: "unreachable" };
    }
  };

  const logout = async (): Promise<void> => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      setUser(null);
      setMeContext(null);
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  return (
    <AuthContext.Provider value={{ user, meContext, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
