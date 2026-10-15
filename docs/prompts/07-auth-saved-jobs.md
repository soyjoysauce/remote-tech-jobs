# Layer 7 — Auth, profiles, allowlist, saved jobs

**Goal:** sign-in with email + password, magic link, Google and GitHub through Supabase Auth, using cookie sessions that work in server components (`@supabase/ssr` plus Next 16's `proxy.ts`). Sign-up is restricted to an allowlist of email addresses, since the site is public but only for you; this also protects the AI features later from strangers running up your API bill. Logged-in users get a profile, a saved-jobs list, and protected `/account` routes. You write the row-level security policies.

**Mode:** plan mode. Explanatory, with Learning-style `TODO(human)` for RLS policies.

## Before you start (manual, for Google/GitHub sign-in)

Claude Code will give you the exact callback URLs in Part D; create the OAuth apps then, not now.

```bash
cd ~/Desktop/sauce-dev/remote-tech-jobs-seeker
git status --short
npm run db:start
claude
```

## Prompt

```
Layer 7: Auth, profiles, allowlist, saved jobs. Follow the learning workflow rules in CLAUDE.md. Present a plan and wait for my approval.

Context: @src/lib/supabase/ @src/app/ @supabase/config.toml @supabase/migrations/ @.env.example

## Preconditions (stop if any fail)
- Layer 6 committed.
- Before writing code, read the current Supabase docs for "@supabase/ssr with Next.js" and Next.js 16 proxy docs. In Next 16, middleware.ts is renamed proxy.ts with an exported proxy function. Use the auth method Supabase currently recommends for validating the user in server code (getClaims vs getUser) and explain the difference from getSession, which must not be trusted on the server.

## Part A: Session plumbing
- src/lib/supabase/client.ts (browser), server.ts (server components/actions/route handlers, cookie-based), proxy helper that refreshes the session; root proxy.ts calls it with a matcher that skips static assets.
- Protected area: /account/** redirects to /login?next=... when signed out. Validate `next` (relative path only, no "//") to prevent open redirects; explain the attack.
- Header: sign-in link or user menu (avatar/email, Account, Sign out).

## Part B: Auth flows
- /login page with: email + password, magic link, "Continue with Google", "Continue with GitHub". /signup for email + password.
- Server actions with zod validation for email/password flows; generic error messages (don't reveal whether an email exists).
- /auth/callback route handler exchanging the code for a session (PKCE) for OAuth + magic link; /auth/confirm if the current docs use token-hash confirmation for email links. Follow the current docs.
- Local email testing: magic links and confirmations land in the local Supabase mail viewer (check its current name/port via `npx supabase status`).

## Part C: Allowlist
- Restrict account creation to emails in an allowlist. Preferred: Supabase's "before user created" auth hook implemented as a Postgres function reading an allowed_emails table (no policies; not exposed). Verify this hook exists and how to enable it locally in config.toml and on the hosted project. If it doesn't, propose the next-best server-side enforcement and explain why a client-side check isn't enough.
- It must cover OAuth first sign-ins too, not just email signup.
- Seed my email locally; tell me how to add it in production (SQL I run in the dashboard, or a migration that reads nothing secret).

## Part D: OAuth setup instructions (for me)
- Configure [auth.external.google] and [auth.external.github] in config.toml using env() substitution for client id/secret; add the variable names to .env.example.
- Print exact steps for me: Google Cloud console OAuth client (web app) and GitHub OAuth app, with the exact authorized redirect URI for local (the local Supabase auth callback) and for the hosted project. Pause until I confirm I've created them and set the env vars, then test both.

## Part E: Data (migration)
- profiles: id (PK, FK auth.users ON DELETE CASCADE), display_name, avatar_url, created_at, updated_at. Trigger on auth.users insert creates the profile (SECURITY DEFINER with a fixed search_path; explain why both).
- saved_jobs: user_id, job_id (FK jobs ON DELETE CASCADE), created_at, PK (user_id, job_id).
- RLS enabled on both. Policies are TODO(human), Learning style: write comments describing each needed policy and FAILING pgTAP tests, then stop. Tests:
  - A user can read/update only their own profile; cannot insert/delete profiles directly
  - A user can select/insert/delete only their own saved_jobs; cannot insert a row with someone else's user_id
  - anon can read neither table
  Explain (select auth.uid()) vs auth.uid() in policies (initPlan caching) and the "to authenticated" clause.
- Update the cleanup script's extension point: deleting a closed job cascades saved_jobs. Show saved-but-closed jobs in the list with a "closed" badge until cleanup removes them.

## Part F: UI
- Save/unsave button on JobCard and job page (optimistic update via useOptimistic; signed-out click goes to login with next).
- /account (profile edit), /account/saved (saved jobs list with closed badges).

## Tests
- pgTAP above; unit tests for next-param validation and auth action input validation; integration test that the allowlist rejects a non-listed email.

## Finish
1. After my TODO(human) tests pass: walk me through each sign-in method locally.
2. Layer-end rules from CLAUDE.md. Code-reviewer focus: open redirects, session validation in server code, RLS gaps, SECURITY DEFINER functions, secrets in client bundles.
3. docs/decisions/0014 auth design (@supabase/ssr + proxy, getClaims/getUser choice, allowlist via auth hook, RLS pattern). Reasons from this prompt only.

## Final output to me
- Files table, verification, reviewer findings
- 5 interview talking points
- The manual steps still pending for production (OAuth redirect URIs, allowlist row, hook enabled on hosted project)
```
