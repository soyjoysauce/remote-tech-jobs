# Study guide: the remote-US classifier

Code: [`src/lib/ingestion/classify/remote-us.ts`](../../src/lib/ingestion/classify/remote-us.ts)
Tests: [`src/lib/ingestion/classify/remote-us.test.ts`](../../src/lib/ingestion/classify/remote-us.test.ts)
Related: [`classify/tech.ts`](../../src/lib/ingestion/classify/tech.ts) (the other filter), migration `ingestion_layer_3a` (the `remote_region` values)

## 1. The problem in one paragraph

The site lists only jobs a person **living in the US** can take **remotely**. Feeds describe location as free text, and every source writes it differently: `"Remote - US"`, `"USA, Canada, USA timezones"`, `"Northern America, LATAM, Europe, APAC"`, `"Kansas "`, or nothing at all. `classifyRemoteUS` reads that text, plus the source's "this is remote" flag and the job's tags, and answers three questions:

```ts
classifyRemoteUS({ locationRaw: "Remote, CA or NY" });
// → { isRemote: true, remoteRegion: "us", eligible: true }
```

| Field          | Question                                                                                             |
| -------------- | ---------------------------------------------------------------------------------------------------- |
| `isRemote`     | Is the job remote at all?                                                                            |
| `remoteRegion` | Where may the worker live? (`us`, `north_america`, `americas`, `worldwide`, `non_us`, `unknown`)     |
| `eligible`     | Both together: remote **and** open to US residents. The pipeline keeps a job only when this is true. |

## 2. Where it sits in the pipeline

```
validate -> normalize -> isTechRole -> classifyRemoteUS -> stale filter -> dedupe key + hash -> upsert
                                        └─ eligible false → counted in not_remote_us_count, dropped
```

`remoteRegion` is stored in `jobs.remote_region` for kept jobs, so Layer 5 can offer filters such as "US only" vs "open to the Americas". `non_us` is never stored, because those jobs are dropped first, and the database CHECK constraint rejects it.

## 3. The main idea: look for positive signals

There are about 200 countries and endless spellings, so the classifier does **not** keep a list of non-US places. It only knows the signals it cares about:

| Signal                              | Examples                                                                  | Region          |
| ----------------------------------- | ------------------------------------------------------------------------- | --------------- |
| US country names                    | `us`, `usa`, `united states` (dots removed, so `U.S.` and `U.S.A.` count) | `us`            |
| US state names                      | `texas`, `kansas`, `new york`                                             | `us`            |
| US state codes, **upper case only** | `CA`, `NY`, `TX`                                                          | `us`            |
| North America                       | `north america`, `northern america`                                       | `north_america` |
| Americas                            | `americas`                                                                | `americas`      |
| Worldwide                           | `worldwide`, `anywhere`, `global`                                         | `worldwide`     |

Then it uses one rule for everything else: **if the text names a place and none of those signals matched, the place is non-US.** "Place" means any word left after removing filler words such as `remote`, `only`, `fully`, `timezone` and `or`. So `"Germany"`, `"Remote (UK)"`, `"EMEA"` and `"Bishkek"` all become `non_us` without the code ever listing them.

## 4. Step by step

Trace of `"Europe, USA, Canada, APAC"` with `sourceRemoteFlag: true`:

| Step           | Code                                    | Result                       |
| -------------- | --------------------------------------- | ---------------------------- |
| clean the text | `toPaddedWords`                         | `" europe usa canada apac "` |
| US signal?     | `hasPhrase(padded, US_COUNTRY_PHRASES)` | yes, `" usa "` → region `us` |
| remote?        | flag is true                            | `isRemote: true`             |
| eligible?      | remote AND region accepts US workers    | `true`                       |

Trace of `"Remote - Canada"`, no flag:

| Step                                       | Result                             |
| ------------------------------------------ | ---------------------------------- |
| clean                                      | `" remote canada "`                |
| US / North America / Americas / worldwide? | none                               |
| leftover place words (minus filler)        | `["canada"]` → region `non_us`     |
| remote?                                    | `"remote"` is in the text → `true` |
| eligible?                                  | remote, but `non_us` → **false**   |

### Priority order in `detectRegion`

```
US mention  >  North America  >  Americas  >  worldwide  >  non_us  >  unknown
```

- **US wins over everything.** In a mixed list like `"Europe, USA, Canada"`, a US resident can take the job, so it's `us`.
- **North America beats Americas** because it's the narrower, more informative answer.
- **`non_us` only when nothing positive matched.** That's what makes the "no country list" idea work.

## 5. The tricky parts (and how each is handled)

### Short codes hiding inside words

`"Australia"` contains the letters `us`, and `"Canada"` starts with `ca`. A naive `text.includes("us")` would call both US jobs.

- **Whole-word matching.** `toPaddedWords` turns text into `" word word "` with a space at each end, and `hasPhrase` looks for `" us "`, spaces included. `" australia "` doesn't contain `" us "`. The test cases are Australia, Russia and Belarus.

### State codes that are also English words

`OR` is Oregon, but `"or"` is a word (`"Remote, CA or NY"`). Likewise `IN`/`in`, `ME`/`me`, and `DE`/`de` (Delaware, but also Spanish _de_ in `"Ciudad de México"`).

- **Codes match only in upper case, against the original text** (`hasStateCode` uses `/\b[A-Z]{2}\b/`). `"Austin, TX"` matches; the lower-case word `"or"` doesn't. State **names** are matched case-insensitively, because they aren't ambiguous (except Georgia; see limitations).

### Empty location: the judgment call

Remote OK leaves location blank on most jobs. In the first real run, 12 of 13 kept Remote OK jobs had no location.

- **Empty location + remote flag → eligible, region `unknown`.** Dropping them would lose most of Remote OK; keeping them lets in some that turn out to be non-US. `unknown` lets the UI say "location not specified" instead of falsely claiming "US".
- **Empty location, no remote flag → not remote, not eligible.**

### Tags as a weaker fallback

If the location gives no region, tags are checked for **positive** signals only (`detectRegion(tagText, false)`). Tags can't produce `non_us`: words like `react` and `golang` would count as "leftover place words" and wrongly mark the job non-US.

### Remote vs on-site

`"San Francisco, CA"` with no flag has a US region but no remote signal, so it's an on-site job and **not eligible**. The same text with `sourceRemoteFlag: true` is eligible. `isRemote` is true if any of these say so: the source flag, the word `remote` (or `wfh`) in the location, `worldwide`/`anywhere` (an on-site job can't be "anywhere"), or a `remote` tag.

## 6. Real data

From the first real run (2026-10-28):

| Source    | Fetched | Not tech | Not remote-US | Stale | Kept | Kept regions          |
| --------- | ------- | -------- | ------------- | ----- | ---- | --------------------- |
| Remotive  | 11      | 6        | 0             | 0     | 5    | 3 `us`, 2 `worldwide` |
| Remote OK | 99      | 74       | 3             | 9     | 13   | 1 `us`, 12 `unknown`  |

Real Remotive values in the tests: `"USA, Canada, USA timezones"` → `us`; `"Northern America, LATAM, Europe, APAC"` → `north_america`; `"Americas, Europe, Israel"` → `americas`.

**A real false positive:** Remote OK listed _"Senior Software Engineer LATAM"_ (Wagmo) with an **empty** location. The classifier only reads location and tags, so it saw nothing and kept the job as `unknown`. The region is in the **title**. See limitations and exercise 1.

## 7. Design decisions and alternatives

| Decision                                       | Alternative                             | Why not                                                                                                                                        |
| ---------------------------------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Positive signals + "leftover words are non-US" | A full list of every country and region | Long, never complete, and still misses cities ("Bishkek"). Our side is small: the US, two region names, and worldwide words.                   |
| Whole-word matching with padded strings        | Regex `\b` boundaries                   | Both work. Padding plus `includes` is easy to read and handles multi-word phrases ("united states", "new york") the same way as single words.  |
| Upper-case-only state codes                    | Case-insensitive codes                  | `or`, `in`, `me`, `de` would make ordinary words look like US states.                                                                          |
| Empty + remote flag → eligible `unknown`       | Drop them                               | Would lose most of Remote OK. `unknown` is honest in the UI.                                                                                   |
| Rules in code                                  | An LLM or geocoding API                 | Costs money per job, adds latency and a network dependency to every run, and is hard to test. Rules are free, instant and covered by 42 tests. |
| Separate `isRemote` and `remoteRegion`         | One `eligible` boolean                  | Layer 5 can filter by region, and the run log can explain _why_ a job was dropped.                                                             |

## 8. Known limitations (good interview material)

- **Region words in the title are ignored** (`"Senior Software Engineer LATAM"`). A fix: pass the title and treat a non-US region word in it as `non_us` when the location is empty.
- **A US city without its state** (`"Boston"`, `"Redwood City"`) has no US signal, so it's classed `non_us`. A small list of major US cities would fix most cases.
- **Georgia** is read as the US state, even when it means the country.
- **An upper-case `IN`** meaning India reads as Indiana.
- **"Remote" plus a non-US place reads as non-US,** even when the employer meant "remote, but HQ in London". That's the safe direction: the job is dropped, not wrongly listed.

## 9. Interview questions to practice

1. _"How do you decide a job is open to US residents?"_ Positive signals first (US, North America, Americas, worldwide), in priority order. Any other named place is non-US, and an empty location with a remote flag is `unknown` but kept.
2. _"Why not a country list?"_ It's never complete. Our side of the decision is small, so I list that side and treat everything else as "not ours".
3. _"How do you stop `us` matching Australia?"_ Whole-word matching on a space-padded string.
4. _"Why upper-case-only state codes?"_ Several codes are common words: `or`, `in`, `me`, `de`.
5. _"What's the empty-location judgment call?"_ Explain the trade-off and why `unknown` beats claiming `us`.
6. _"What did real data show you?"_ 12 of 13 Remote OK jobs had no location, and one LATAM-only job slipped through because its region was in the title.

## 10. Exercises

Add a failing test to `remote-us.test.ts` first, then change the code.

1. Make an empty-location job titled `"Senior Software Engineer LATAM"` not eligible. (You'll need to pass the title from `pipeline.ts`.)
2. Make `"Boston"` with a remote flag classify as `us`.
3. Make `"Remote (EST/PST)"`, US time zones only, classify as `us`.
4. Find out which 3 Remote OK jobs were `not_remote_us` in the first run. (Hint: run the dry run and log them in `processItems`, or query their raw payloads.)
