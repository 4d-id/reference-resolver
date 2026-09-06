// HTTP binding of the resolver (Phase 2). Routes match openapi/openapi.yaml.
import express from "express";
import { Resolver } from "./core.mjs";
import { makeStore } from "./store.mjs";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

export async function createServer({ seed = true, store } = {}) {
  const here = dirname(fileURLToPath(import.meta.url));
  const R = new Resolver(store || (await makeStore()));
  if (seed) {
    const sample = JSON.parse(readFileSync(join(here, "..", "samples", "facility", "entities.json"), "utf8"));
    for (const s of sample.states) R.putState(s);
  }
  const app = express();
  app.use(express.json());
  const send = (res, v) => (v == null ? res.status(404).json({ error: "not found" }) : res.json(v));

  app.get("/resolve", (req, res) => send(res, R.resolve({ registry: req.query.registry, external_id: req.query.external_id, id: req.query.id })));
  app.get("/entity/:id", (req, res) => send(res, R.get_entity(req.params.id)));
  app.get("/entity/:id/state", (req, res) => send(res, R.get_state(req.params.id, { at: req.query.at })));
  app.get("/entity/:id/relations", (req, res) => send(res, R.get_relations(req.params.id, { type: req.query.type, min_confidence: req.query.min_confidence != null ? Number(req.query.min_confidence) : undefined })));
  app.post("/query", (req, res) => send(res, R.query(req.body || {})));
  app.post("/events", (req, res) => send(res, R.query_events(req.body || {})));
  app.get("/entity/:id/representations", (req, res) => send(res, R.get_representations(req.params.id, { purpose: req.query.purpose })));
  app.get("/snapshot", (_req, res) => send(res, R.get_snapshot()));
  app.post("/list", (req, res) => send(res, R.list(req.body || {})));
  app.get("/watch", (req, res) => send(res, R.watch({ cells: req.query.cells ? [req.query.cells] : undefined, id: req.query.id, since: req.query.since })));
  app.get("/entity/:id/context", (req, res) => send(res, R.context(req.params.id, { fields: req.query.fields, max_entities: req.query.max_entities != null ? Number(req.query.max_entities) : undefined, max_bytes: req.query.max_bytes != null ? Number(req.query.max_bytes) : undefined, snapshot_id: req.query.snapshot_id })));
  app.post("/ingest", (req, res) => { try { res.json(R.putState(req.body)); } catch (e) { res.status(400).json({ error: e.message }); } });
  // ---- reconciliation (Part 4, 15.2) ----
  app.post("/reconcile/propose", (req, res) => { try { const { a, b, ...opts } = req.body || {}; res.json(R.proposeMatch(a, b, opts)); } catch (e) { res.status(400).json({ error: e.message }); } });
  app.get("/reconcile/candidates", (_req, res) => res.json(R.listCandidates()));
  app.post("/reconcile/merge", (req, res) => { try { const { a, b, ...opts } = req.body || {}; res.json(R.merge(a, b, opts)); } catch (e) { res.status(400).json({ error: e.message }); } });
  app.post("/reconcile/split", (req, res) => { try { const { id, parts, ...opts } = req.body || {}; res.json(R.split(id, parts, opts)); } catch (e) { res.status(400).json({ error: e.message }); } });
  app.get("/entity/:id/merge-history", (req, res) => res.json(R.mergeHistory(req.params.id)));

  app.get("/health", (_req, res) => res.json({ status: "ok" }));
  app.get("/", (_req, res) => res.json({ service: "4D-ID reference resolver", version: "2.3", store: R.store.constructor.name, zone_resolution: 6 }));
  return { app, resolver: R };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = process.env.PORT || 4141;
  const seed = (process.env.SEED ?? "true") !== "false";
  const { app, resolver } = await createServer({ seed });
  app.listen(port, () => console.log(`4D-ID reference resolver 2.3 on http://localhost:${port} (store=${resolver.store.constructor.name}, seed=${seed})`));
}
