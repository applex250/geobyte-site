---
name: jev-route
description: Use to route a bounded task among available models, tools or specialists using explicit capability descriptions. Returns advice; does not switch a host primary model or install a router.
---

# Choose a tool, model or specialist

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

1. Inventory actual available capabilities, allowed spending and task constraints. Do not infer access from a model name or prestige tier.
2. Describe each candidate by what it can and cannot do. Supply the current subtask and relevant preceding state, not an entire unrelated transcript.
3. Separate selection from invocation. Show a recommendation unless the user already authorized the handoff and the host has an invocation tool.
4. Preserve fallback routes for unavailable, uncertain or failed candidates. A recommendation does not authorize sharing data with another provider.
5. Evaluate routing regret and completed work along with total cost, cache loss and retries. This skill is not the upstream Codex Router service.

## Context and parallelism

Jev does not inherit the agent's history. Give every request sufficient context:
the subtask and goal, relevant prior attempts, data constraints, budget, and real
candidate capability/availability descriptions. Model names alone are not enough;
omit unrelated conversation and secrets, not facts needed to choose a useful route.

Batch independent routing and suitability questions over shared state instead of
serial LLM calls. Route independent queued tasks with bounded concurrency, stable
task/question IDs, rate limits and a cost/time budget. The host schedules calls;
the CLI has no parallel scheduler. Questions cannot read other answers in the same
request: wait for a delegated result before deciding its dependent next route.
Use Jev's low latency for selection; retain a reasoning model for open-ended work.

## Make it yours

Replace the example's evidence, candidate IDs and criteria together. Preserve a
no-match route when the real task can fall outside the labels. Agree on how the
host or person consumes each answer before enabling any automatic effect.

## Precedent

[Related project or author example](https://github.com/0xNatoshi/jev-codex-router). Our workflow is an adaptation,
not that project's code, an automatic installer, or a reproduced benchmark.
[Laya service docs](http://172.27.116.56:8000/docs).
