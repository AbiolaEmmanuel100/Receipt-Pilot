/* eslint-disable @typescript-eslint/no-explicit-any */
import type { SupabaseClient } from "@supabase/supabase-js";
import { config, isSupabaseConfigured } from "./config";
import { report } from "./errors";

// Port of js/supabase.js. The library is code-split and only loaded on app
// pages; same auth options and storage key ("receiptly-auth") as before so
// existing sessions on the device keep working.
let client: SupabaseClient | null = null;
let loading: Promise<SupabaseClient | null> | null = null;

export function configured() { return isSupabaseConfigured(); }

export function getClient(): SupabaseClient | null {
  if (!configured()) return null;
  return client;
}

export function ready(): Promise<SupabaseClient | null> {
  if (!configured()) return Promise.resolve(null);
  if (client) return Promise.resolve(client);
  if (loading) return loading;
  loading = import("@supabase/supabase-js")
    .then((lib) => {
      if (client) return client;
      client = lib.createClient(String(config.supabaseUrl).trim(), String(config.supabaseAnonKey).trim(), {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: "receiptly-auth" },
      });
      return client;
    })
    .catch(() => { loading = null; return null; });
  return loading;
}

export function friendlyError(err: any): string {
  const m = String((err && (err.message || err.error_description)) || err || "");
  if (/supabase_lib_missing/i.test(m)) return "Unable to load the account service. Check your internet connection and try again.";
  if (/Failed to fetch|NetworkError|fetch/i.test(m)) return "Unable to reach Receipt Pilot cloud right now. Your work is still saved on this device.";
  if (/Invalid login credentials/i.test(m)) return "Those details do not match an account.";
  if (/already registered|User already registered/i.test(m)) return "That email already has an account. Try logging in.";
  if (/Password should be|password/i.test(m) && /6|least/i.test(m)) return "Use a password of at least 6 characters.";
  if (/Email not confirmed/i.test(m)) return "Please verify your email, then log in.";
  if (/rate limit/i.test(m)) return "Too many attempts. Please wait a moment and try again.";
  report(m.slice(0, 180), "supabase");
  return "Unable to complete that right now. Please try again.";
}
