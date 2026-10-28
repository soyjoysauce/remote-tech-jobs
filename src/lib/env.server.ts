// Server-only environment variables, validated once with zod.
//
// The ".server" suffix is a naming convention, not a guarantee. The guarantee is the
// no-restricted-imports rule in eslint.config.mjs, which stops src/app and src/components from
// importing this module. `import "server-only"` cannot be used here: it throws in any module
// that is not bundled by Next.js for the server, which includes the tsx ingestion scripts.
import { z } from "zod";

const serverEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  SUPABASE_SECRET_KEY: z.string().min(1),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | undefined;

/**
 * Returns the validated server environment, or throws one error listing every missing or
 * invalid variable. Lazy, so importing this module never fails; only calling it does.
 */
export function getServerEnv(
  source: Record<string, string | undefined> = process.env,
): ServerEnv {
  if (cached && source === process.env) return cached;

  const result = serverEnvSchema.safeParse(source);
  if (!result.success) {
    // Names and reasons only. Never print the values: one of them is the secret key.
    const problems = result.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(
      `Invalid server environment:\n${problems}\n` +
        "Set them in .env.local (see .env.example) or in the environment.",
    );
  }

  if (source === process.env) cached = result.data;
  return result.data;
}
