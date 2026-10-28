-- Ingestion (Layer 3a): the remote-region values the classifier produces, and per-run counters
-- for every step of the pipeline. See docs/decisions/0007-ingestion-architecture.md and
-- docs/decisions/0008-dedupe-and-closing-strategy.md.

-- ---------------------------------------------------------------------------
-- jobs.remote_region
-- ---------------------------------------------------------------------------
-- Layer 2 used placeholder values (us_only, us_plus). The classifier in
-- src/lib/ingestion/classify/remote-us.ts returns a more specific region, and Layer 5's filters
-- can use the difference between "US only" and "open to the Americas". 'non_us' is a classifier
-- result too, but those jobs are filtered out before the upsert, so the column never stores it.
-- The column was text + CHECK in Layer 2 so that this change is one statement.
alter table public.jobs drop constraint jobs_remote_region_check;

alter table public.jobs
  add constraint jobs_remote_region_check
  check (remote_region in ('us', 'north_america', 'americas', 'worldwide', 'unknown'));

-- ---------------------------------------------------------------------------
-- ingestion_runs counters
-- ---------------------------------------------------------------------------
-- fetched_count is the number of items the source returned. The pipeline then drops items at
-- each step, and each step has its own counter so a run can be explained from its row alone:
--   fetched = invalid + not_tech + not_remote_us + stale + eligible
--   eligible = inserted + updated + unchanged
alter table public.ingestion_runs
  add column invalid_count integer not null default 0 check (invalid_count >= 0),
  add column not_tech_count integer not null default 0 check (not_tech_count >= 0),
  add column not_remote_us_count integer not null default 0 check (not_remote_us_count >= 0),
  -- Items already past the source's max age (age-based closing only). They are not upserted,
  -- otherwise each run would reopen a job that the same run then closes.
  add column stale_count integer not null default 0 check (stale_count >= 0),
  add column eligible_count integer not null default 0 check (eligible_count >= 0),
  -- Seen again with the same content_hash: only last_seen_at (and a reopen) was written.
  add column unchanged_count integer not null default 0 check (unchanged_count >= 0),
  -- Non-fatal problems, such as the circuit breaker skipping the close step.
  add column warnings text[] not null default '{}';
