---
name: jev-triage
description: Use for user-defined inbox, support-ticket, feedback or record classification and prioritization, especially bulk parallel judgments with sufficient per-record context. Produces labels and review queues, not replies or automatic mailbox changes.
---

# Sort messages and records by custom criteria

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

1. Agree on categories with short inclusions/exclusions. Use independent Nouls when records can have several labels; use Choice for one queue.
2. Preserve original record IDs. For multiple records, name the exact record ID in every question or send one request per record; one Choice over an entire inbox is not per-message classification.
3. Collect text only from files or accounts the user authorized. Classify before writing tags, moving messages or sending replies.
4. Return a reviewable table: record ID, category, urgency, uncertainty and intended next consumer. Keep other/missing-evidence records visible.
5. Test near-miss categories and user-labeled examples before applying a rule in bulk. Change labels and urgency anchors, not just the sample text.

## Context and parallelism

Jev does not inherit the agent's history. Give every request sufficient context:
the user's categories and priority policy, each record's text and relevant thread,
product/account facts, and known missing evidence. A last-message fragment is not
enough when earlier messages change its meaning; omit unrelated history and secrets.

For bulk triage, batch independent category, escalation and urgency questions over
shared state instead of serial LLM calls. Name the record ID in every question.
Use bounded concurrency for independent requests, with stable IDs, rate limits and
a cost/time budget. The host schedules calls; the CLI has no parallel scheduler.
Questions cannot read other answers in the same request: gather any newly needed
account evidence before a dependent follow-up. Low latency is a reason to use Jev
for the judgment stage, not to skip quality checks or automate mailbox changes.

## Make it yours

Replace the example's evidence, candidate IDs and criteria together. Preserve a
no-match route when the real task can fall outside the labels. Agree on how the
host or person consumes each answer before enabling any automatic effect.

## Precedent

[Related project or author example](https://github.com/sharziki/semdecide). Our workflow is an adaptation,
not that project's code, an automatic installer, or a reproduced benchmark.
[Laya service docs](http://172.27.116.56:8000/docs).
