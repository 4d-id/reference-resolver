import assert from "node:assert/strict";
import { Resolver, mint4did, parse4did } from "./core.mjs";
import { MemoryStore } from "./store.mjs";

const r = new Resolver(new MemoryStore());
const root = "4did:h3:8000000000000ff:AAAAAAAAAAAAAAAAAAAAAA:20260101T000000Z";
const cell = "8c2a100d2d0dbff";
const frameRoot = mint4did("h3", cell);
const now = () => new Date().toISOString();
const state = (id, registry, external_id) => ({
  id, parent: root,
  anchor: { variant: "h3", cell, resolution: 12 },
  pose: { position: [0, 0, 0], orientation: [0, 0, 0, 1] },
  time: { source: now(), publish: now() }, sequence: 1, producer: "test",
  validity_s: 60, status: "active", motion_mode: "static",
  relations: [{ type: "identified_as", registry, external_id }]
});

function without(object, keys) {
  const copy = structuredClone(object);
  for (const key of keys) delete copy[key];
  return copy;
}

const privateId = mint4did("id", "6c986e8b29c144bb9c5701c8e9cf1564");
const parsed = parse4did(privateId);
assert.equal(parsed.variant, "id");
assert.equal(parsed.cell, "6c986e8b29c144bb9c5701c8e9cf1564");
assert.equal(parsed.genesis, null, "privacy mode omits a timestamp-bearing genesis marker");
assert.throws(() => mint4did("id", "6c986e8b29c144bb9c5701c8e9cf1564", { vref: "floor.12" }), /does not permit/);
assert.throws(() => mint4did("id", "demo-home"), /128-bit/);

const registrationOnly = without(state(privateId, "privacy.profile", "P-1"), ["pose", "anchor"]);
registrationOnly.registrations = [{
  frame: frameRoot,
  tier: "logical",
  confidence: 0.8,
  valid_from: "2026-11-03T00:00:00Z",
  valid_to: "2026-12-31T00:00:00Z",
  status: "accepted",
  provenance: { producer: "external:fixture", method: "manual", registered: "2026-11-03T00:00:00Z", evidence_refs: ["evidence:registration"] }
}];
r.putState(registrationOnly);
assert.equal(r.get_state(privateId).registrations[0].status, "accepted");
assert.equal(r.resolve({ registry: "privacy.profile", external_id: "P-1" }).id, privateId);

const spatialId = mint4did("h3", cell);
assert.match(parse4did(spatialId).genesis, /^\d{8}T\d{6}Z$/, "spatial UUIDv4 mint includes explicit genesis");
r.putState(state(spatialId, "asset.tag", "A-1"));

const duplicate = mint4did("h3", cell);
assert.throws(() => r.putState(state(duplicate, "asset.tag", "A-1")), /external identifier conflict/);

const other = mint4did("h3", cell);
r.putState(state(other, "vision.track", "V-9"));
assert.throws(() => r.proposeMatch(spatialId, other, { confidence: 0.9 }), /external evidence/);
const candidate = r.proposeMatch(spatialId, other, {
  confidence: 0.9, by: "external:test", method: "reviewed-crosswalk", evidence: ["evidence:fixture"]
});
assert.ok(candidate.candidate_id);
assert.equal(r.listCandidates({ limit: 1 }).length, 1);
assert.throws(() => r.merge(spatialId, other, { authority: "ops:declared", candidate_id: "candidate:missing" }), /current candidate/);
const merged = r.merge(spatialId, other, { authority: "ops:declared", candidate_id: candidate.candidate_id });
assert.ok(merged.decision_id);
assert.equal(r.resolve({ registry: "vision.track", external_id: "V-9" }).id, merged.survivor);
assert.equal(r.mergeHistory(merged.survivor)[0].candidate_id, candidate.candidate_id);

console.log("PASS: identity, privacy-mode, resolve-first, and bounded-decision checks");
