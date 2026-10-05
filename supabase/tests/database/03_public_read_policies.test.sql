-- What the publishable key (anon) and a signed-in user (authenticated) can see and do.
--
-- Access is decided by two layers, and the tests check each one:
--   - Privileges (grant/revoke): no writes anywhere, nothing at all on ingestion_runs, and no
--     read of jobs.raw. These assertions pass without any policy.
--   - RLS policies: which rows are visible. The "has a policy" and "can read" assertions need
--     the policies in the migration. The "cannot read a closed job / inactive company"
--     assertions would also pass with no policy at all, because RLS then shows no rows; the
--     "can read" assertions are what prove the policies are not simply missing.
--
-- SQLSTATE 42501 is insufficient_privilege. A privilege error and an RLS violation both raise
-- it, which is why the privilege layer is also asserted directly with has_table_privilege.
begin;

create extension if not exists pgtap with schema extensions;

select plan(19);

-- Fixtures are inserted as the test runner's role (postgres), which bypasses RLS.
insert into public.sources (id, kind, display_name, api_base_url)
values ('test_source', 'ats', 'Test source', 'https://example.com/api');

insert into public.companies (source_id, board_token, name, slug, is_active)
values
  ('test_source', 'active-co', 'Active Co', 'test-active-co', true),
  ('test_source', 'inactive-co', 'Inactive Co', 'test-inactive-co', false);

insert into public.jobs (source_id, external_id, company_name, title, apply_url, is_remote, status, closed_at)
values
  ('test_source', 'open-1', 'Active Co', 'Open job', 'https://example.com/apply/open', true, 'open', null),
  ('test_source', 'closed-1', 'Active Co', 'Closed job', 'https://example.com/apply/closed', true, 'closed', now());

insert into public.ingestion_runs (source_id) values ('test_source');

-- ---------------------------------------------------------------------------
-- Privilege layer
-- ---------------------------------------------------------------------------
select is(
  (
    select count(*)
    from
      (values ('public.sources'), ('public.companies'), ('public.jobs'), ('public.ingestion_runs')) as t (tbl),
      (values ('anon'), ('authenticated')) as r (role_name),
      (values ('insert'), ('update'), ('delete'), ('truncate')) as p (priv)
    where has_table_privilege(r.role_name, t.tbl, p.priv)
  ),
  0::bigint,
  'anon and authenticated hold no write privilege on any pipeline table'
);

select ok(
  not has_table_privilege('anon', 'public.ingestion_runs', 'select')
  and not has_table_privilege('authenticated', 'public.ingestion_runs', 'select'),
  'anon and authenticated hold no select privilege on ingestion_runs'
);

-- ---------------------------------------------------------------------------
-- Policy shape
-- ---------------------------------------------------------------------------
select ok(
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'jobs') >= 1,
  'jobs has a policy'
);

select ok(
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'companies') >= 1,
  'companies has a policy'
);

select ok(
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'sources') >= 1,
  'sources has a policy'
);

select is(
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'ingestion_runs'),
  0::bigint,
  'ingestion_runs has no policy'
);

-- A policy created without a TO clause applies to PUBLIC (every role); one created for ALL
-- would also cover writes. Both would still pass the row-visibility checks below.
select is(
  (
    select count(*)
    from pg_policies
    where schemaname = 'public'
      and tablename in ('sources', 'companies', 'jobs')
      and (
        cmd <> 'SELECT'
        or not (roles::text[] <@ array['anon', 'authenticated'])
      )
  ),
  0::bigint,
  'every pipeline policy is SELECT-only and names only anon and/or authenticated'
);

-- ---------------------------------------------------------------------------
-- As anon: the role the publishable key maps to
-- ---------------------------------------------------------------------------
set local role anon;

select is(
  (select count(*) from public.jobs where external_id = 'open-1'),
  1::bigint,
  'anon can read an open job'
);

select is(
  (select count(*) from public.jobs where external_id = 'closed-1'),
  0::bigint,
  'anon cannot read a closed job'
);

select throws_ok(
  $$
    insert into public.jobs (source_id, external_id, company_name, title, apply_url, is_remote)
    values ('test_source', 'anon-1', 'Acme', 'Engineer', 'https://example.com/apply/anon', true)
  $$,
  '42501',
  null,
  'anon cannot insert a job'
);

select throws_ok(
  'select raw from public.jobs',
  '42501',
  null,
  'anon cannot read the raw payload column'
);

select is(
  (select count(*) from public.sources where id = 'test_source'),
  1::bigint,
  'anon can read sources'
);

select is(
  (select count(*) from public.companies where slug = 'test-active-co'),
  1::bigint,
  'anon can read an active company'
);

select is(
  (select count(*) from public.companies where slug = 'test-inactive-co'),
  0::bigint,
  'anon cannot read an inactive company'
);

select throws_ok(
  'select count(*) from public.ingestion_runs',
  '42501',
  null,
  'anon cannot read ingestion_runs'
);

-- ---------------------------------------------------------------------------
-- As authenticated: a signed-in user
-- ---------------------------------------------------------------------------
set local role authenticated;

select is(
  (select count(*) from public.jobs where external_id = 'open-1'),
  1::bigint,
  'authenticated can read an open job'
);

select is(
  (select count(*) from public.jobs where external_id = 'closed-1'),
  0::bigint,
  'authenticated cannot read a closed job'
);

select throws_ok(
  $$ update public.jobs set title = 'Changed' where external_id = 'open-1' $$,
  '42501',
  null,
  'authenticated cannot update a job'
);

select throws_ok(
  'select count(*) from public.ingestion_runs',
  '42501',
  null,
  'authenticated cannot read ingestion_runs'
);

reset role;

select * from finish();

rollback;
