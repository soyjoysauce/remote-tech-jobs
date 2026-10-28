import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";

// Vite only exposes VITE_-prefixed variables from .env files, and only to code it transforms,
// so the Supabase URL and secret key are loaded here with Node's built-in loader instead.
// In CI there is no .env.local: the workflow sets the variables directly.
if (existsSync(".env.local")) {
  loadEnvFile(".env.local");
}

// The integration tests insert and delete rows with the secret key. Refuse to run them against
// anything but the local stack, so pointing .env.local at the hosted project (Layer 12) can never
// make `npm run test:integration` write to production.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const host = URL.canParse(url) ? new URL(url).hostname : "";
if (host !== "127.0.0.1" && host !== "localhost") {
  throw new Error(
    `Integration tests only run against the local Supabase stack, but NEXT_PUBLIC_SUPABASE_URL ` +
      `points at "${host || "(missing)"}". Start it with npm run db:start and use its API URL.`,
  );
}
