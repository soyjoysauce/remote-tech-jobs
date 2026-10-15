# Layer 5 — Search and listing

**Goal:** the home page is a job search: keyword search ranked by relevance using Postgres full-text search, filters (remote region, employment type, salary minimum, posted within, source, tags), sort by relevance or newest, and pagination. All search state lives in the URL so results are shareable and server-rendered. You write the search SQL function.

**Mode:** plan mode. Explanatory, with Learning-style `TODO(human)` for the search function.

**UI default:** Tailwind + shadcn/ui components (copied into the repo, not a dependency you can't read). Change this line in the prompt if you want something else.

## Before you start

```bash
cd ~/Desktop/sauce-dev/remote-tech-jobs-seeker
git status --short
npm run db:start
npm run ingest -- --source all
claude
```

## Prompt

```
Layer 5: Search and listing. Follow the learning workflow rules in CLAUDE.md. Present a plan and wait for my approval.

Context: @supabase/migrations/ @src/lib/supabase/database.types.ts @src/app/ @docs/decisions/

## Preconditions (stop if any fail)
- Layer 4 committed; local DB has a few hundred+ open jobs from a real ingest.
- Use the actual jobs columns (including duplicate_of from 3b). Listings show only open, canonical jobs (duplicate_of is null).

## Part A: Public data access
- src/lib/supabase/server.ts: a server-side client using the PUBLISHABLE key for public reads (RLS applies). Don't use the admin client in src/app. Use @supabase/ssr's server client if it's the current recommended way even for anonymous reads; check, and explain. (Auth wiring comes in Layer 7; keep this compatible.)

## Part B: Full-text search (migration)
- Add a search_vector tsvector GENERATED ALWAYS column on jobs with weights: title A; company_name and tags B; description_text C. Use the 'english' config; explain stemming and why generated beats a trigger here.
- GIN index on search_vector.
- Supporting indexes for filters only where EXPLAIN shows they help; show me EXPLAIN ANALYZE before and after on the local data.
- SQL function search_jobs(...) callable via supabase.rpc, SECURITY INVOKER (so RLS still applies; explain why not DEFINER):
  Parameters: q text (nullable), remote_region text[], employment_type text[], salary_min int, posted_within_days int, sources text[], tags text[], sort ('relevance'|'newest'), page_size int, page int.
  Returns: job card columns + rank + total_count (window function).
  TODO(human), Learning style: write the function signature, comments describing each clause, and FAILING pgTAP tests, then stop. I'll write the body. Tests to include:
  - websearch_to_tsquery handles quotes and "-exclude" syntax ("react -native")
  - Title matches outrank description-only matches
  - Stemming: "developers" matches "developer"
  - Filters combine with AND; empty arrays/nulls mean "no filter"
  - Closed and duplicate jobs never appear
  - sort=newest ignores rank; relevance sorts by ts_rank_cd then posted_at
  - total_count is correct with pagination
- Explain offset vs keyset pagination and why offset is acceptable for relevance-sorted results at this data size.

## Part C: UI
- Initialize shadcn/ui (check the current init command for Tailwind 4 + Next 16). Add only components you use.
- src/app/page.tsx: server component reading searchParams; parse/validate with zod (bad params fall back to defaults, never 500).
- Search form: a client component that updates the URL (router.replace with debounce on the text field; filters apply immediately). Explain why URL state over React state.
- Filters UI (sheet on mobile, sidebar on desktop), result count, sort toggle, pagination links (real <a> links so they're crawlable).
- JobCard: title, company + logo (with fallback), location/remote region badge, salary when present, tags, relative posted date, source. Links to /jobs/[slug] (route built in Layer 6; create a slug helper now: kebab title + company + short id).
- Empty state with suggestions, loading.tsx skeleton, error.tsx.
- Accessibility: labeled inputs, focus states, results announced via an aria-live region.
- Caching: explain the Next 16 caching model for this page (dynamic because of searchParams) and what you chose.

## Tests
- pgTAP tests above.
- Unit tests: searchParams parsing (valid, invalid, missing), slug helper.
- Component test: JobCard renders salary/no-salary and logo fallback.

## Finish
1. After my TODO(human) tests pass: show me 5 sample searches with counts and top 3 titles each, and the EXPLAIN ANALYZE timing for a keyword + filter search.
2. Layer-end rules from CLAUDE.md. Code-reviewer focus: SQL injection surface in RPC params, RLS still enforced, input validation.
3. docs/decisions/0012 search design (generated tsvector + weights, websearch_to_tsquery, SECURITY INVOKER, URL state, offset pagination). Reasons from this prompt only.

## Final output to me
- Files table, sample searches, EXPLAIN results, verification, reviewer findings
- 5 interview talking points
- Anything I must do manually
```
