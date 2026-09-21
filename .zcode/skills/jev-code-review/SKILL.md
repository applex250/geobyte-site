---
name: jev-code-review
description: Use for targeted review of a supplied code change and associated test receipts against custom review criteria. Returns evidence-backed review leads, not merge approval or a replacement for tests.
---

# Review a diff and its completion evidence

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

1. Collect the actual diff, relevant source and tests, acceptance criteria and real command receipts. Mark unavailable evidence as missing.
2. Separate concerns such as correctness, compatibility and test coverage. Select concrete hunks before attaching severity to a finding.
3. Use test receipts to check completion claims; a passing altered test is not evidence for the original behavior.
4. Return each lead with its hunk/source ID, concern, uncertainty and a concrete verification step. A Jev label alone is not proof of a defect.
5. Keep compilers, static analysis and original tests. Do not merge, publish, change review protections or edit tests merely because the judgment suggests approval.

## Context and parallelism

Jev does not inherit the agent's history. Give every request sufficient context:
requirements, the actual diff, surrounding source and relevant callers, invariants,
tests and their receipts. A hunk alone may hide the reason for a change; preserve
cross-file dependencies. Mark missing evidence and omit unrelated files and secrets.

Batch independent review criteria over the same diff instead of serial LLM calls.
Use bounded concurrency for independent change groups, with hunk/question IDs,
rate limits and a cost/time budget; include shared dependencies in each request.
The host schedules calls; the CLI has no parallel scheduler. Questions cannot read
other answers in the same request: a finding-dependent verification needs a later
call with its receipt. Jev's low latency helps broad screening, not patch generation
or replacing tests and deeper review.

## Make it yours

Replace the example's evidence, candidate IDs and criteria together. Preserve a
no-match route when the real task can fall outside the labels. Agree on how the
host or person consumes each answer before enabling any automatic effect.

## Precedent

[Related project or author example](https://github.com/devagrawal09/jev-review). Our workflow is an adaptation,
not that project's code, an automatic installer, or a reproduced benchmark.
[Laya service docs](http://172.27.116.56:8000/docs).
