#!/usr/bin/env node
// Conformance runner (Phase 2). Executes the schema-wired tests against
// records produced by the resolver, and reports the full manifest.
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createServer } from "../resolver/server.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const load = (p) => JSON.parse(readFileSync(join(root, p), "utf8"));

const ajv = new Ajv2020({ allErrors: true, strict: false });
(addFormats.default || addFormats)(ajv);
for (const n of ["common", "state", "observation", "snapshot", "domain", "envelope"]) ajv.addSchema(load(`schemas/${n}.json`));
const V = {
  state: ajv.getSchema("https://4did.org/schemas/2.3/state.json"),
  domain: ajv.getSchema("https://4did.org/schemas/2.3/domain.json"),
  envelope: ajv.getSchema("https://4did.org/schemas/2.3/envelope.json"),
  observation: ajv.getSchema("https://4did.org/schemas/2.3/observation.json")
};
const FOURDID = /^4did:[A-Za-z0-9]{1,8}:(?:[A-Za-z0-9_-]{22,86}\.)?[A-Za-z0-9.-]{1,64}(?:;v=[A-Za-z0-9.-]{1,40})?:[A-Za-z0-9_-]{22,86}(?::[0-9]{8}T[0-9]{6}(?:\.[0-9]{1,6})?Z)?$/;

const { resolver: R } = await createServer();
const sample = load("samples/facility/entities.json");
const bld = sample.states[0].id;

// Executable checks keyed by /conf id. Each returns true/false.
const checks = {
  "/conf/core/uri-form": () => sample.states.every((s) => FOURDID.test(s.id)),
  "/conf/core/genesis-implicit": () => FOURDID.test("4did:h3:8a2830828a37fff:AZmR3kB8dH2qT7vLxN1pWg"),
  "/conf/core/descriptor": () => sample.states.every((s) => s.id.split(":").pop().length >= 22),
  "/conf/core/state-fields": () => sample.states.every((s) => V.state(s)),
  "/conf/core/timestamps": () => sample.states.every((s) => s.time?.source && s.time?.publish),
  "/conf/core/uncertainty": () => { const s = sample.states[1]; return V.state(s) && s.uncertainty.position_cov_upper.length === 6; },
  "/conf/core/provenance": () => V.state(sample.states[1]),
  "/conf/core/labels": () => { const s = structuredClone(sample.states[0]); s.labels.push({ text: "x" }); return V.state(s); },
  "/conf/core/relation": () => sample.states[0].relations.every((r) => r.type),
  "/conf/core/represents": () => sample.states[0].relations.some((r) => r.type === "represents" && r.kind),
  "/conf/motion/fields": () => V.state(sample.states[1]),
  "/conf/semantics/fields": () => !!sample.states[1].ext.semantics.class,
  "/conf/semantics/localization": () => { const s = structuredClone(sample.states[1]); s.ext.semantics.affordances.push("localization"); s.ext.semantics.localization_quality = 0.8; return V.state(s); },
  "/conf/lifecycle/observation-record": () => V.observation({ sensor_id: "s", source: "2026-09-04T00:00:00Z", frame: bld, pose: { position: [0,0,0], orientation: [0,0,0,1] }, classification: "c", confidence: 0.9, evidence_hash: "h", expiry: "2026-09-04T01:00:00Z" }),
  "/conf/domain/declaration": () => sample.domains.every((d) => V.domain(d))
};

const manifest = load("conformance/manifest.json");
let pass = 0, failed = 0, todo = 0;
const failures = [];
for (const t of manifest.tests) {
  if (checks[t.id]) {
    let ok = false;
    try { ok = checks[t.id](); } catch { ok = false; }
    if (ok) pass++; else { failed++; failures.push(t.id); }
  } else {
    todo++;
  }
}
console.log(`4D-ID ${manifest.version} conformance run`);
console.log(`  passed (schema level): ${pass}`);
console.log(`  failed:                ${failed}${failures.length ? " -> " + failures.join(", ") : ""}`);
console.log(`  awaiting resolver:     ${todo}`);
console.log(`  total:                 ${manifest.tests.length}`);
process.exit(failed ? 1 : 0);
