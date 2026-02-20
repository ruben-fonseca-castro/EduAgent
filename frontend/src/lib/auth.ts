"use client";

import { createContext, useContext } from "react";
import type { UserResponse } from "./api";

export interface AuthState {
  token: string | null;
  user: UserResponse | null;
  isLoading: boolean;  // true while we're still reading from localStorage
  login: (token: string, user: UserResponse) => void;
  logout: () => void;
}

export const AuthContext = createContext<AuthState>({
  token: null,
  user: null,
  isLoading: true,
  login: () => {},
  logout: () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("campus_market_token");
}

export function setStoredToken(token: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem("campus_market_token", token);
}

export function removeStoredToken() {
  if (typeof window === "undefined") return;
  localStorage.removeItem("campus_market_token");
}

export function getStoredUser(): UserResponse | null {
  if (typeof window === "undefined") return null;
  const data = localStorage.getItem("campus_market_user");
  if (!data) return null;
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}

export function setStoredUser(user: UserResponse) {
  if (typeof window === "undefined") return;
  localStorage.setItem("campus_market_user", JSON.stringify(user));
}

export function removeStoredUser() {
  if (typeof window === "undefined") return;
  localStorage.removeItem("campus_market_user");
}
