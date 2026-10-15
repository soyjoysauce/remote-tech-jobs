# Layer 12 — Deploy, hardening, portfolio polish

**Goal:** the site runs on Vercel (Hobby), connected to the hosted Supabase project, with production auth working for all four sign-in methods. It gets security headers including a Content Security Policy, rate limits on every costly or abusable endpoint, smoke and accessibility tests against the live URL, and analytics. The README becomes a portfolio page, and an interview guide is compiled from the decision log.

**Mode:** plan mode. Explanatory.

## Before you start (manual)

1. Create a Vercel account (Hobby) signed in with GitHub.
2. Then:

```bash
npm i -g vercel
vercel login
cd ~/Desktop/sauce-dev/remote-tech-jobs-seeker
git status --short
claude
```

## Prompt

```
Layer 12: Deploy, hardening, portfolio polish. Follow the learning workflow rules in CLAUDE.md. Present a plan and wait for my approval.

Context: @CLAUDE.md @README.md @.env.example @next.config.ts @src/ @.github/workflows/ @docs/decisions/

## Preconditions (stop if any fail)
- Layer 11 committed; all CI jobs green on main; scheduled workflows running against the hosted Supabase project.
- Read current Vercel Hobby limits (function duration, cron, analytics availability, usage terms) and the Next.js 16 CSP guide before deciding anything below.

## Part A: Vercel
1. Tell me to run `vercel link` myself (interactive). Then connect the GitHub repo so main deploys to production and PRs get preview deployments.
2. Derive the required production env vars from the code (grep process.env), split into public (NEXT_PUBLIC_*) and server-only. Flag any server-only secret the web app doesn't strictly need on Vercel and remove that dependency if practical (e.g. prefer a narrowly scoped SECURITY DEFINER function over shipping the Supabase secret key to Vercel just for one route; explain the trade-off).
3. Give me the exact `vercel env add NAME production` commands (they prompt for values); I'll run them. Preview deployments must not hit production AI keys: decide preview env values (e.g. AI features disabled on preview) and explain.
4. Deploy to production and confirm the build and runtime logs are clean (`vercel logs`).

## Part B: Production auth and Supabase settings (I do these in dashboards; give me a checklist with exact values)
- Supabase Auth: Site URL = production URL; Redirect URLs allowlist includes production /auth/callback (and /auth/confirm if used) and the Vercel preview pattern if previews should support login.
- Auth hook for the allowlist enabled on the hosted project; my email inserted into allowed_emails.
- Google and GitHub OAuth apps: confirm redirect URIs point to the hosted Supabase callback; GitHub OAuth apps allow one callback URL, so explain whether I need a separate app for local.
- Email templates: confirm magic link/confirmation emails work on hosted Supabase's built-in email sender and note its rate limits; recommend whether to configure custom SMTP (Resend) for auth emails.
- Then test all four sign-in methods on production and confirm a non-allowlisted email is rejected.

## Part C: Security hardening
- Headers (next.config.ts headers() and/or proxy.ts): Content-Security-Policy, Strict-Transport-Security, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, frame-ancestors 'none'.
- CSP: compare a nonce-based CSP (per the Next.js guide; forces dynamic rendering, affects job-page caching) with a static policy using 'self' + required origins and hashes. Recommend one for this site given the JSON-LD script and Supabase/Vercel origins; implement it; verify no CSP violations in the browser console on home, job page, login, account pages.
- Rate limits audit: list every server action and route handler with its auth requirement and limit. Ensure: AI generation (daily cap from Layer 10), resume upload, "send test email", alert pause route, and save/apply actions all have sane limits. Implement any missing ones with a small Postgres-backed limiter (no new paid service); explain why not in-memory on serverless.
- Dependency audit: npm audit --omit=dev must be clean or each finding explained.
- Error handling: user-facing errors never include stack traces or upstream API messages; server logs never include emails, resume text or keys.

## Part D: Quality checks
- Playwright smoke tests (tests/e2e/): home search with a keyword and filter, open a job page and assert JSON-LD present, login page renders all four methods, /account redirects when signed out. Runnable against any base URL (PLAYWRIGHT_BASE_URL). Add an @axe-core/playwright accessibility check on those pages; fix serious/critical violations.
- A workflow that runs the smoke tests against the Vercel preview URL on PRs (use the deployment status event; verify the current approach) and against production after deploy.
- Run Lighthouse against production for home and a job page; report scores and fix anything below 90 for accessibility/SEO/best practices that is in my control.
- Enable Vercel Web Analytics and Speed Insights if available on Hobby.

## Part E: Portfolio polish
- README rewrite:
  - One-paragraph pitch and live URL
  - Screenshots (tell me which to capture; reference images in docs/images/)
  - Feature list
  - Architecture Mermaid diagram: Vercel, Supabase (Postgres/Auth/Storage/pgvector), GitHub Actions jobs, Remotive/Remote OK/Greenhouse/Lever/Ashby, Anthropic, Voyage, Resend
  - "Key engineering decisions" linking to docs/decisions
  - "How I built this with Claude Code" linking to docs/prompts (I'll add the prompt files there)
  - Local setup, scripts, monthly cost breakdown, data source attribution
- docs/interview-guide.md: compile every decision's "Interview talking points" grouped by topic (data pipeline, search, auth/RLS, AI, infra), plus a 60-second project walkthrough script and the 10 questions an interviewer is most likely to ask about this codebase with short answers grounded in the actual code (cite files).
- Submit-to-Google checklist for me: verify the domain in Search Console, submit the sitemap, and run the Rich Results Test on two job URLs.

## Finish
1. Layer-end rules from CLAUDE.md. Code-reviewer focus: CSP gaps, secrets on Vercel, preview vs production isolation, rate-limit coverage.
2. docs/decisions/0019 deployment and security (Vercel env split, preview isolation, CSP choice, Postgres rate limiter, smoke tests on previews). Reasons from this prompt only.

## Final output to me
- Production URL, files table, Lighthouse scores, Playwright/axe results, verification, reviewer findings
- The completed dashboard checklist with anything still pending
- 5 interview talking points
```
