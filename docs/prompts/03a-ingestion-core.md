# Layer 3a — Ingestion core + aggregator sources

**Goal:** a typed ingestion pipeline you can run locally with `npm run ingest -- --source remotive|remoteok|all [--dry-run] [--force]`. It fetches, validates, filters to remote US tech jobs, de-duplicates, upserts, closes stale jobs, and logs every run to `ingestion_runs`. You write the three pieces interviewers probe: the de-duplication key, the remote-US classifier, and the close rule. Claude writes failing tests for each first.

**Mode:** plan mode. Explanatory, with Learning-style `TODO(human)` for the three functions.

## Before you start

```bash
cd ~/Desktop/sauce-dev/remote-tech-jobs-seeker
git status --short
docker info --format '{{.ServerVersion}}'
npm run db:start
claude
```

## Prompt

```
Layer 3a: Ingestion core + aggregator sources (Remotive, Remote OK). Follow the learning workflow rules in CLAUDE.md. Present a plan and wait for my approval.

Context: @supabase/migrations/ @src/lib/supabase/database.types.ts @docs/decisions/

## Preconditions (check first; stop and tell me if any fail)
- Working tree clean and Layer 2 committed
- Local Supabase running; `npm run db:test` passes (the RLS policies TODO is done)
- Use the ACTUAL schema in the migrations and generated types. If a column this layer needs is missing, propose a new migration in the plan rather than working around it.

## Scope
IN: pipeline core, Remotive + Remote OK adapters, CLI, run logging, tests.
OUT (Layer 3b): company discovery, Greenhouse/Lever/Ashby adapters, cross-source dedupe precedence, cleanup/deletion, storage report. OUT (Layer 4): GitHub Actions scheduling.

## Architecture (explain each choice and its alternative)
- src/lib/env.server.ts: zod-validated env (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY). Fail fast with a clear message.
- src/lib/supabase/admin.ts: typed supabase-js client using the secret key. Add an ESLint no-restricted-imports rule so src/app/** and src/components/** cannot import it. Explain why: the secret key bypasses RLS.
- src/lib/ingestion/:
  - types.ts: a NormalizedJob type plus a SourceAdapter interface. Each adapter's fetchJobs() returns raw payloads, and normalize() returns NormalizedJob.
  - http.ts: fetch wrapper with AbortSignal timeout, retry with exponential backoff + jitter on 429/5xx, honors Retry-After, and a descriptive User-Agent including the repo URL.
  - schemas/: zod schemas for each source's response. Invalid items are counted and skipped, not fatal; an invalid top-level shape fails the run.
  - classify/tech.ts: title-based tech-role classifier driven by a config list of include/exclude patterns. Include engineering roles (software, frontend, backend, full-stack, web, mobile, devops/SRE, QA/test, data engineering, security engineering). Exclude sales/marketing/recruiting/support even at tech companies. Claude writes this one, with tests.
  - classify/remote-us.ts: TODO(human) (see below)
  - dedupe.ts: TODO(human) (see below)
  - reconcile.ts: TODO(human) for the close-selection rule (see below)
  - html.ts: sanitize description HTML at ingest with an allowlist (sanitize-html or equivalent; justify the pick) and derive description_text. Explain the XSS reason.
  - upsert.ts: batch upsert on (source, external_id).
    - Never overwrite first_seen_at.
    - Always bump last_seen_at.
    - Skip field rewrites when content_hash is unchanged.
    - Reopen a previously closed job if it reappears.
  - pipeline.ts: run one source end to end. Create an ingestion_runs row (running), then fetch → validate → normalize → tech filter → remote-US filter → dedupe key → upsert → reconcile. Finish the run row with counts and status (succeeded/failed + error text).
  - adapters/remotive.ts: use the software-dev category. Enforce the rate limit in code: skip if the last succeeded Remotive run was under 6 hours ago, unless --force. Store the Remotive listing URL as source_url (attribution link-back).
  - adapters/remoteok.ts: drop the first array element (legal notice). Store the Remote OK listing URL as source_url; its terms require a followed link back + naming Remote OK. Note that apply_url often points to Remote OK itself.
- scripts/ingest.ts: CLI (--source, --dry-run, --force). Dry run does everything except DB writes and prints what it would write. Load .env.local the simplest supported way for Node 24 + tsx (check, don't assume). npm script "ingest".

## Closing strategy (record in CLAUDE.md for Layer 6 and 3b)
- Remotive returns all active jobs: snapshot reconcile. Open Remotive jobs missing from a SUCCESSFUL fetch get closed.
- Remote OK returns only a recent window: age-based close (posted_at older than a configurable max age, default 30 days). Never close because a job is missing from the feed.
- Circuit breaker: if a fetch returns 0 items, or fewer than 50% of the previous successful run's count, skip closing and log a warning.
- Attribution rule for Layer 6: Remote OK and Remotive job pages must show the source name and a followed link (no rel="nofollow") to source_url.

## TODO(human): Learning style
For each item: write the function signature, a docstring explaining the goal and edge cases, and a FAILING Vitest test file with the cases below plus any you think are important. Then stop and let me implement until the tests pass. Don't implement these yourself; give hints only if I ask.

1. computeDedupeKey(companyName, title): stable key across sources.
   Cases:
   - "Acme, Inc." + "Senior Software Engineer (Remote)" equals "ACME" + "Sr. Software Engineer - Remote"
   - Company suffixes (inc, llc, ltd, corp, co) are stripped
   - Seniority abbreviations sr/jr/sr. normalize
   - Location/remote qualifiers in parentheses or after " - " are stripped
   - Different roles stay different ("Frontend Engineer" vs "Backend Engineer")
2. classifyRemoteUS(input: { locationRaw, sourceRemoteFlag?, tags? }): returns { isRemote, remoteRegion, eligible }. remoteRegion should be one of a small enum you propose (e.g. us, north_america, americas, worldwide, non_us, unknown). Eligible = remote AND open to US-based workers.
   Cases:
   - "Remote - US" → eligible, us
   - "United States (Remote)" → eligible, us
   - "Remote, CA or NY" → eligible, us
   - "Worldwide" / "Anywhere" → eligible, worldwide
   - "North America" → eligible
   - "Remote - Canada" → not eligible
   - "EMEA" / "Europe only" / "LATAM" → not eligible
   - "San Francisco, CA" with no remote signal → not eligible
   - empty location + sourceRemoteFlag true → eligible, unknown (explain why that's a judgment call)
3. selectJobsToClose(openJobs, fetchResult, policy): returns the IDs to close for one source, implementing the snapshot vs age-based strategies and the circuit breaker above. Design the input so a later layer can pass a narrower scope (one company board) instead of a whole source.
   Cases:
   - snapshot: missing job closed, present job not closed
   - failed fetch → nothing closed
   - 0 items → nothing closed
   - drop below 50% of the previous count → nothing closed
   - age-based: only jobs past max age closed, regardless of presence

## Tests
- Fixtures: capture ONE real response from each source into tests/fixtures/ (trim to ~5 jobs), then unit-test schemas + adapters against fixtures. No network in unit tests; adapters accept an injectable fetch.
- Integration test against local Supabase (separate test:integration script, also run in the CI db job):
  - Insert
  - Re-run unchanged → no field rewrite, last_seen_at bumped
  - Close
  - Reappear → reopened
  - first_seen_at preserved

## Finish
1. After my TODO(human) tests pass: run a real `npm run ingest -- --source all --dry-run`, then a real run. Report per source: fetched, schema-invalid, tech-filtered, remote-US eligible, inserted, updated, closed.
2. Lint, format:check, typecheck, test, test:integration, build, db:test all pass.
3. Run the code-reviewer subagent; fix Blocking items. Focus areas: secret-key exposure, retry/timeout behavior, closing safety.
4. docs/decisions: 0007 ingestion architecture (adapter pattern, zod validation at the boundary, retries, sanitizing at ingest) and 0008 dedupe + closing strategy (snapshot vs age-based, circuit breaker). Same format; use reasons stated here, don't invent.
5. Update CLAUDE.md (commands, closing strategy, attribution rule) and README.
6. Conventional commit; ask before pushing.

## Final output to me
- Files created/changed table
- Per-source run results from the real run
- Verification results
- Reviewer findings + fixes
- 5 interview talking points (pipeline design, validation, idempotent upserts, closing safety, dedupe)
- Anything I must do manually
```
