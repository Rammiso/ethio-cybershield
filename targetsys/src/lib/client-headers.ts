import { createMiddleware } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";

const DEVICE_KEY = "sb_testbed_device_id";
const SESSION_KEY = "sb_testbed_session_id";
export const CUSTOM_ENTITIES_KEY = "hp_custom_entities";

export function getStoredEntities(): any[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(CUSTOM_ENTITIES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function storeRegisteredEntity(entity: any) {
  if (typeof window === "undefined" || !entity) return;
  try {
    const current = getStoredEntities();
    const idx = current.findIndex(
      (e) => (entity.userId && e.userId === entity.userId) || (entity.email && e.email === entity.email) || (entity.accountNumber && e.accountNumber === entity.accountNumber)
    );
    if (idx >= 0) {
      current[idx] = { ...current[idx], ...entity };
    } else {
      current.push(entity);
    }
    localStorage.setItem(CUSTOM_ENTITIES_KEY, JSON.stringify(current));
  } catch {
    // ignore
  }
}

function normalizePhoneCore(phone?: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length >= 9) {
    return digits.startsWith("251") ? digits.slice(3) : digits.startsWith("0") ? digits.slice(1) : digits;
  }
  return null;
}

export function markStoredEntityPasswordChanged(userIdOrEmailOrPhone: string, newPassword?: string) {
  if (typeof window === "undefined" || !userIdOrEmailOrPhone) return;
  try {
    const current = getStoredEntities();
    const target = userIdOrEmailOrPhone.toLowerCase().trim();
    const targetCore = normalizePhoneCore(target);
    let matchedAny = false;

    for (const e of current) {
      const eCore = normalizePhoneCore(e.phone);
      const match =
        (e.userId && e.userId.toLowerCase() === target) ||
        (e.userPublicId && e.userPublicId.toLowerCase() === target) ||
        (e.email && e.email.toLowerCase() === target) ||
        (e.accountNumber && e.accountNumber.trim() === target) ||
        (targetCore && eCore && targetCore === eCore);

      if (match) {
        matchedAny = true;
        e.mustChangePassword = false;
        if (newPassword) {
          e.password = newPassword;
          e.initialPassword = newPassword;
        }
        if (e.userId) localStorage.setItem(`hp_pwd_changed_${e.userId.toLowerCase()}`, "true");
        if (e.userPublicId) localStorage.setItem(`hp_pwd_changed_${e.userPublicId.toLowerCase()}`, "true");
        if (e.email) localStorage.setItem(`hp_pwd_changed_${e.email.toLowerCase()}`, "true");
        if (e.accountNumber) localStorage.setItem(`hp_pwd_changed_${e.accountNumber.trim().toLowerCase()}`, "true");
        if (e.phone) {
          localStorage.setItem(`hp_pwd_changed_${e.phone.toLowerCase()}`, "true");
          const epCore = normalizePhoneCore(e.phone);
          if (epCore) {
            localStorage.setItem(`hp_pwd_changed_${epCore}`, "true");
            localStorage.setItem(`hp_pwd_changed_0${epCore}`, "true");
            localStorage.setItem(`hp_pwd_changed_+251${epCore}`, "true");
            localStorage.setItem(`hp_pwd_changed_251${epCore}`, "true");
          }
        }
      }
    }

    if (!matchedAny) {
      current.push({
        userId: target.startsWith("u-") || target.length > 20 ? target : undefined,
        userPublicId: target.startsWith("U_") ? target : undefined,
        email: target.includes("@") ? target : undefined,
        phone: targetCore ? target : undefined,
        accountNumber: /^\d{10}$/.test(target) ? target : undefined,
        mustChangePassword: false,
        password: newPassword,
        initialPassword: newPassword,
      });
    }

    localStorage.setItem(CUSTOM_ENTITIES_KEY, JSON.stringify(current));
    localStorage.setItem(`hp_pwd_changed_${target}`, "true");
    if (targetCore) {
      localStorage.setItem(`hp_pwd_changed_${targetCore}`, "true");
      localStorage.setItem(`hp_pwd_changed_0${targetCore}`, "true");
      localStorage.setItem(`hp_pwd_changed_+251${targetCore}`, "true");
      localStorage.setItem(`hp_pwd_changed_251${targetCore}`, "true");
    }
  } catch {
    // ignore
  }
}

export function isPasswordChangeCompleted(userIdOrEmailOrPhone: string): boolean {
  if (typeof window === "undefined" || !userIdOrEmailOrPhone) return false;
  try {
    const target = userIdOrEmailOrPhone.toLowerCase().trim();
    const targetCore = normalizePhoneCore(target);

    if (localStorage.getItem(`hp_pwd_changed_${target}`) === "true") return true;
    if (targetCore) {
      if (localStorage.getItem(`hp_pwd_changed_${targetCore}`) === "true") return true;
      if (localStorage.getItem(`hp_pwd_changed_0${targetCore}`) === "true") return true;
      if (localStorage.getItem(`hp_pwd_changed_+251${targetCore}`) === "true") return true;
      if (localStorage.getItem(`hp_pwd_changed_251${targetCore}`) === "true") return true;
    }

    const current = getStoredEntities();
    const found = current.find((e) => {
      const eCore = normalizePhoneCore(e.phone);
      return (
        (e.userId && e.userId.toLowerCase() === target) ||
        (e.userPublicId && e.userPublicId.toLowerCase() === target) ||
        (e.email && e.email.toLowerCase() === target) ||
        (e.accountNumber && e.accountNumber.trim() === target) ||
        (targetCore && eCore && targetCore === eCore)
      );
    });

    if (found && found.mustChangePassword === false) return true;
  } catch {
    // ignore
  }
  return false;
}

export function getDeviceId(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}
export function getTargetSession(): string | null {
  if (typeof window === "undefined") return null;
  const local = localStorage.getItem(SESSION_KEY);
  if (local) return local;
  const m = document.cookie.match(new RegExp(`(?:^|; )${SESSION_KEY}=([^;]*)`));
  return m ? decodeURIComponent(m[1]!) : null;
}

export function setTargetSession(id: string | null) {
  if (typeof window === "undefined") return;
  if (id) {
    localStorage.setItem(SESSION_KEY, id);
    document.cookie = `${SESSION_KEY}=${encodeURIComponent(id)}; path=/; max-age=2592000; SameSite=Lax`;
  } else {
    localStorage.removeItem(SESSION_KEY);
    document.cookie = `${SESSION_KEY}=; path=/; max-age=0; SameSite=Lax`;
  }
}

export function setAuthToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) {
    localStorage.setItem("sb_access_token", token);
    document.cookie = `sb_access_token=${encodeURIComponent(token)}; path=/; max-age=2592000; SameSite=Lax`;
  } else {
    localStorage.removeItem("sb_access_token");
    document.cookie = `sb_access_token=; path=/; max-age=0; SameSite=Lax`;
  }
}

/** Global client middleware: bearer token + device id + app session id on every server call. */
export const attachTestbedHeaders = createMiddleware({ type: "function" }).client(async ({ next }) => {
  const headers: Record<string, string> = {};
  if (typeof window !== "undefined") {
    let token: string | undefined;
    try {
      const { data } = await supabase.auth.getSession();
      token = data.session?.access_token;
    } catch {
      // ignore
    }
    if (!token) {
      token = localStorage.getItem("sb_access_token") ?? undefined;
    }

    if (token) headers["Authorization"] = `Bearer ${token}`;
    headers["x-device-id"] = getDeviceId();
    const s = getTargetSession();
    if (s) headers["x-target-session"] = s;

    const stored = getStoredEntities();
    if (stored.length > 0) {
      headers["x-honorpay-entities"] = JSON.stringify(stored);
    }
  }
  return next({ headers });
});
