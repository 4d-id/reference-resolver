# Changelog

## 0.4.0 — September 2026
- Cross-observer identity reconciliation (Part 4, §15.2): `proposeMatch`, authority-attributed `merge` with merge-redirect `resolve`, `split`, and `mergeHistory`.
- Genesis markers: `mint4did(..., {genesis})` and `genesisMarker()` make survivor selection deterministic; UUIDv7 timestamp is the fallback.
- New endpoints: `POST /reconcile/propose`, `GET /reconcile/candidates`, `POST /reconcile/merge`, `POST /reconcile/split`, `GET /entity/:id/merge-history`. `resolve` now returns `redirected_from` when following a merge.
- Conformance: 15 schema-level checks pass. Functional merge, split, and reconciliation coverage is present; broader functional conformance work continues.

Implements 4D-ID specification 2.3 plus the proposed reconciliation lifecycle extension tracked for the next working draft.

## 0.3.0 — September 2026
- Pluggable storage: pure-JS in-memory store by default (no native build), optional SQLite via `STORE=sqlite`, graceful fallback.
- Clause 10 access operations over HTTP; MCP binding to follow.
- Conformance runner executes schema-level tests against resolver output (15 of the spec's tests today; the rest fill in as functional behaviour lands).

Implements 4D-ID specification 2.3.
