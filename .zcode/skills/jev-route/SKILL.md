---
name: jev-route
description: Use to route a bounded task among available models, tools or specialists using explicit capability descriptions. Returns advice; does not switch a host primary model or install a router.
---

# Choose a tool, model or specialist

## Setup: choose the service or simulation

This install is adapted to call the local Laya decision service by default:
http://172.27.116.56:8000 (campus network, no API key, no cost). OpenRouter and
TypeSafe remain available via `--provider`; never print credentials. Do not
silently change destination, send data, create an account or switch the host model.

If no route has been chosen, explain the available routes and ask:

> **L — Local Laya (default, already configured):** keyless campus service,
> no cost. The CLI auto-picks the variant per request (classification →
> `english`/`multilingual` by language, `score` → `typed-decisions`); force
> one with `--model`.
> **A — Real Jev:** use/get an OpenRouter key at https://openrouter.ai/settings/keys
> or a TypeSafe key at https://console.typesafe.ai. Configure it locally, not in chat.
> **B — Simulate:** use the current agent, or an explicitly selected available
> model such as DeepSeek, with the same context, questions and criteria.

**Wait for an explicit choice.** Do not ask again for every record in the same
approved task. API errors do not authorize switching providers or simulation.
Missing both keys is not a dead end: offer B. It requires no Jev key but the
chosen agent/model's ordinary access, usage costs and privacy terms still apply.
Do not assume DeepSeek is installed, free or locally hosted.

In B, return `mode: agent_simulation` for the current host or
`mode: model_simulation` for another explicitly approved model, plus its actual
model identity when available and `jev_called: false`. Each question has `value`,
`needs_review`, a brief evidence-based `reason`, `probability: null` and
`confidence: null`. Choice values must be supplied labels, Noul values booleans,
and Score values integer rubric indices. Use null/review for missing evidence.
Never present this as Jev, calibrated probability or equivalent speed/accuracy.
Skip Jev CLI/API steps in B; use the approved model's existing interface and do
not install a substitute or send data elsewhere without consent.

L needs no key or selection: the adapted CLI defaults to `--provider laya`
(http://172.27.116.56:8000/v1/predict); unresolved model IDs auto-route per
the benchmarked decision table (classification by language, scores to
`typed-decisions`). In A, select the destination
explicitly: `--provider openrouter` or `--provider typesafe`. The latter uses
`TYPESAFE_API_KEY` and maps the bundled OpenRouter model ID to `jev-1.13.0`.
`--dry-run` only validates; it neither classifies nor makes a network call.
`setup` reports presence only, not key validity, credits or permission. For guided setup and a copyable
DeepSeek prompt, use `jev-setup` or the [setup guide](https://github.com/wuyoscar/jev-skill/blob/main/skills/jev-setup/SKILL.md).

## Jev API prerequisite and first example

In decision-API mode, this adapted install runs the shared script from the
sibling `jev` skill folder directly (Python 3.10+), defaulting to the local
keyless Laya provider. For OpenRouter or TypeSafe the process must inherit
`OPENROUTER_API_KEY` or `TYPESAFE_API_KEY`; never place a key in a prompt or
request file.
No sibling skill or third-party integration is required for this judgment.
Actual UI, file, mailbox or simulation actions require the host's own tools.

Resolve `<skill-dir>` to this installed folder. Copy and edit
[assets/example.json](assets/example.json) for the user's task; it is synthetic
input, not a captured successful result. Validate it without a key or API call:

The commands below default to the local keyless Laya service
(http://172.27.116.56:8000, campus network). For OpenRouter or official
TypeSafe, append `--provider openrouter` or `--provider typesafe` to both
validation and live calls.

```bash
python3 <jev-skill-dir>/scripts/jev.py decide <skill-dir>/assets/example.json --dry-run
# After reviewing the input (Laya is the default destination and needs no key):
python3 <jev-skill-dir>/scripts/jev.py decide /path/to/edited-request.json
```

Normal calls send the supplied evidence to the selected provider (Laya stays
inside the campus network at no cost; OpenRouter/TypeSafe incur usage). Read relevant answers, not only the exit code: `0` means selected/scored,
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
[OpenRouter request contract](https://openrouter.ai/docs/api/api-reference/alphadecisions/submit-a-decisions-questions-and-answers-request).
