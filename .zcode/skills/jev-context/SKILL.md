---
name: jev-context
description: Use when large tool results need relevance review or a user wants advice about a compaction checkpoint. Starts with a keep/drop proposal; does not install hooks or automatically rewrite agent memory.
---

# Review context relevance without losing the original

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

1. Keep the original tool output retrievable before proposing reduction. Preserve source paths, IDs, errors, open tasks and user constraints independently.
2. Ask one relevance question per named block; leave uncertain and unjudged blocks visible. An apparent duplicate may contain a changed identifier or error.
3. Start in advisory/shadow use: report what would be hidden, where it can be recalled and why it matters to the current task. Do not modify transcript files.
4. Treat compaction timing as a separate question from what to retain. A completed phase does not prove future turns no longer need earlier details.
5. Only a supported native host operation can compact, and only with the required authorization. Pressure-dependent thresholds are policy choices to test on later continuations.

## Context and parallelism

Jev does not inherit the agent's history. Give every request sufficient context:
the active goal, unresolved dependencies, planned next work, original named blocks
and their source/version IDs. Do not ask whether an isolated block matters without
showing what the agent is trying to do. Omit unrelated content and secrets, but
preserve evidence that could change a keep/drop decision.

Batch independent per-block relevance questions over shared task context instead
of serial LLM calls. Use bounded concurrency for independent requests, with stable
block/question IDs, rate limits and a cost/time budget. The host schedules calls;
the CLI has no parallel scheduler. Questions cannot read other answers in the same
request: do not judge the sufficiency of a retained set until that set exists.
Use Jev's low latency to review many blocks, not to discard context without checks.

## Make it yours

Replace the example's evidence, candidate IDs and criteria together. Preserve a
no-match route when the real task can fall outside the labels. Agree on how the
host or person consumes each answer before enabling any automatic effect.

## Precedent

[Related project or author example](https://github.com/GhalebDweikat/winnow). Our workflow is an adaptation,
not that project's code, an automatic installer, or a reproduced benchmark.
[Laya service docs](http://172.27.116.56:8000/docs).
