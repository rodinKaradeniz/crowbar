"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { Customer, Staff, MeContext } from "@/types";
import { clientGetMeContext } from "@/lib/client-api";

export type AuthUser = Customer | Staff;

interface AuthContextType {
  user: AuthUser | null;
  meContext: MeContext | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<AuthUser | null>;
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
  ): Promise<AuthUser | null> => {
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
        return userData;
      }
      return null;
    } catch (error) {
      console.error("Login failed:", error);
      return null;
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
