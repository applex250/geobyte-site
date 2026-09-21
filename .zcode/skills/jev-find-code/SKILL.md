---
name: jev-find-code
description: Use for natural-language repository navigation or choosing which observed files to inspect next. Works with supplied paths and summaries; not a replacement for required graph search or exact symbol lookup.
---

# Find likely code locations from observed candidates

## Route: local Laya only

This build has exactly one decision route — the local Laya service on the
campus network: http://172.27.116.56:8000 (override with the `LAYA_URL`
environment variable). Keyless, no cost, and data stays inside the campus
network. There is no provider choice and no simulation mode; a connection
failure is reported, never silently routed elsewhere.

The CLI auto-picks the Laya variant per request (classification →
`english`/`multilingual` by detected language, `score` → `typed-decisions`);
force one with `--model`. `--dry-run` only validates; it neither classifies
nor makes a network call. `setup` prints read-only route facts.

## Jev API prerequisite and first example

In decision-API mode, this install runs the shared script from the sibling
`jev` skill folder directly (Python 3.10+) against the local keyless Laya
service — the only destination.
No sibling skill or third-party integration is required for this judgment.
Actual UI, file, mailbox or simulation actions require the host's own tools.

Resolve `<skill-dir>` to this installed folder. Copy and edit
[assets/example.json](assets/example.json) for the user's task; it is synthetic
input, not a captured successful result. Validate it without a key or API call:

The commands call the local keyless Laya service (campus network) — the only
destination in this build.

```bash
python3 <jev-skill-dir>/scripts/jev.py decide <skill-dir>/assets/example.json --dry-run
# After reviewing the input (Laya is the default destination and needs no key):
python3 <jev-skill-dir>/scripts/jev.py decide /path/to/edited-request.json
```

Normal calls send the supplied evidence to the campus Laya service at no cost. Read relevant answers, not only the exit code: `0` means selected/scored,
`2` means review, `1` means error. A confidently false Noul is still false;
selection is not permission. Unknown, missing or conflicting evidence needs a
fallback. Test thresholds on the user's task rather than assuming 0.9 is safe.

## Workflow

1. Use the project-required graph/index tools first; use exact lookup for known symbols. Use semantic selection when a natural-language question leaves several plausible observed candidates.
2. Build candidates from real paths and observed summaries. State clearly when only path names, rather than file contents, were available.
3. For large trees, select a local branch and then inspect its contents; bound traversal and retain alternate branches rather than treating the first choice as proof.
4. Open the selected source with the appropriate code tool and verify relevance. Update state or backtrack when the file is unrelated.
5. Return inspected paths and concrete evidence separately from uninspected leads. Walker shares, relevance scores and probability of containing a bug are different quantities.

## Context and parallelism

Jev does not inherit the agent's history. Give every request sufficient context:
the problem, observed behavior/errors, relevant prior reads, graph relationships
and real candidate paths with observed summaries or excerpts. Bare filenames alone
may not distinguish candidates; mark what has not been read and omit unrelated
files and secrets, not evidence necessary to rank the candidates.

Batch independent relevance questions over an observed candidate set instead of
serial LLM calls. Use bounded concurrency for independent searches, with stable
path/question IDs, rate limits and a cost/time budget. The host schedules calls;
the CLI has no parallel scheduler. Questions cannot read other answers in the same
request: inspect a chosen branch before asking about its unseen children. Jev's
low latency helps wide ranking; code tools still retrieve and verify actual source.

## Make it yours

Replace the example's evidence, candidate IDs and criteria together. Preserve a
no-match route when the real task can fall outside the labels. Agree on how the
host or person consumes each answer before enabling any automatic effect.

## Precedent

[Related project or author example](https://github.com/ellipsis-dev/blink). Our workflow is an adaptation,
not that project's code, an automatic installer, or a reproduced benchmark.
[Laya service docs](http://172.27.116.56:8000/docs).
