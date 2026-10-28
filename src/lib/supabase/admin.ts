// Supabase client authenticated with the secret key. It runs as the service_role database role,
// which has BYPASSRLS: every row level security policy is skipped, so this client can read and
// write every table. Use it only in scripts and server code that must act as the system
// (ingestion, alerts). Code acting for a signed-in user gets a user-scoped client instead
// (Layer 7). eslint.config.mjs blocks src/app and src/components from importing this file.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { getServerEnv } from "@/lib/env.server";

import type { Database } from "./database.types";

export type AdminClient = SupabaseClient<Database>;

export function createAdminClient(): AdminClient {
  const env = getServerEnv();
  return createClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SECRET_KEY,
    {
      // A script has no browser session to store or refresh.
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}
