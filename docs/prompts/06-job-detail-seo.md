# Layer 6 — Job detail pages and SEO

**Goal:** every open job has a server-rendered page at `/jobs/[slug]` with full description, apply button, source attribution, `JobPosting` JSON-LD for Google's job search (marked as a remote job open to US applicants), page metadata and Open Graph tags, a sitemap and robots file. Closed jobs show a "no longer accepting applications" notice, are marked noindex and drop their structured data, matching Google's guidance for expired postings.

**Mode:** plan mode. Explanatory.

## Before you start

```bash
cd ~/Desktop/sauce-dev/remote-tech-jobs-seeker
git status --short
npm run db:start
claude
```

## Prompt

```
Layer 6: Job detail pages and SEO. Follow the learning workflow rules in CLAUDE.md. Present a plan and wait for my approval.

Context: @src/app/ @src/lib/ @supabase/migrations/ @CLAUDE.md (attribution rule) @docs/decisions/

## Preconditions (stop if any fail)
- Layer 5 committed; the slug helper and JobCard links exist.
- Read Google's current JobPosting structured data documentation before writing JSON-LD; don't rely on memory for required/recommended properties.

## Part A: Page
- src/app/jobs/[slug]/page.tsx: parse the short id out of the slug and fetch by id. If the slug text doesn't match the current canonical slug (title changed), permanent-redirect to the canonical slug. Missing id → notFound().
- Rendering: description_html was sanitized at ingest; sanitize again at render (defense in depth) with the same allowlist and explain why both. Style the HTML with Tailwind typography or equivalent.
- Layout: title, company (+logo, website), remote region, employment type, salary, posted date, tags; a sticky Apply button (opens apply_url in a new tab with rel="noopener"); "More jobs at <company>" (up to 5).
- Attribution (from CLAUDE.md): for Remotive and Remote OK jobs, show "Source: <name>" with a normal followed link to source_url (no rel="nofollow"). ATS jobs show "Posted on <company>'s careers page".
- Duplicate jobs (duplicate_of set): permanent-redirect to the canonical job's page.
- Closed jobs: keep rendering with a clear "no longer accepting applications" notice, hide Apply, set robots noindex, and omit JSON-LD. Deleted jobs (after the cleanup grace period) 404.
- Caching: choose and explain a revalidation strategy (time-based revalidation vs fully dynamic) given that ingestion runs every 6 hours.

## Part B: Structured data
- src/lib/seo/job-posting.ts: build the JSON-LD from a job row, with a typed return (schema-dts or a local type; justify).
- Map fields per current Google docs, including: title, description (HTML allowed), datePosted, validThrough (posted_at + 30 days if the source has none; explain), employmentType mapped to Google's enum, hiringOrganization (name, sameAs website, logo), directApply false, identifier.
- Remote jobs: jobLocationType TELECOMMUTE plus applicantLocationRequirements with Country "USA" for us/north_america regions. For worldwide jobs, decide what applicantLocationRequirements should contain per the docs and explain.
- baseSalary only when the source provides real numbers (never estimates); map period to unitText.
- Serialize safely: escape "<" in the JSON so a description can't break out of the script tag (explain the XSS vector).
- Unit tests with fixtures: US-remote job, worldwide job, no-salary job, salary job, closed job (returns null).

## Part C: Metadata, sitemap, robots
- generateMetadata: "<title> at <company> (Remote)" title, description from the first ~155 chars of description_text, canonical URL, Open Graph + Twitter tags.
- Dynamic Open Graph image via next/og (title, company, salary).
- app/sitemap.ts: home + all open canonical job pages with lastModified. If open jobs could exceed 50,000 URLs, use generateSitemaps; explain the limit.
- app/robots.ts: allow all, disallow /api and future /account routes, point to the sitemap.
- Site URL from an env var NEXT_PUBLIC_SITE_URL (add to .env.example) with a localhost default.

## Tests
- Unit tests above, slug redirect logic, attribution rendering per source (assert no nofollow on aggregator links).
- A Vitest check that the rendered page HTML contains exactly one application/ld+json script for an open job and none for a closed one.

## Finish
1. Show me the JSON-LD for one US-remote job. Tell me to validate a sample with Google's Rich Results Test after deploy (Layer 12), since it needs a public URL.
2. Layer-end rules from CLAUDE.md. Code-reviewer focus: XSS in description and JSON-LD, redirect loops, accidental indexing of closed jobs.
3. docs/decisions/0013 SEO approach (server rendering, canonical slug redirects, closed-job handling, double sanitization, JSON-LD remote mapping). Reasons from this prompt only.

## Final output to me
- Files table, sample JSON-LD, verification, reviewer findings
- 5 interview talking points
- Anything I must do manually
```
