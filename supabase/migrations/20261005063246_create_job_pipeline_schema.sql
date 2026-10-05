-- Job pipeline schema (Layer 2): the tables the ingestion scripts write to.
-- Search vectors (Layer 5), embeddings (Layer 11) and user tables (Layer 7+) are deliberately
-- absent; each arrives in its own migration. See docs/decisions/0006-job-pipeline-schema.md.

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
-- Enums for closed sets this project defines itself. They become string unions in the
-- generated TypeScript types. Values that are normalized from external data (employment type,
-- salary period, remote region) are text + CHECK instead: those lists will change while the
-- ingestion code is written, and a CHECK is replaced in one statement, whereas an enum value
-- can never be removed.
create type public.source_kind as enum ('ats', 'aggregator');
create type public.job_status as enum ('open', 'closed');
create type public.ingestion_run_status as enum ('running', 'succeeded', 'failed');

-- ---------------------------------------------------------------------------
-- updated_at trigger
-- ---------------------------------------------------------------------------
-- An empty search_path means the function body can only resolve schema-qualified names (and
-- pg_catalog, which is always searched), so a same-named object in another schema cannot be
-- substituted for one the function uses.
create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- sources: one row per place jobs come from
-- ---------------------------------------------------------------------------
-- Text primary key ('greenhouse', 'lever', ...): there are five rows that never get renamed,
-- and jobs.source_id is then readable without a join.
create table public.sources (
  id text primary key check (id ~ '^[a-z0-9_]+$'),
  kind public.source_kind not null,
  display_name text not null,
  api_base_url text not null,
  attribution_required boolean not null default false,
  attribution_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Rejects NULL and blank text when attribution is required: length(btrim(NULL)) > 0 is NULL,
  -- "false or NULL" is NULL, and here that must fail, hence the coalesce.
  constraint sources_attribution_text_check
    check (not attribution_required or coalesce(length(btrim(attribution_text)), 0) > 0)
);

create trigger sources_set_updated_at
before update on public.sources
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- companies: one row per ATS job board that ingestion polls
-- ---------------------------------------------------------------------------
-- bigint identity keys, not uuid: 8 bytes against 16 in the table and in every index and
-- foreign key that references it. The data is public, so guessable ids are not a concern.
create table public.companies (
  id bigint generated always as identity primary key,
  source_id text not null references public.sources (id),
  -- The identifier in the ATS URL, e.g. boards.greenhouse.io/<board_token>.
  board_token text not null,
  name text not null,
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  website_url text,
  logo_url text,
  -- false stops ingestion polling the board without deleting the row (and its jobs' company link).
  is_active boolean not null default true,
  -- Last time the board token returned a valid response.
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint companies_source_board_token_key unique (source_id, board_token)
);

create trigger companies_set_updated_at
before update on public.companies
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- jobs
-- ---------------------------------------------------------------------------
create table public.jobs (
  id bigint generated always as identity primary key,

  -- (source_id, external_id) is the upsert key: re-ingesting the same listing updates its row.
  -- external_id is text because sources use integers, uuids and slugs.
  source_id text not null references public.sources (id),
  external_id text not null,

  -- Aggregator jobs have no companies row, so the name is stored on the job as well.
  company_id bigint references public.companies (id) on delete set null,
  company_name text not null,

  title text not null,
  description_html text,
  description_text text,

  apply_url text not null,
  -- The listing's page on the source, for the attribution link-back.
  source_url text,

  location_raw text,
  is_remote boolean not null,
  remote_region text not null default 'unknown'
    check (remote_region in ('us_only', 'us_plus', 'worldwide', 'unknown')),

  employment_type text
    check (employment_type in ('full_time', 'part_time', 'contract', 'internship', 'temporary', 'other')),
  department text,
  tags text[] not null default '{}',

  -- numeric, not integer, because hourly rates have cents.
  salary_min numeric(12, 2) check (salary_min >= 0),
  salary_max numeric(12, 2) check (salary_max >= 0),
  salary_currency text check (salary_currency ~ '^[A-Z]{3}$'),
  salary_period text check (salary_period in ('year', 'month', 'week', 'day', 'hour')),

  -- posted_at is the source's date and may be missing. first_seen_at and last_seen_at are
  -- ours: when ingestion first saw the listing and when it most recently did.
  posted_at timestamptz,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  closed_at timestamptz,
  status public.job_status not null default 'open',

  -- Computed in app code (Layer 3) from normalized company + title (+ location). Indexed but
  -- not unique: the same job can be listed on two sources, and both rows are kept.
  dedupe_key text,
  -- Hash of the normalized content. Ingestion compares it to skip rewriting unchanged listings.
  content_hash text,
  raw jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint jobs_source_external_id_key unique (source_id, external_id),
  -- A CHECK passes when its expression is NULL, so this only rejects when both values are set.
  constraint jobs_salary_range_check check (salary_min <= salary_max),
  -- Both sides are never NULL (status is NOT NULL, IS NOT NULL returns a boolean), so comparing
  -- them is an exact "if and only if".
  constraint jobs_status_closed_at_check check ((status = 'closed') = (closed_at is not null))
);

comment on column public.jobs.raw is
  'Original source payload, kept so jobs can be re-normalized without re-fetching. Roughly 10-20 KB per job before TOAST compression; with description_html and description_text the content is stored about three times. Budget ~50-100 MB per 5,000 jobs against the 500 MB free tier. Safe to set to NULL on old rows.';

comment on column public.jobs.updated_at is
  'Changes on every ingestion run, because last_seen_at is touched. Use content_hash to tell whether the listing itself changed.';

create trigger jobs_set_updated_at
before update on public.jobs
for each row execute function public.set_updated_at();

-- Listing page: open jobs, newest first. Partial, because closed jobs are never listed and
-- would only make the index larger. id breaks ties so pagination has a stable order.
-- The planner only uses this index when the query matches it exactly: it must filter on
-- status = 'open' and order by posted_at desc NULLS LAST, id desc. Postgres defaults to
-- NULLS FIRST for desc, so leaving "nulls last" out of the query falls back to a sort.
create index jobs_open_posted_at_idx
on public.jobs (posted_at desc nulls last, id desc)
where status = 'open';

-- Layer 3 looks up existing jobs with the same dedupe_key.
create index jobs_dedupe_key_idx on public.jobs (dedupe_key);

-- Postgres does not index foreign key columns. This serves "jobs for a company" and the
-- ON DELETE SET NULL scan when a company is deleted.
create index jobs_company_id_idx on public.jobs (company_id);

-- Closing stale jobs: "open jobs of source X with last_seen_at before T".
create index jobs_open_source_last_seen_idx
on public.jobs (source_id, last_seen_at)
where status = 'open';

-- ---------------------------------------------------------------------------
-- ingestion_runs: one row per source per scheduled run
-- ---------------------------------------------------------------------------
-- No updated_at: started_at and finished_at already record the row's whole lifecycle.
-- No extra index: a few thousand small rows at most.
create table public.ingestion_runs (
  id bigint generated always as identity primary key,
  source_id text not null references public.sources (id),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status public.ingestion_run_status not null default 'running',
  fetched_count integer not null default 0 check (fetched_count >= 0),
  inserted_count integer not null default 0 check (inserted_count >= 0),
  updated_count integer not null default 0 check (updated_count >= 0),
  closed_count integer not null default 0 check (closed_count >= 0),
  error text,
  constraint ingestion_runs_status_finished_at_check check ((status = 'running') = (finished_at is null))
);

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
-- Supabase's default privileges give anon and authenticated every privilege on a new table in
-- public, which leaves RLS as the only barrier. Only the secret key (service_role) writes to
-- these tables, so the privilege layer says so too: read-only where a public read is intended,
-- nothing at all on ingestion_runs.
revoke all on table public.sources, public.companies, public.jobs, public.ingestion_runs
from anon, authenticated;

-- The identity columns' sequences get the same default privileges. Inserts into an identity
-- column do not check sequence privileges, so service_role is unaffected by this.
revoke all on sequence public.companies_id_seq, public.jobs_id_seq, public.ingestion_runs_id_seq
from anon, authenticated;

grant select on table public.sources, public.companies
to anon, authenticated;

-- jobs is granted column by column so the publishable key cannot read raw (10-20 KB per row,
-- which would let anyone pull the whole table's payloads through the API), content_hash or
-- dedupe_key. Consequences: "select *" on jobs fails for these roles, so queries list their
-- columns, and a later migration that adds a public column must grant it here too.
grant select (
  id,
  source_id,
  external_id,
  company_id,
  company_name,
  title,
  description_html,
  description_text,
  apply_url,
  source_url,
  location_raw,
  is_remote,
  remote_region,
  employment_type,
  department,
  tags,
  salary_min,
  salary_max,
  salary_currency,
  salary_period,
  posted_at,
  first_seen_at,
  last_seen_at,
  closed_at,
  status,
  created_at,
  updated_at
) on public.jobs
to anon, authenticated;

-- Stated explicitly so the migration does not depend on the project's default privileges.
grant all on table public.sources, public.companies, public.jobs, public.ingestion_runs
to service_role;

revoke execute on function public.set_updated_at() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
-- Every table in the public schema is reachable through the Data API with the publishable key,
-- which ships in the browser bundle. With RLS enabled and no policy, a role sees no rows and
-- can write none. The ingestion scripts use the secret key, which runs as service_role;
-- that role has the BYPASSRLS attribute, so none of this applies to it.
alter table public.sources enable row level security;
alter table public.companies enable row level security;
alter table public.jobs enable row level security;
alter table public.ingestion_runs enable row level security;

-- Public read policies. Each one is SELECT-only and names anon (publishable key, signed out)
-- and authenticated (signed in) explicitly; a policy without a TO clause would apply to
-- PUBLIC, which includes any role created later. USING is the row filter: rows where it is
-- false are not returned, with no error.
--
-- ingestion_runs gets no policy on purpose: no policy means no rows for those roles.

create policy "Anyone can read open jobs, but not closed ones"
on public.jobs
for select
to anon, authenticated
using (status = 'open');

create policy "Anyone can read active companies, but not inactive ones"
on public.companies
for select
to anon, authenticated
using (is_active = true);

create policy "Anyone can read all sources, including attribution-required ones"
on public.sources
for select
to anon, authenticated
using (true);
