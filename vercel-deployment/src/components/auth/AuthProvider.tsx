"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { User } from "@/lib/appwrite/types";
import { account } from "@/lib/appwrite/client";
import { ID } from "@/lib/appwrite/client";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  demoMode: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

const DEMO_USER_KEY = "multillm_demo_user";

function demoUser(email: string, name: string): User {
  return {
    $id: "demo-user",
    $createdAt: new Date().toISOString(),
    $updatedAt: new Date().toISOString(),
    name,
    email,
    prefs: {
      subscriptionTier: "pro",
      apiKeys: [],
      models: ["ensemble-generator", "ensemble-scorer"],
      monthlyQueries: 1342,
      totalQueries: 8421,
      totalCarbonSaved: 5.4,
      createdAt: new Date().toISOString(),
    },
  };
}

function loadDemoUser(): User | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(DEMO_USER_KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
}

function isDemoMode(): boolean {
  return !process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const demoMode = isDemoMode();

  const fetchUser = async () => {
    if (demoMode) {
      setUser(loadDemoUser());
      setLoading(false);
      return;
    }
    try {
      const session = await account.get();
      setUser(session as unknown as User);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUser();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = async (email: string, password: string) => {
    if (demoMode) {
      if (!password || password.length < 6) {
        throw new Error("Demo mode: use a password of 6+ characters (any account works).");
      }
      const name = email.split("@")[0].replace(/[^a-zA-Z0-9]/g, " ") || "Demo User";
      const u = demoUser(email, name);
      window.localStorage.setItem(DEMO_USER_KEY, JSON.stringify(u));
      setUser(u);
      return;
    }
    await account.createEmailPasswordSession(email, password);
    await fetchUser();
  };

  const register = async (email: string, password: string, name: string) => {
    if (demoMode) {
      const u = demoUser(email, name || email.split("@")[0]);
      window.localStorage.setItem(DEMO_USER_KEY, JSON.stringify(u));
      setUser(u);
      return;
    }
    await account.create(ID.unique(), email, password, name);
    await account.createEmailPasswordSession(email, password);
    await fetchUser();
  };

  const logout = async () => {
    if (demoMode) {
      window.localStorage.removeItem(DEMO_USER_KEY);
      setUser(null);
      return;
    }
    await account.deleteSession("current");
    setUser(null);
  };

  const refreshUser = async () => {
    await fetchUser();
  };

  return (
    <AuthContext.Provider value={{ user, loading, demoMode, login, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
};
