# Layer 3b — Company discovery, ATS adapters, cross-source dedupe, cleanup

**Goal:** add Greenhouse, Lever and Ashby. A discovery script finds real company board names (from the apply links already in your database from 3a, plus an optional list you can add to), verifies each against the public endpoint, and stores the ones with remote US tech jobs in `companies`. Adapters ingest each board with per-board closing. Duplicates across sources collapse to one canonical listing. A cleanup script deletes old closed jobs and a storage report tracks the 500 MB free-tier limit.

**Mode:** plan mode. Explanatory, with one Learning-style `TODO(human)` (canonical-job selection).

## Before you start

```bash
cd ~/Desktop/sauce-dev/remote-tech-jobs-seeker
git status --short
npm run db:start
npm run ingest -- --source all
claude
```

The real ingest run first gives discovery something to harvest.

## Prompt

```
Layer 3b: Company discovery, Greenhouse/Lever/Ashby adapters, cross-source dedupe, cleanup, storage report. Follow the learning workflow rules in CLAUDE.md. Present a plan and wait for my approval.

Context: @src/lib/ingestion/ @scripts/ingest.ts @supabase/migrations/ @docs/decisions/

## Preconditions (stop and tell me if any fail)
- Layer 3a committed; unit + integration tests pass; the jobs table has rows from a real Remotive/Remote OK run.
- Read the existing SourceAdapter interface, pipeline, upsert and selectJobsToClose. Extend them; don't fork a second pipeline. If selectJobsToClose can't take a per-board scope, propose the smallest change.

## Part A: Company discovery (scripts/discover-companies.ts, npm script "discover")
Input sources, in this order:
1. Harvest board identifiers from apply_url/source_url of existing jobs. Patterns to recognize (check current URL formats; don't assume this list is complete):
   - boards.greenhouse.io/<token>, job-boards.greenhouse.io/<token>
   - jobs.lever.co/<site>, jobs.eu.lever.co/<site>
   - jobs.ashbyhq.com/<name>
2. data/company-candidates.txt (one "source:identifier" per line, comments allowed). Create it empty with a header comment explaining the format; I'll add to it.
Then for each candidate:
- Verify against the public endpoint (Part B). 404/empty → skip and log.
- Count postings and how many pass the tech + remote-US filters.
- Upsert into companies with is_active = (eligible count > 0), last_verified_at = now.
- Re-verifying an existing company that now 404s sets is_active = false; never delete companies.
Flags: --dry-run, --limit N, --source. Respect per-host rate limits (below). Print a summary table: candidates found, verified, active, inactive, by source.

## Part B: Adapters (one per ATS; each fetches ONE board)
Verify current field names against the live endpoint and capture one trimmed fixture per ATS before writing schemas.
- Greenhouse: GET https://boards-api.greenhouse.io/v1/boards/{token}/jobs?content=true (check whether pay_transparency=true adds pay ranges). Description `content` is HTML-entity-encoded: decode before sanitizing. Use absolute_url as apply_url. Workplace/remote signal may live in location name, offices or metadata; read it, don't guess.
- Lever: GET https://api.lever.co/v0/postings/{site}?mode=json, falling back to https://api.eu.lever.co when the global host returns nothing. The endpoint can occasionally return HTML instead of JSON; check content-type and treat that as a failed fetch, not an empty board. createdAt is epoch ms. Use workplaceType, categories.location and allLocations for remote classification; salaryRange when present; hostedUrl/applyUrl.
- Ashby: GET https://api.ashbyhq.com/posting-api/job-board/{name}?includeCompensation=true. Skip isListed = false. Use isRemote, workplaceType, location, secondaryLocations, publishedAt, jobUrl, applyUrl, descriptionHtml, compensation.
- ATS jobs set company_id; source_url = the public job page.
- Rate limiting: a small per-host limiter (e.g. 1 request/second per ATS host, configurable) plus bounded overall concurrency. Explain why per-host matters.
- Closing: snapshot reconcile PER BOARD (one company), not per source; the circuit breaker also applies per board. A failed board fetch closes nothing for that board and doesn't fail the whole run.
- CLI: extend scripts/ingest.ts with --source greenhouse|lever|ashby|ats|all and --company <slug>. A run iterates active companies for that source. Keep one ingestion_runs row per source per run, with per-board errors collected into the error text (or propose a small child table if that's cleaner; justify).

## Part C: Cross-source de-duplication
The same job often appears in an ATS feed and in Remotive/Remote OK with the same dedupe_key.
- Migration: add duplicate_of (nullable self-FK to jobs, ON DELETE SET NULL) and an index. A row with duplicate_of set is hidden from listings in later layers.
- src/lib/ingestion/canonical.ts: TODO(human), Learning style. Write the signature, docstring and FAILING tests, then stop.
  chooseCanonical(group: JobRow[]): returns the canonical id and the ids to mark as duplicates.
  Rules to encode:
  - ATS source beats Remotive beats Remote OK (ATS is first-party data)
  - Among equal sources, the most recently seen open job wins
  - Closed jobs never win over open ones
  - A group of one returns no duplicates
  - If the canonical job closes, the next best open duplicate becomes canonical
- After each source run, a dedupe pass recomputes canonical status only for dedupe_keys touched in that run. Explain why scoping matters for cost.

## Part D: Cleanup and storage (scripts/cleanup.ts, scripts/storage-report.ts)
- cleanup:
  - Delete jobs closed longer than a grace period (default 14 days, configurable).
  - Set raw = null on closed jobs immediately (storage).
  - Delete ingestion_runs older than 90 days.
  - --dry-run prints counts.
  - Leave a clearly marked extension point: later layers will add saved_jobs/applications tables that must not lose history (Layer 8 snapshots job fields onto applications; saved_jobs may cascade). Don't build those tables now.
- storage-report: row counts, open vs closed jobs, and pg_total_relation_size per table vs the 500 MB free-tier limit. Exit non-zero above 70% so CI/Actions can flag it.

## Tests
- Fixture-based unit tests for each adapter + schema (no network).
- Unit tests for URL harvesting (each pattern, plus junk URLs that must not match).
- Integration tests: per-board close doesn't touch other boards; failed board closes nothing; duplicate marking and canonical promotion after close; cleanup grace period.

## Finish
1. After my TODO(human) tests pass: run discover (dry run, then real), ingest --source ats, then the dedupe pass, cleanup --dry-run, storage-report. Report: candidates/verified/active companies per ATS; per-source fetched/eligible/inserted/updated/closed; duplicates marked; storage %.
2. Layer-end rules from CLAUDE.md (all checks incl. test:integration and db:test; code-reviewer focus: rate limiting, per-board closing safety, HTML decoding before sanitizing).
3. docs/decisions: 0009 company discovery (harvest from aggregator links instead of a guessed list), 0010 per-board reconcile + canonical selection. Use reasons stated here.
4. Update CLAUDE.md commands. Conventional commit; ask before pushing.

## Final output to me
- Files table, run results, verification, reviewer findings
- 5 interview talking points (discovery approach, per-host rate limiting, per-board reconcile, canonical selection, storage budgeting)
- Anything I must do manually (e.g. companies I could add to data/company-candidates.txt)
```
