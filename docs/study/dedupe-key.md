# Study guide: the dedupe key

Code: [`src/lib/ingestion/dedupe.ts`](../../src/lib/ingestion/dedupe.ts)
Tests: [`src/lib/ingestion/dedupe.test.ts`](../../src/lib/ingestion/dedupe.test.ts)
Related decisions: [0006 job pipeline schema](../decisions/0006-job-pipeline-schema.md) (why `dedupe_key` is indexed, not unique)

## 1. The problem in one paragraph

The site pulls jobs from several feeds, and the same posting often appears in more than one of them, spelled differently each time. Without de-duplication, a user sees the same job twice. `computeDedupeKey(companyName, title)` turns each listing into a short normalized string so that the same posting from two feeds gets the **same** key, and two different postings get **different** keys.

```
Remotive:   "Acme, Inc." + "Senior Software Engineer (Remote)"  ─┐
                                                                   ├─►  "acme|senior software engineer"
Remote OK:  "ACME"       + "Sr. Software Engineer - Remote"     ─┘
```

## 2. Where it sits in the pipeline

```
fetch -> validate -> normalize -> tech filter -> remote-US filter -> stale filter
      -> computeDedupeKey + contentHash -> upsert -> close
```

- Called once per job in `processItems` (`src/lib/ingestion/pipeline.ts`), after the filters, so only kept jobs get a key.
- Stored in `jobs.dedupe_key`, which has a plain (non-unique) index.
- **Layer 3a only stores the key.** Layer 3b reads it: jobs that share a key form a group, and `chooseCanonical` picks which one to show.
- The key is included in `content_hash` (`hash.ts`). If this function changes, every affected job counts as "changed" on its next run and gets the new key, with no separate backfill.

### Key ≠ search

A common confusion: the key is an **identity** ("which posting is this?"), not a **query** ("which postings do I want?"). Searching by title only is Layer 5's job and never looks at this key. Company has to be in the key because the same title at two companies is two different jobs. A title-only key would make every "Senior Software Engineer" in the database look like one job, and 3b would hide all but one of them.

## 3. The algorithm, step by step

Trace of `"ACME"` + `"Sr. Software Engineer - Remote"`:

| Step                                                         | Function           | Title                                       | Company            |
| ------------------------------------------------------------ | ------------------ | ------------------------------------------- | ------------------ |
| input                                                        |                    | `Sr. Software Engineer - Remote`            | `ACME`             |
| 1. cut at first `" - "`                                      | `normalizeTitle`   | `Sr. Software Engineer`                     |                    |
| 2. remove `( ... )` groups                                   | `normalizeTitle`   | `Sr. Software Engineer` (nothing to remove) |                    |
| 3. accents off, lower-case, delete dots, punctuation → space | `toWords`          | `sr software engineer`                      | `acme`             |
| 4. aliases (`sr` → `senior`)                                 | `normalizeTitle`   | `senior software engineer`                  |                    |
| 5. drop trailing legal suffix                                | `normalizeCompany` |                                             | `acme` (no suffix) |
| 6. join with `\|`                                            | `computeDedupeKey` | `acme\|senior software engineer`            |                    |

The other input, `"Acme, Inc."` + `"Senior Software Engineer (Remote)"`, takes a different route to the same place. Step 2 removes `(Remote)`, step 3 turns `"Acme, Inc."` into `acme inc`, and step 5 drops `inc`.

### Why the order matters

Steps 1 and 2 look for punctuation: `" - "` and parentheses. Step 3 erases punctuation. So 1 and 2 must run first, or there is nothing left to find. In any normalization pipeline, each step's position is set by what it needs to still be present.

## 4. Function by function

### `toWords(text)`: shared cleanup

| Operation                                           | Example                                               | Why                                                                                                                                                  |
| --------------------------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.normalize("NFKD")` then `.replace(/\p{M}/gu, "")` | `México` → `Mexico`                                   | Feeds disagree on accents. NFKD splits `é` into `e` plus an accent mark, and `\p{M}` (Unicode "mark" category, needs the `u` flag) deletes the mark. |
| `.toLowerCase()`                                    | `ACME` → `acme`                                       | Case never distinguishes jobs.                                                                                                                       |
| `.replace(/\./g, "")`                               | `L.L.C.` → `LLC`, `Sr.` → `Sr`                        | Deleting dots (instead of turning them into spaces) keeps abbreviations as one word.                                                                 |
| `.replace(/[^a-z0-9]+/g, " ")`                      | `Full-Stack` → `full stack`, `Acme, Inc` → `acme inc` | Every other punctuation run becomes one space. The `+` merges `", "` into a single space.                                                            |
| `.trim().split(" ").filter(...)`                    |                                                       | Gives a clean word array.                                                                                                                            |

The biggest lesson of this function: **keep word boundaries.** Deleting all punctuation _and spaces_ gives `acmeinc` and `srsoftwareengineer`, where you can no longer find "the word `inc`" or "the word `sr`". Every later rule works on whole words.

### `normalizeCompany(companyName)`

Cleans, then removes **one trailing** word if it is in `COMPANY_SUFFIXES` (`inc`, `llc`, `ltd`, `corp`, `co`).

- **Whole words only.** `Costco` stays `costco`, because the suffix check compares entire words, never substrings.
- **End only.** `Co Labs` stays `co labs`.
- **`words.length > 1` guard.** A company literally named "Co" isn't reduced to an empty string.

### `normalizeTitle(title)`

1. `title.split(" - ")[0]` keeps what comes before the first space-hyphen-space. `Back-end` has no spaces around its hyphen, so it doesn't split.
2. `.replace(/\([^)]*\)/g, " ")` removes parenthesized qualifiers. `[^)]*` means "anything except `)`", so each match stops at its own closing parenthesis.
3. `toWords`, then `.map(word => TITLE_ALIASES[word] ?? word)` rewrites `sr` → `senior` and `jr` → `junior`.

Things deliberately **not** removed: levels (`II`, `III`), seniority words (`senior`, `staff`, `principal`), and specialties (`frontend`, `react`). Removing them would merge different jobs.

### `computeDedupeKey(companyName, title)`

Returns `` `${company}|${title}` ``. The `|` separator stops the two halves from running together: without it, `"Acme Data" + "Engineer"` and `"Acme" + "Data Engineer"` would collide. Because `toWords` strips `|` from inputs, the separator appears exactly once.

### TypeScript details worth knowing

- **`?? title` after `split(" - ")[0]`, and `?? word` after `TITLE_ALIASES[word]`.** The project's `tsconfig` enables `noUncheckedIndexedAccess`, so any `array[i]` or `record[key]` is typed `T | undefined`. `??` supplies a fallback instead of a `!` assertion, which would silence the compiler without checking anything.
- **Rules are data** (`Set`, `Record`), not `if` chains. Adding `gmbh` or `mgr → manager` is a one-word change.

## 5. How it's tested

`dedupe.test.ts` never checks what a key looks like. It only checks how keys **relate**:

```ts
expect(key(a)).toBe(key(b)); // must collide: same posting
expect(key(a)).not.toBe(key(b)); // must stay apart: different postings
```

| Kind               | Guards against                                       | Examples                                                                                        |
| ------------------ | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `toBe` (collide)   | **Missed duplicates**: the user sees a job twice     | 9 suffix spellings, `Sr`/`Sr.`/`SR.`, 6 qualifier forms, `Full-Stack` = `Full Stack`            |
| `not.toBe` (apart) | **False merges**: a real job hidden as a "duplicate" | `Costco` ≠ `Cost`, `Co Labs` ≠ `Labs`, `II` ≠ `III`, `Frontend` ≠ `Backend`, the `\|` separator |

Why relational instead of exact strings:

- The format is an implementation detail, so the tests survive a rewrite.
- A function returning a constant passes every `toBe` test, which is exactly why the `not.toBe` tests exist. Both kinds together pin the behavior down.

This is sometimes called **property-style** testing: assert properties of the output (equal or different), not the output itself.

Run them: `npm run test:watch -- dedupe.test.ts` (press `t` to filter by test name).

## 6. Real data

From the captured fixtures (`tests/fixtures/`):

```
remotive | "Sanctuary Computer Inc" + "Senior Shopify Developer"           → "sanctuary computer|senior shopify developer"
remotive | "Credit Wellness, LLC"   + "Inside Sales Contractor"             → "credit wellness|inside sales contractor"
remotive | "Mitre Media"            + "Tech Lead Full-Stack Rails Engineer" → "mitre media|tech lead full stack rails engineer"
remoteok | "Bjak "                  + "Frontend Engineer"                   → "bjak|frontend engineer"
remoteok | "Lemon.io"               + "Senior React Full stack Developer"   → "lemonio|senior react full stack developer"
```

Note `"Bjak "` (trailing space from the feed) and `"Lemon.io"` (dot deleted → `lemonio`).

**Real duplicates, confirmed.** The first real ingest run (2026-10-28) stored 18 jobs, and two keys were shared across the two sources:

```
lemonio|senior react full stack developer     ← Remotive "Full-stack" + Remote OK "Full stack"
askable|software engineer ai coding tasks     ← same job on both feeds
```

The Lemon.io pair is the `Full-Stack` = `Full Stack` test case, seen in real data. Both rows are kept (the key is not unique); Layer 3b will show one. To see duplicates yourself:

```sql
select dedupe_key, array_agg(source_id) as sources, count(*)
from jobs
group by dedupe_key
having count(distinct source_id) > 1;
```

## 7. Design decisions and alternatives

| Decision                                        | Alternative                                      | Why not                                                                                                                                                                                                      |
| ----------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Deterministic rules                             | Fuzzy matching (Levenshtein, trigram similarity) | Fuzzy scores need a threshold and pairwise comparison (O(n²)), and the result isn't a key you can index or explain. Rules give one string per job, which Postgres can index and group.                       |
| Readable key (`acme\|senior software engineer`) | Hash the normalized string                       | A hash is shorter, but you can't eyeball it in SQL or debug why two jobs did or didn't match. The table is a few thousand rows, so size is irrelevant.                                                       |
| Indexed, **not unique** (decision 0006)         | `UNIQUE` constraint                              | A unique key would make the second source's insert fail, and any normalization flaw would become lost data. Non-unique means a bad collision only mis-groups rows, which a code fix repairs on the next run. |
| Company + title                                 | Add location                                     | Location strings are the messiest field across feeds ("USA" vs "Remote - US" vs empty), so including it would split real duplicates. The title qualifier is stripped for the same reason.                    |
| Key in `content_hash`                           | Backfill script after rule changes               | Hashing derived fields makes every run self-healing: change a rule, and affected rows rewrite themselves.                                                                                                    |

## 8. Known limitations (good interview material)

- **Different titles for the same job** (`"Software Engineer, Backend"` vs `"Backend Software Engineer"`) don't match. Word-order-insensitive keys (sorting words) would catch them, but would also merge `"Engineering Manager"` with `"Manager, Engineering"`, which is fine, and could merge genuinely different roles, which isn't.
- **Company name variants** (`"Meta"` vs `"Facebook"`, `"Acme Labs"` vs `"Acme"`) don't match. That would need an alias table or company IDs from 3b's `companies` table.
- **Only `" - "` qualifiers are cut**, so `"Software Engineer, Remote"` keeps `remote`. Easy to add if real data shows it.
- **English-centric aliases.** `"Sênior"` would become `senior` (via accent stripping), but other languages' seniority words won't.

## 9. Interview questions to practice

1. _"Why not just compare titles?"_ Two different companies' identical titles are different jobs. Identity needs company + title.
2. _"Why isn't `dedupe_key` unique?"_ Because it's my heuristic, not a fact from the source. A unique constraint would turn heuristic mistakes into failed inserts or lost data. The real uniqueness constraint is `(source_id, external_id)`, which comes from the source.
3. _"Walk me through how `Sr. Software Engineer - Remote` becomes a key."_ Use the table in section 3.
4. _"How did you test it?"_ Relational tests: pairs that must collide and pairs that must stay apart. Explain why both kinds are needed, using the constant-return example.
5. _"What happens when you change the normalization rules?"_ The key is part of `content_hash`, so each affected job counts as changed on its next run and is rewritten with the new key. No migration or backfill needed.
6. _"What would you improve?"_ Pick from section 8, and say what data you'd look at first (real collisions and near-misses from `select dedupe_key, count(*) from jobs group by 1 having count(*) > 1`).

## 10. Exercises

Each one is small. Add a failing test to `dedupe.test.ts` first, then change the code.

1. Make `"Acme GmbH"` match `"Acme"`.
2. Make `"Software Engineer, Remote"` match `"Software Engineer"` without breaking `"Engineer, Backend"`.
3. Make `"Mgr"` match `"Manager"`.
4. Extend the SQL query in section 6 to also show each source's original title (hint: `array_agg(title)`), so you can see what the normalization collapsed.
