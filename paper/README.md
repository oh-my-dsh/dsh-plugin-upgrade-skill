# Evaluating Agent Skills for Version-Specific Plugin Migration

**Preprint:** [arXiv:2609.30120](https://arxiv.org/abs/2609.30120), *Evaluating Agent Skills for Version-Specific Plugin Migration: A Retrospective Study* (cs.SE, September 2026). The source used for the arXiv version is `paper/latex/acl_latex.tex`; the planned journal target is JSS.

The inverted-U hypothesis is no longer a main claim or a completion criterion. No new solver calls were made. A blinded cross-family LLM panel now re-judges all 64 focal reports with Claude Opus 5.5 and GPT-5.5; both are model judgments, not human annotation. Historical configurations remain descriptive; the archived Flash S16 comparison is the focal case. The bounded, non-blind review initially used AI assistance; the authors subsequently reported human checking by contributing plugin authors.

See the [Chinese project guide](README.zh.md), [current stopping plan](INVERTED-U-WORKPLAN.zh.md), [claim/evidence map](audit/claim-evidence-20260917.md), and [submission package](submission/README.zh.md).

Build with `tectonic --outdir output/pdf paper/latex/acl_latex.tex`. Check the summaries with `node paper/scripts/summarize-submission-evidence.mjs --check` and `node paper/scripts/analyze-llm-judge-panel.mjs --check`. The legacy LaTeX filename is retained for compatibility. Author declarations and the publisher's current submission requirements require final author confirmation.

The complete contract-stratified analysis covers all 64 reports and 328 recorded decisions; it is separate from targeted semantic review. Human follow-up is author-reported without a separate item-level scoring dataset. Run `npm run check:paper-contracts` and `npm run check:paper-glm53` for offline checks.

The revised narrative centers the focal comparison and contract-level inspection. Historical and supplementary configurations are retained in Appendix B. Proposed maintenance checks are distinguished from empirically evaluated interventions.

Offline mechanism probes extract the S11 predicate and reconstruct the S18 timer with controls. `npm run check:paper-mechanisms` checks these plus exhaustive paired-sign sensitivity for all three existing endpoints. These are not end-to-end plugin repair trials.
