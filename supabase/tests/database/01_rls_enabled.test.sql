-- Every pipeline table must have row level security enabled.
-- pg_class.relrowsecurity is the flag that `alter table ... enable row level security` sets.
begin;

create extension if not exists pgtap with schema extensions;

select plan(4);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.sources'::regclass),
  'RLS is enabled on sources'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.companies'::regclass),
  'RLS is enabled on companies'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.jobs'::regclass),
  'RLS is enabled on jobs'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.ingestion_runs'::regclass),
  'RLS is enabled on ingestion_runs'
);

select * from finish();

rollback;
