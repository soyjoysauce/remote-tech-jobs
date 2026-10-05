-- Reference data for local development. `supabase db reset` runs this after the migrations.
-- It does NOT run against the hosted project on `supabase db push` unless --include-seed is passed.
--
-- The upsert makes the file safe to run more than once.
-- No companies here: Layer 3 discovers ATS boards.

insert into public.sources (id, kind, display_name, api_base_url, attribution_required, attribution_text)
values
  ('greenhouse', 'ats', 'Greenhouse', 'https://boards-api.greenhouse.io/v1/boards', false, null),
  ('lever', 'ats', 'Lever', 'https://api.lever.co/v0/postings', false, null),
  ('ashby', 'ats', 'Ashby', 'https://api.ashbyhq.com/posting-api/job-board', false, null),
  -- Remotive's API terms ask for a link back to the job's Remotive URL and a mention of Remotive as the source.
  ('remotive', 'aggregator', 'Remotive', 'https://remotive.com/api/remote-jobs', true, 'Source: Remotive'),
  -- Remote OK's API terms ask for a link back to the listing on Remote OK with Remote OK named as the source.
  ('remoteok', 'aggregator', 'Remote OK', 'https://remoteok.com/api', true, 'Source: Remote OK')
on conflict (id) do update
set
  kind = excluded.kind,
  display_name = excluded.display_name,
  api_base_url = excluded.api_base_url,
  attribution_required = excluded.attribution_required,
  attribution_text = excluded.attribution_text;
