---
name: jev-setup
description: Verify the local campus Laya decision service — the only route in this L-only build. Keyless and free; reports endpoint facts, checks connectivity, documents the LAYA_URL override. No provider choice and no simulation mode exist.
---

# Set up the Laya route

This build has exactly one decision route: the local Laya service on the
campus network (http://172.27.116.56:8000). It needs no API key, costs
nothing, and data stays inside the campus network. There is no provider
choice and no simulation mode; nothing here switches models or endpoints.

## What setup means here

1. Run `python3 <jev-skill-dir>/scripts/jev.py setup` — a read-only report
   of the endpoint, variants and auto routing. It makes no network call and
   changes no configuration.
2. Optionally confirm the service is alive:
   `curl http://172.27.116.56:8000/health` (expect `{"status": "ok", ...}`).
3. If the endpoint differs in your environment, set `LAYA_URL` before running
   `decide`/`classify`. Let the user set it in their host; do not edit shell
   profiles.

## Smoke test

```bash
python3 <jev-skill-dir>/scripts/jev.py decide <jev-skill-dir>/assets/checkpoint.json --dry-run
# Real call (campus network, no key, no cost):
python3 <jev-skill-dir>/scripts/jev.py decide <jev-skill-dir>/assets/checkpoint.json
```

Exit codes: `0` selected/scored, `2` at least one question needs review,
`1` error. A connection failure means the service or network is down —
report it; never substitute another model or endpoint. Decisions are
advisory, never permission to act.

The CLI auto-picks the Laya variant per request (classification →
`english`/`multilingual` by detected language, `score` → `typed-decisions`);
force one with `--model`. See the
[Laya adapter notes](../jev/references/laya.md) for the endpoint, variants,
auto routing and calibration limits.
