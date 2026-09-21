---
name: jev-simulation
description: Use for game, NPC, interactive-story or training-simulation decisions from explicit world state and legal actions. Humans or a planner define objectives; a simulator applies actions and verifies outcomes.
---

# Choose actions inside an authored world

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

1. Define the world, objective, legal actions, turn budget and authoritative state. Keep fictional simulation actions separate from real-world tool execution.
2. Let a person or reasoning model supply strategy when needed. Ask Jev only for a bounded local choice using visible state; keep unknown and replan outcomes available.
3. Have the simulator validate and apply the chosen transition. Reject stale decisions and update observations before dependent actions.
4. Replan on completed subgoals, violated assumptions or stalled progress. Log state/action/outcome IDs; stop on turn budget or deadlock.
5. Render text, UI or video from the resulting state as an optional separate consumer. Compare objectives across the same seeds; visual appeal is not decision quality.

## Context and parallelism

Jev does not inherit the agent's history. Give every request sufficient context:
the goal and strategy, world rules, current turn/state, legal actions, resources
and relevant prior outcomes. A move label alone is not enough. Keep uncertainty
explicit; omit unrelated lore and secrets without removing decision-relevant facts.

Batch independent judgments over one world snapshot instead of serial LLM calls.
For independent simulation instances, use bounded concurrency with world/turn IDs,
rate limits and a cost/time budget. The host schedules calls; the CLI has no parallel
scheduler. Questions cannot read other answers in the same request: resolve shared
resource/action conflicts in the simulator and obtain the next state before its
dependent turn. Jev's low latency helps action selection, not world design or video
generation; those remain separate planner/renderer tasks.

## Make it yours

Replace the example's evidence, candidate IDs and criteria together. Preserve a
no-match route when the real task can fall outside the labels. Agree on how the
host or person consumes each answer before enabling any automatic effect.

## Precedent

[Related project or author example](https://x.com/gokayfem/status/2101022590722810271). Our workflow is an adaptation,
not that project's code, an automatic installer, or a reproduced benchmark.
[Laya service docs](http://172.27.116.56:8000/docs).
