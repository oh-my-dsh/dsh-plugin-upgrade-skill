# Grading packet

This folder is everything you need for the review. It is self-contained:
you do not need, and should not look for, any other file.

## Contents

- `rubric.md` — how to grade. Read it first.
- `answers/R001.md` ... `answers/R032.md` — 32 anonymous agent answers. The first
  lines of each file name the answer id and the task it responds to.
- `tasks/T01/` ... `tasks/T16/` — for each task, the brief the agent was given
  (`instruction.md`) and the read-only input files it could inspect
  (`fixture/`). Every task has exactly two answers in this packet.
- `reviewer-a.csv`, `reviewer-b.csv` — blank forms. Fill only the one the
  coordinator assigned to you.

## What you are asked to do

1. Read `rubric.md`.
2. For each answer, read its task folder and then the answer, and fill one
   row of your form: the answer id (for example `R001`) in `review_id`, your
   own reviewer id in `reviewer_id`, and the rubric fields.
3. Work alone. Do not look at another reviewer's form before you submit yours.
4. Grade only from this folder. Do not search the project repository or the
   web for these answers, and do not run any tooling to rebuild how this
   packet was assembled. The coordinator keeps the key that links ids to
   their origin and will not share it until both forms are in.

## What was hidden, and how

No answer is labelled with the assistant or configuration that produced it,
and no earlier assessment is shown. Answer ids follow a fixed shuffled order
that is unrelated to answer content.

Where an answer named the specific tooling or reference files that were
available to the assistant that wrote it (for example a named procedure, its
reference file names, or local folder paths that include its name), those
words were replaced with the neutral token `[redacted]`. The same replacement
procedure was applied to every answer. Do not guess what a token stood for,
do not infer anything from how many tokens an answer contains, and do not
credit or penalise an answer for containing one: grade the substance that
remains.

The masking is word-level only. Answers may still differ in style, structure,
or in how they refer to reference material, and that may hint at how they
were produced, so this review is not claimed to be fully blind. If you think
you can tell how an answer was produced, say so in `rationale` and grade it
on its merits anyway.
