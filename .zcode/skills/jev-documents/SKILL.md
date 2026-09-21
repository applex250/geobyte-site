---
name: jev-documents
description: Use for selecting original source spans, reranking supplied passages or checking claims against documents. Keeps citations and no-match outcomes; does not invent missing facts.
---

# Find and verify information in documents

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

1. Read the authorized source and retain document/page/line identifiers. Have parsers or regex produce exact candidate spans when possible.
2. Define the requested role precisely: invoice destination is not any email address. Include none when no candidate fits.
3. Use independent relevance questions when ranking all passages; winning a relative Choice does not establish an answer exists.
4. Copy the original span selected by ID. Do not ask Jev to synthesize the extracted field or fabricate a quotation.
5. Check each claim against its cited evidence separately. Report unsupported/contradicted statements and preserve source links for human checking.

## Context and parallelism

Jev does not inherit the agent's history. Give every request sufficient context:
the user's information need, exact claim, source IDs, surrounding passages,
definitions and relevant exceptions. Supply the text, not just a URL or your own
summary verdict. Keep needed cross-references; omit unrelated material and secrets.

Batch independent claim checks or per-passage relevance scores over shared state
instead of serial LLM calls. For separate document groups, use bounded concurrency
with stable document/question IDs, rate limits and a cost/time budget. The host
schedules calls; the CLI has no parallel scheduler. Questions cannot read other
answers in the same request: fetch a selected source before asking about unseen
contents. Use Jev's low latency for repeated judgments, not document generation.

## Make it yours

Replace the example's evidence, candidate IDs and criteria together. Preserve a
no-match route when the real task can fall outside the labels. Agree on how the
host or person consumes each answer before enabling any automatic effect.

## Precedent

[Related project or author example](https://github.com/jkudish/jev-mcp). Our workflow is an adaptation,
not that project's code, an automatic installer, or a reproduced benchmark.
[Laya service docs](http://172.27.116.56:8000/docs).
