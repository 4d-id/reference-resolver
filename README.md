# 4D-ID Reference Resolver

The reference implementation of the [4D-ID specification](https://github.com/4d-id/spec): a resolver you can run in an afternoon.

[![test](https://github.com/4d-id/reference-resolver/actions/workflows/test.yml/badge.svg)](https://github.com/4d-id/reference-resolver/actions)
[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

⚙️ **Runtime:** Node 22, ES modules. No native build required by default.
🗄️ **Storage:** pure-JS in-memory (default) or SQLite (`STORE=sqlite`).
🌐 **Bindings:** REST today (matches `openapi/openapi.yaml`); MCP to follow.

This resolver exists to prove the spec is buildable, to act as a conformance oracle, and to give you something to run behind the four-call quickstart. It is a reference, not a production service: single process, single store, no auth. The production shape (PostGIS, stateless behind the Part 4 architecture) is a separate build.

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
curl "localhost:4141/entity/<4did>/representations?purpose=rendering"
# changes since a generation
curl "localhost:4141/watch?cells=<zone>&since=0"
```

`resolve` is a **lookup**, not a mint: it finds an identity that was already registered. To create identities, `POST /ingest` (blocked in read-only deployments), or try the [live demos](https://x4d-id.exe.xyz/) which mint client-side.

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `4141` | HTTP listen port |
| `STORE` | `memory` | `memory` (no persistence, no native build) or `sqlite` |
| `DB_PATH` | `4did.db` | SQLite file when `STORE=sqlite` |
| `SEED` | `true` | load the sample facility on start |

## Test

```bash
npm test    # schema validation + resolver smoke + HTTP end-to-end + conformance
```

The conformance run reports how many of the specification's tests pass. Fifteen execute at schema level today; the rest are functional tests that fill in as the resolver gains propagation, security, and domain behaviour. See the [conformance manifest](conformance/manifest.json).

## What it implements

`core`, `fabric` (zones, home register, resolution), `lifecycle` basics, and the `scale` subset for snapshots and list-then-watch, over the Clause 10 access operations. Identifier parse and mint, H3 anchoring, generation counters, and the context envelope are all here.

## License

Apache-2.0. See [LICENSE](LICENSE). Built on the [4D-ID specification](https://github.com/4d-id/spec), which is intended to be royalty-free.
