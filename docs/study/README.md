# Study guides

Interview study notes for the parts of the codebase worth explaining in depth. Each guide covers the problem, how the code works step by step, real data from the feeds, the alternatives that were turned down, known limitations, practice questions and exercises.

| Guide                                      | Code                                      | Layer |
| ------------------------------------------ | ----------------------------------------- | ----- |
| [The dedupe key](dedupe-key.md)            | `src/lib/ingestion/dedupe.ts`             | 3a    |
| [The remote-US classifier](remote-us.md)   | `src/lib/ingestion/classify/remote-us.ts` | 3a    |
| [Closing jobs safely](closing-strategy.md) | `src/lib/ingestion/reconcile.ts`          | 3a    |

Decision records (`docs/decisions/`) say _why_ a choice was made. These guides say _how the code works_, so you can walk through it out loud.
