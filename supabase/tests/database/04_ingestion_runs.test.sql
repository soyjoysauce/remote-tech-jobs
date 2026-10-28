-- ingestion_runs: the per-step counters added in Layer 3a and the status/finished_at pairing.
-- SQLSTATE 23514 is check_violation.
begin;

create extension if not exists pgtap with schema extensions;

select plan(5);

insert into public.sources (id, kind, display_name, api_base_url)
values ('test_source', 'aggregator', 'Test source', 'https://example.com/api');

select lives_ok(
  $$
    insert into public.ingestion_runs (
      source_id, status, finished_at, fetched_count, invalid_count, not_tech_count,
      not_remote_us_count, stale_count, eligible_count, inserted_count, updated_count,
      unchanged_count, closed_count, warnings
    )
    values ('test_source', 'succeeded', now(), 10, 1, 2, 3, 1, 3, 1, 1, 1, 0, '{"circuit breaker"}')
  $$,
  'a finished run with every counter set is accepted'
);

select is(
  (select warnings from public.ingestion_runs where source_id = 'test_source' and status = 'succeeded'),
  array['circuit breaker'],
  'warnings are stored as a text array'
);

insert into public.ingestion_runs (source_id) values ('test_source');

select is(
  (
    select array[invalid_count, not_tech_count, not_remote_us_count, stale_count, eligible_count, unchanged_count]
    from public.ingestion_runs
    where source_id = 'test_source' and status = 'running'
  ),
  array[0, 0, 0, 0, 0, 0],
  'new counters default to 0'
);

select throws_ok(
  $$ insert into public.ingestion_runs (source_id, invalid_count) values ('test_source', -1) $$,
  '23514',
  null,
  'a negative counter is rejected'
);

select throws_ok(
  $$ insert into public.ingestion_runs (source_id, status) values ('test_source', 'succeeded') $$,
  '23514',
  null,
  'a finished run without finished_at is rejected'
);

select * from finish();

rollback;
