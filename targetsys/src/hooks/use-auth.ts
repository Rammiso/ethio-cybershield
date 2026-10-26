import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { setTargetSession, getTargetSession, setAuthToken } from "@/lib/client-headers";
import {
  loginFn,
  registerFn,
  logoutFn,
  getCurrentUserFn,
  type LoginInput,
  type RegisterInput,
} from "@/lib/auth.functions";

export interface AuthUser {
  id: string;
  publicId: string;
  email: string;
  fullName: string;
  phone: string | null;
  status: string;
  mustChangePassword?: boolean;
}

export interface AuthState {
  user: AuthUser | null;
  roles: string[];
  session: { id: string; publicId: string; status: string } | null;
  account: { id: string; public_id: string; account_number: string; balance_minor: number; currency: string; status?: string } | null;
  isLoading: boolean;
  isAdmin: boolean;
  isCustomer: boolean;
  securityNotice: { type: "SESSION_REVOKED" | "IP_BLOCKED"; message: string } | null;
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    user: null,
    roles: [],
    session: null,
    account: null,
    isLoading: true,
    isAdmin: false,
    isCustomer: false,
    securityNotice: null,
  });

  const refreshUser = useCallback(async () => {
    try {
      const data = await getCurrentUserFn();
      if (data?.user) {
        setState({
          user: data.user,
          roles: data.roles ?? [],
          session: data.session ?? null,
          account: data.account ?? null,
          isLoading: false,
          isAdmin: (data.roles ?? []).includes("admin"),
          isCustomer: (data.roles ?? []).includes("customer"),
          securityNotice: null,
        });
      } else {
        setState({
          user: null,
          roles: [],
          session: null,
          account: null,
          isLoading: false,
          isAdmin: false,
          isCustomer: false,
          securityNotice: null,
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      let notice: { type: "SESSION_REVOKED" | "IP_BLOCKED"; message: string } | null = null;
      if (msg.includes("ACCESS_BLOCKED")) {
        notice = {
          type: "IP_BLOCKED",
          message: "Access from your network is temporarily blocked by HonorPay security policies.",
        };
      } else if (msg.includes("SESSION_ENDED") || msg.includes("SESSION_REVOKED")) {
        notice = {
          type: "SESSION_REVOKED",
          message: "Your session was ended for security reasons. Please sign in again.",
        };
      }
      setState({
        user: null,
        roles: [],
        session: null,
        account: null,
        isLoading: false,
        isAdmin: false,
        isCustomer: false,
        securityNotice: notice,
      });
    }
  }, []);

  useEffect(() => {
    void refreshUser();
  }, [refreshUser]);

  const login = async (input: LoginInput) => {
    setTargetSession(null);
    setAuthToken(null);
    setState((prev) => ({ ...prev, securityNotice: null }));

    const res = await loginFn({ data: input });
    if (res.ok) {
      if (res.access_token) {
        setAuthToken(res.access_token);
        try {
          await supabase.auth.setSession({
            access_token: res.access_token,
            refresh_token: res.refresh_token,
          });
        } catch {
          // ignore
        }
      }
      setTargetSession(res.sessionPublicId);
      await refreshUser();
      return res;
    }
    return res;
  };

  const register = async (input: RegisterInput) => {
    setTargetSession(null);
    setAuthToken(null);
    setState((prev) => ({ ...prev, securityNotice: null }));

    const res = await registerFn({ data: input });
    if (res.ok) {
      if (res.access_token) {
        setAuthToken(res.access_token);
        try {
          await supabase.auth.setSession({
            access_token: res.access_token,
            refresh_token: res.refresh_token,
          });
        } catch {
          // ignore
        }
      }
      setTargetSession(res.sessionPublicId);
      await refreshUser();
      return res;
    }
    return res;
  };

  const logout = async () => {
    try {
      await logoutFn();
    } catch {
      // ignore
    }
    try {
      await supabase.auth.signOut();
    } catch {
      // ignore
    }
    setAuthToken(null);
    setTargetSession(null);
    setState({
      user: null,
      roles: [],
      session: null,
      account: null,
      isLoading: false,
      isAdmin: false,
      isCustomer: false,
      securityNotice: null,
    });
  };

  return {
    ...state,
    refreshUser,
    login,
    register,
    logout,
    hasSession: !!getTargetSession(),
  };
}
