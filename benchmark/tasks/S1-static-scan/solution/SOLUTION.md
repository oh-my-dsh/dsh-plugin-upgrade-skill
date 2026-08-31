# S1 Reference Solution

## Reference report

See [solution/report.md](report.md) — it lists the hit files/lines, the card mapping, and the no-hit explanations per touchpoint category, and is expected to score 100.

## Point under test (in one sentence)

On a static fixture with all seven touchpoint categories planted, it tests "complete scan + accurate card mapping + read-only discipline"; the `ignorable` event producer is the **corridor folding of A1-02 (removed in alpha.1) ↔ A2-01 (restored in alpha.2)**: the net state of the target alpha.2 keeps `ignorable: true`, so reporting only A1-02 or only A2-01 means the net state was not accounted for (the judge requires both cards).
