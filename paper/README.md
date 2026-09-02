# Do Migration Skills Actually Help? A Community-Grounded Benchmark for Skill-Guided Framework Migration

[中文说明](README.zh.md)

This directory holds the technical report on the effectiveness of the dsh plugin-upgrade skills. The report studies whether skills---procedural-knowledge documents loaded at inference time---actually help in framework migration: we build a paired-evaluation benchmark from 24 community-reported, verified plugin-migration failures in the dsh plugin ecosystem, and measure the distribution of skill gains, robustness to misleading context, temporal-holdout generalization, and over-trust failure modes.

## Directory structure

- `latex/` — LaTeX source of the report
  - `acl_latex.tex` — main file (title, authors, abstract, full section skeleton; based on the latest official template)
  - `acl.sty` / `acl_natbib.bst` — official ACL style (acl-org/acl-style-files master, 2026-06)
  - `custom.bib` — bibliography (contains stub entries to be verified; see TODOs in the file)
  - `formatting.md` — official formatting guidelines
  - `acl_lualatex.tex` — XeLaTeX / LuaLaTeX template (unused)
- `word/`, `archive/` — official Word template and legacy templates (unused, kept as shipped with the style package)

## Build

```bash
cd latex
pdflatex acl_latex && bibtex acl_latex && pdflatex acl_latex && pdflatex acl_latex
```

Or upload the `latex/` directory to [Overleaf](https://www.overleaf.com/). The document currently uses `review` mode (with line numbers).

## Generated benchmark metadata

The benchmark task metadata used by the paper is **generated, never hand-written**:

- **Source of truth**: one frozen evaluation snapshot, `benchmark/snapshots/2026-09-01-main-23.json` (currently 23 tasks, 3 runs per task, `per-task-median` aggregation, 2 conditions).
- The generator (`paper/scripts/generate-benchmark-table.mjs`) reads every task row, registry Type (`Static` / `Hands-on`), and description from **git objects at the snapshot's pinned benchmark commit** — never from the current checkout. Tasks added to the living benchmark after the pinned commit do not change the paper metadata of this experiment.
- The living benchmark (43+ tasks on `main`) is **not** the paper's evaluation set. Paper experiments are always pinned to an explicit snapshot; there is no "latest snapshot" behavior.

Generated files (committed, do not edit by hand):

- `paper/generated/benchmark-metadata.tex` — deterministic macros (`\BenchmarkTaskCount`, `\BenchmarkStaticCount` / `\BenchmarkHandsOnCount`, ID-prefix counts `\BenchmarkPrefixSCount` / `\BenchmarkPrefixMCount` / `\BenchmarkPrefixHCount`, pinned benchmark/skill commits, runs-per-task, aggregation, condition count). Prefix counts and registry interaction Type are kept as **two separate dimensions** (H4/H6 are registry-Static despite the H prefix).
- `paper/generated/task-pool-table.tex` — the `Task | Type | What it tests` table (`\input` into the appendix).

Regenerate (from the repo root):

```bash
npm run generate:paper-benchmark
npm run check:paper-benchmark   # CI gate: fails if the committed files drift
```

`check:paper-benchmark` and the generator unit tests run as part of `npm test`, so a snapshot/metadata drift turns CI red. The generator is deterministic: the same snapshot plus the same local git objects always produces byte-identical files (no timestamps, no host paths), and a snapshot whose pinned commit is missing locally is a hard error rather than a fallback to current `main`.

## Writing status

- [x] Title / authors / abstract
- [x] Section skeleton (§1–§8 + Limitations + Ethics + appendices)
- [x] Introduction draft (community-grounded, four paragraphs)
- [ ] Fill in experimental numbers (`[N]` / `[X]` placeholders in the text; search `% TODO`)
- [ ] Replace Figure 1–3 and Table 1–5 placeholders with final figures/tables
- [ ] Verify and replace stub entries in `custom.bib`
- [ ] Draft §3–§5 and §6–§7

## Related resources

- Benchmark tasks and graders: `../benchmark/`
- Skill corpus: `../skills/`
- Official style source: [acl-org/acl-style-files](https://github.com/acl-org/acl-style-files)
