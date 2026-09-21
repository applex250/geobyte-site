# Laya adapter notes

This installation of `jev-skill` is **adapted**: the default provider is the
local Laya decision service instead of OpenRouter/TypeSafe Jev.

- **Provenance:** adapted from `wuyoscar/jev-skill` **v0.2.0** (commit
  `82c0105`, tag verified) on 2026-09-21, then reworked to an **L-only**
  build: OpenRouter/TypeSafe routes and the simulation mode are removed; the
  campus Laya service is the only destination.
- **Service:** `http://172.27.116.56:8000` — campus LAN only, HTTP, no API key
  (the server's optional key is not enabled). Swagger docs: `/docs`, health:
  `/health`. Override the endpoint with the `LAYA_URL` environment variable.

## What the CLI changes

| Aspect | Upstream (Jev) | This install (Laya) |
|---|---|---|
| Routes | OpenRouter / TypeSafe | campus Laya only (keyless, free) |
| Endpoint | `openrouter.ai/api/alpha/decisions` / `api.typesafe.ai/v1/systemone` | `http://172.27.116.56:8000/v1/predict` |
| Auth | `OPENROUTER_API_KEY` / `TYPESAFE_API_KEY` | none |
| Model choice | default `typesafe/jev-1.13` | auto-routes per the decision table below; `--model` overrides |
| Response shape | `answers` at top level | wrapped in `result` (unwrapped by the script) |
| Batch | one request per invocation | `state` may be a list (≤200 records); report gains `items` |
| Report labels | `mode: jev_api`, `jev_called: true` | `mode: laya_api`, `laya_called: true`, `backend: laya-rl-agent` |

Request JSON is the native `state`/`questions` format unchanged: every question
still needs `instructions`; `choice` criteria stay a label→description object,
`score` criteria stay an ordered list. Bundled example assets keep their
OpenRouter model IDs — such requests auto-route per the decision table below
(`--model english|multilingual|typed-decisions` to force one variant).

## Variant selection (benchmarked decision table)

The CLI applies this table **automatically** — model resolution defaults to
`auto`; an explicit `--model` or a Laya variant name in the request overrides
it. Benchmarked 2026-09-21 across the three resident variants:

| | `english` | `multilingual` | `typed-decisions` |
|---|---|---|---|
| Strength | English general purpose, calibrated confidence | Chinese / multilingual classification | Numeric score calibration |
| English classification | 5/6 ✓ | 5/6 ✓ | 5/6 ✓ |
| Chinese classification | not recommended (English-only official) | 5/6 ✓ | 4/6 (slightly worse) |
| `urgency` score shape | squeezed mid-range (0.5–1.9) | all high (1.4–1.9) ⚠ | clean 3-band separation (≈0.6 / 1.2 / 1.8) ✓ |
| `choice` confidence | 0.46–0.86, safe for absolute thresholds | 0.69–1.00, high but usable | 0.04–0.34, relative only |
| Latency | 8 ms | 6.3 ms | 8 ms |

Auto-routing rules (implemented in `scripts/jev.py`):

- `choice` / `noul` questions only → `english` when the `state` text is
  predominantly English, otherwise `multilingual`.
- Any `score` question → `typed-decisions`; its three-band separation makes
  fixed thresholds work: score > 1.4 → critical, 0.9–1.4 → soon, < 0.9 →
  not urgent.
- Mixed requests (classification + scoring) are split into two Laya calls,
  one per model, and the answers merged into one report; the report's
  `routing` object records strategy, detected language, requests and models.

### GLM-5.3 verification (2026-09-21, 12 labeled tickets: 6 zh + 6 en)

Independent verification with a model-authored ground-truth set (choice
category / score urgency / noul deadline per ticket):

| Metric | english | multilingual | typed-decisions | **auto-routing** |
|---|---|---|---|---|
| zh classification | 4/6 | **6/6** | 5/6 | **6/6** |
| en classification | **5/6** | 4/6 | **5/6** | **5/6** |
| deadline (noul) | 10/12 | 9/12 | 7/12 | **11/12** |
| urgency band accuracy | 5/12 | 4/12 | 5/12 | 5/12 |
| urgency MAE | 0.75 | 0.93 | **0.73** | **0.73** |

- Auto-routing is **strictly optimal** on classification (11/12, every single
  variant caps at 10/12) and on noul (11/12; the per-language split beats any
  single variant). The one classification miss returned `needs_review`, so
  correct-or-flagged coverage was 12/12.
- Urgency: `typed-decisions` stays the right route (best MAE, tied band
  accuracy), but absolute band accuracy is weak for **all** variants on
  boundary-heavy items — consume urgency as relative ordering, or recalibrate
  the 0.9/1.4 thresholds on real workload data before gating actions on them.
  Observed biases: "completely unusable" tickets over-rate to critical in both
  languages; English same-day deadlines under-rate (~1.1) while Chinese ones
  land correctly (~1.6).

Operational notes:

- `multilingual` scores run high: use its urgency for **relative ordering**
  only — absolute thresholds are what the typed-decisions split is for.
- `typed-decisions` choice confidence is low (0.04–0.34): recalibrate any
  low-confidence-to-human rule on your own data before relying on it there.
- For a mixed-language **batch**, language is detected per request (dominant
  text); force `--model multilingual` for batches that truly mix languages.
- Three variants are resident in VRAM; switching by name costs nothing.

Observed latency: single ≈ 13–31 ms, batch ≈ 2–7.5 ms per record, 10
concurrent singles ≈ 0.22 s server-side.

## Calibration caveats

- Probabilities come from `laya-rl-agent`, **not** TypeSafe Jev; they have not
  been calibrated to Jev's published bands. Keep the review thresholds
  (`--min-probability 0.8 --min-margin 0.15`) as guardrails and treat
  `needs_review` as an abstention.
- Spot check: `multilingual` judged a benign classroom-inquiry message as
  technical 0.68 / urgency 1.72, but with confidence 0.10 — low provider
  `confidence` correlates with wrong calls. Surface uncertain cases instead of
  auto-acting on them.
- A `noul` question type is advertised by the service; if its answer shape ever
  fails `build_report`, inspect the raw `response` field in the report before
  filing it as an error.

## Honesty rules carried over

Laya output must not be presented as "Jev" or as carrying Jev's calibration.
The report says `laya_api` / `laya_called: true` / `backend` for exactly this
reason. Selection is never permission to act; host permissions and
deterministic checks still apply.
