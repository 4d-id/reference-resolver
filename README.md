# 4D-ID Reference Resolver

The reference implementation of the [4D-ID specification](https://github.com/4d-id/spec): a resolver you can run in an afternoon.

[![test](https://github.com/4d-id/reference-resolver/actions/workflows/test.yml/badge.svg)](https://github.com/4d-id/reference-resolver/actions)
[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

⚙️ **Runtime:** Node 22, ES modules. No native build required by default.
🗄️ **Storage:** pure-JS in-memory (default) or SQLite (`STORE=sqlite`).
🌐 **Bindings:** REST today (matches `openapi/openapi.yaml`); MCP to follow.

4D-ID begins after grounding: this resolver does not perceive, localize, register, or render the world. It stores and resolves caller-supplied identities, grounding, state, and evidence. It is a reference, not a production service: single process, single store, no authentication. Deployment policy is outside this API.

This resolver exists to prove the spec is buildable, to provide a reference target for the current conformance checks, and to give you something to run behind the four-call quickstart. The production shape (PostGIS, stateless behind the Part 4 architecture) is a separate build.

## Install and run

```bash
npm install
npm start            # resolver on http://localhost:4141, seeded with a sample facility
```

Or with Docker:

```bash
docker compose up -d --build
```

The default deploy needs **no C++ toolchain**: it runs on a pure-JavaScript store. Set `STORE=sqlite` for persistence (needs build tools for the SQLite binding).

## The four-call quickstart

```bash
# resolve an external identifier to a 4D-ID
curl "localhost:4141/resolve?registry=asset.register&external_id=TB-WH-01"
# a compact, agent-ready context envelope
curl "localhost:4141/entity/<4did>/context"
# the best representation for a purpose
curl "localhost:4141/entity/<4did>/representations?purpose=agent-context"
# changes since a generation
curl "localhost:4141/watch?cells=<zone>&since=0"
```

`resolve` is a **lookup**, not a mint: it finds an identity already present in resolver records. Grounding and any external identifier mapping are supplied by the caller or deployment; this API does not perform perception or registration. To create identities, `POST /ingest` (blocked in read-only deployments), or try the [live demos](https://4d-id.org/demos.html), which create isolated sandbox records client-side.

## Reconciliation: two systems, one thing

Two systems can hold different identities for the same subject. This resolver implements cross-system identity reconciliation (Part 4, §15.2): an external matcher proposes a match and supplies confidence plus evidence; an authority-attributed operation records it, and deployment policy—not this unauthenticated API—determines whether that authority is authorized. The earlier-genesis identity survives while the other redirects and keeps its derivation. Resolving the redirected id follows the merge to the survivor (`redirected_from`), and shared external identifiers re-point to the survivor.

```bash
curl -X POST localhost:4141/reconcile/propose -H 'content-type: application/json' \
  -d '{"a":"<4did-a>","b":"<4did-b>","confidence":0.94,"by":"external-matcher:v1","method":"tag+proximity+class","evidence":["same asset.tag","0.1m apart"]}'
curl -X POST localhost:4141/reconcile/merge   -H 'content-type: application/json' \
  -d '{"a":"<4did-a>","b":"<4did-b>","authority":"warehouse-ops:authorized"}'
curl "localhost:4141/entity/<4did-a>/merge-history"
```

`POST /reconcile/split` is the inverse: one identity becomes several, each derived from the original. Try the interactive walkthrough at [4d-id.org/reconcile.html](https://4d-id.org/reconcile.html).

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `4141` | HTTP listen port |
| `STORE` | `memory` | `memory` (no persistence, no native build) or `sqlite` |
| `DB_PATH` | `4did.db` | SQLite file when `STORE=sqlite` |
| `SEED` | `true` | load the sample facility on start |

## Test

```bash
npm test    # schema validation + resolver smoke + HTTP end-to-end + conformance + reconciliation
```

The conformance run reports exactly **15 schema-level checks passing** today; functional work continues as propagation, security, and domain behaviour are implemented. See the [conformance manifest](conformance/manifest.json).

## What it implements

`core`, `fabric` (zones, home register, resolution), `lifecycle` basics (including merge/split reconciliation with genesis markers), and the `scale` subset for snapshots and list-then-watch, over the Clause 10 access operations. Identifier parse and mint, H3 anchoring, generation counters, and the context envelope are all here.

## License

Apache-2.0. See [LICENSE](LICENSE). Built on the [4D-ID specification](https://github.com/4d-id/spec), which is intended to be royalty-free.
