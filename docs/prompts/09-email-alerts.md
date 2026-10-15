# Layer 9 — Saved searches and email alerts

**Goal:** save any search (keywords + filters) as an alert. After each scheduled ingestion, GitHub Actions finds new matching jobs per alert and sends a digest email through Resend (daily or after every ingestion run, per alert). Emails are built with React Email and include a one-click pause link that works without signing in.

**Resend note:** without a verified domain, Resend only delivers from `onboarding@resend.dev` to the email address on your Resend account. That's enough for a single-user site, as long as you sign up for Resend with the same email you use on the site. A custom domain is only needed if anyone else will ever receive alerts.

**Mode:** plan mode. Explanatory, with Learning-style `TODO(human)` for RLS policies.

## Before you start (manual)

1. Create a Resend account with the same email as your site account.
2. Create an API key with "Sending access".

```bash
cd ~/Desktop/sauce-dev/remote-tech-jobs-seeker
git status --short
npm run db:start
claude
```

## Prompt

```
Layer 9: Saved searches and email alerts. Follow the learning workflow rules in CLAUDE.md. Present a plan and wait for my approval.

Context: @supabase/migrations/ @src/app/page.tsx @src/lib/ @scripts/ @.github/workflows/ingest.yml @.env.example

## Preconditions (stop if any fail)
- Layer 8 committed. search_jobs RPC exists (Layer 5). Read the current Resend Node SDK and React Email docs before writing code.
- Constraint: no verified domain. From address is onboarding@resend.dev, which only delivers to my Resend account email. Make the from address an env var (ALERTS_FROM) so a domain can be added later without code changes.

## Part A: Data (migration)
- saved_searches:
  - id, user_id (FK auth.users CASCADE), name
  - params jsonb: the same validated shape as the search page's searchParams; reuse the Layer 5 zod schema as the single source of truth
  - frequency ('daily' | 'every_run'), is_active
  - last_checked_at (watermark), created_at, updated_at
- alert_deliveries: id, saved_search_id (FK CASCADE), sent_at, job_ids uuid[] (or the jobs PK type), resend_message_id, status. Unique (saved_search_id, delivery_window) to make sends idempotent; explain how you define delivery_window.
- RLS: saved_searches owner-only CRUD; alert_deliveries owner read-only, written only by the service key. Policies are TODO(human), Learning style: comments + FAILING pgTAP tests, then stop.

## Part B: Matching
- New-job definition: first_seen_at > last_checked_at (not posted_at; explain why sources backdate or omit posted_at). Open + canonical only.
- Reuse search_jobs with an extra optional first_seen_after parameter (migration to extend it, keep existing tests passing), rather than duplicating the query.
- Cap jobs per email (e.g. 25) with "N more" linking to the search page with the saved params.

## Part C: Sending (scripts/send-alerts.ts, npm script "alerts")
- Runs with the secret key. Looks up each active saved search's user email via the Supabase admin API.
- daily: send if the last delivery was > ~23h ago; every_run: send whenever new matches exist. No matches → no email, but advance the watermark.
- Advance last_checked_at ONLY after a successful send (or when there were no matches). On send failure, keep the watermark so the next run retries; idempotency key prevents duplicates. Explain this ordering.
- Use Resend's idempotency key support if available (verify).
- --dry-run renders emails to .tmp/emails/*.html instead of sending.

## Part D: Email template (emails/ with React Email)
- JobAlertEmail: alert name, job list (title, company, remote region, salary, link to my job page with utm params), "view all" link, pause link, manage-alerts link.
- Plain-text version included.
- npm script email:dev for the React Email preview server.

## Part E: Pause without login
- Pause link: /alerts/pause?id=...&sig=... where sig is an HMAC-SHA256 of the id with ALERTS_SIGNING_SECRET. The route verifies with a timing-safe comparison and sets is_active = false via the admin client (server-only route handler). Explain why HMAC instead of a random token column, and the trade-off.
- Add List-Unsubscribe and List-Unsubscribe-Post headers pointing at the same signed URL; verify Resend supports custom headers.

## Part F: UI
- "Save this search" button on the search page (signed in), with a name and frequency dialog.
- /account/alerts: list, edit name/frequency, pause/resume, delete, "send test email now" (server action, rate-limited to once per minute per user).

## Part G: Workflow
- Add an alerts step to ingest.yml after ingestion + dedupe (runs only if those succeeded). Secrets: RESEND_API_KEY, ALERTS_FROM, ALERTS_SIGNING_SECRET, NEXT_PUBLIC_SITE_URL. Give me the `gh secret set` commands; I'll run them. Add the vars to .env.example.

## Tests
- pgTAP above; unit tests for HMAC sign/verify (tampered id, tampered sig), delivery-window logic, watermark advancement on success/failure (mock Resend); render test for the email template.

## Finish
1. After my TODO(human) tests pass: create an alert locally, run alerts --dry-run, show me the rendered HTML path; then one real send to my email.
2. Layer-end rules from CLAUDE.md. Code-reviewer focus: idempotency, HMAC verification, admin-client usage limited to scripts/server routes, PII in logs (never log email addresses).
3. docs/decisions/0016 alerts design (first_seen_at watermark, idempotent deliveries, HMAC pause links, Resend sandbox constraint). Reasons from this prompt only.

## Final output to me
- Files table, verification, reviewer findings
- 5 interview talking points
- Manual steps (secrets, Resend account email must match)
```
