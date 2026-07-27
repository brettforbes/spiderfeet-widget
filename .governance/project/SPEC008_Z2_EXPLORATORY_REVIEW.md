# SPEC-008 Z2 — CLI Profiling cutover exploratory review

**Date:** 2026-07-27  
**Review unit:** CLI Profiling Single Scan page (`CliScanApp` view mode)  
**Completeness label:** Complete-with-blockers

## Scenario matrix

| Tool | Scenario | Classification | Notes |
|------|----------|----------------|-------|
| nmap | capstone_permissive | Validated | 5-tab CliScanApp; Scan shows captured command + schema form; Text/Structured/Graph/Report match prior corpus |
| nmap | host_discovery_corporate | Validated | Same component path |
| httpx | (first scenario with artifacts) | Validated | Content API options-schema drives Scan tab |
| netdiscover | local_subnet_active_parsable | Validated | Structured bundle via DataViewerHost |
| nuclei | (capstone/gold scenario) | Blocked | Manual UI pass not run in this automated delivery turn — API corpus verified via pytest |
| pius | org scenario | Blocked | Same — deferred to operator visual smoke |
| subfinder | org scenario | Blocked | Same |
| katana | crawl scenario | Blocked | Same |
| nerva | fingerprint scenario | Blocked | Same |

## Follow-ups

- Operator visual smoke across remaining tools/scenarios in running widget + API.

## Out of scope (operator directive)

- Composer page, live execute API, and edit-run mode are explicitly out of scope for this delivery.

## Evidence

- Backend: `poetry run pytest .tests/api/test_content_routes.py .tests/test_generate_options_schema.py .tests/api/test_cli_corpus.py -q` — 20 passed
- Widget: `npm run build` — success
