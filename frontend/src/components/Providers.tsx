"use client";

import { useState, useEffect, useCallback, type ReactNode } from "react";
import { AuthContext, getStoredToken, getStoredUser, setStoredToken, setStoredUser, removeStoredToken, removeStoredUser } from "@/lib/auth";
import type { UserResponse } from "@/lib/api";

export function Providers({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<UserResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true); // true until we've checked localStorage

  useEffect(() => {
    // Hydrate auth state from localStorage on first mount
    const savedToken = getStoredToken();
    const savedUser = getStoredUser();
    if (savedToken && savedUser) {
      setToken(savedToken);
      setUser(savedUser);
    }
    setIsLoading(false); // done checking — pages can now safely redirect
  }, []);

  const login = useCallback((newToken: string, newUser: UserResponse) => {
    setToken(newToken);
    setUser(newUser);
    setStoredToken(newToken);
    setStoredUser(newUser);
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    removeStoredToken();
    removeStoredUser();
  }, []);

  return (
    <AuthContext.Provider value={{ token, user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
