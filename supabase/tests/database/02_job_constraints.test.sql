-- Constraints on jobs: the upsert key, the status/closed_at pairing and the salary range.
-- SQLSTATE 23505 is unique_violation; 23514 is check_violation.
begin;

create extension if not exists pgtap with schema extensions;

select plan(7);

insert into public.sources (id, kind, display_name, api_base_url)
values ('test_source', 'ats', 'Test source', 'https://example.com/api');

insert into public.jobs (source_id, external_id, company_name, title, apply_url, is_remote)
values ('test_source', 'job-1', 'Acme', 'Engineer', 'https://example.com/apply/1', true);

select throws_ok(
  $$
    insert into public.jobs (source_id, external_id, company_name, title, apply_url, is_remote)
    values ('test_source', 'job-1', 'Acme', 'Engineer again', 'https://example.com/apply/1', true)
  $$,
  '23505',
  null,
  'a second job with the same (source_id, external_id) is rejected'
);

select lives_ok(
  $$
    insert into public.jobs (source_id, external_id, company_name, title, apply_url, is_remote)
    values ('test_source', 'job-1', 'Acme', 'Engineer', 'https://example.com/apply/1', true)
    on conflict (source_id, external_id) do update set last_seen_at = now()
  $$,
  'the same key works as an upsert conflict target'
);

select throws_ok(
  $$
    insert into public.jobs (source_id, external_id, company_name, title, apply_url, is_remote, status, closed_at)
    values ('test_source', 'job-2', 'Acme', 'Engineer', 'https://example.com/apply/2', true, 'open', now())
  $$,
  '23514',
  null,
  'an open job with closed_at set is rejected'
);

select throws_ok(
  $$
    insert into public.jobs (source_id, external_id, company_name, title, apply_url, is_remote, status)
    values ('test_source', 'job-3', 'Acme', 'Engineer', 'https://example.com/apply/3', true, 'closed')
  $$,
  '23514',
  null,
  'a closed job without closed_at is rejected'
);

select lives_ok(
  $$
    insert into public.jobs (source_id, external_id, company_name, title, apply_url, is_remote, status, closed_at)
    values ('test_source', 'job-4', 'Acme', 'Engineer', 'https://example.com/apply/4', true, 'closed', now())
  $$,
  'a closed job with closed_at is accepted'
);

select throws_ok(
  $$
    insert into public.jobs (source_id, external_id, company_name, title, apply_url, is_remote, salary_min, salary_max)
    values ('test_source', 'job-5', 'Acme', 'Engineer', 'https://example.com/apply/5', true, 200000, 150000)
  $$,
  '23514',
  null,
  'salary_min greater than salary_max is rejected'
);

select lives_ok(
  $$
    insert into public.jobs (source_id, external_id, company_name, title, apply_url, is_remote, salary_min)
    values ('test_source', 'job-6', 'Acme', 'Engineer', 'https://example.com/apply/6', true, 150000)
  $$,
  'a salary with only a minimum is accepted'
);

select * from finish();

rollback;
