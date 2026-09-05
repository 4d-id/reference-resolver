#!/usr/bin/env node
// Phase 1 validator: compiles the schema set and validates sample records.
// Usage: node scripts/validate.mjs
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const load = (p) => JSON.parse(readFileSync(join(root, p), "utf8"));

const schemas = ["common", "state", "observation", "snapshot", "domain", "envelope"].map(
  (n) => load(`schemas/${n}.json`)
);

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats.default ? addFormats.default(ajv) : addFormats(ajv);
for (const s of schemas) ajv.addSchema(s, s.$id);

let failures = 0;
const check = (schemaId, data, name) => {
  const validate = ajv.getSchema(schemaId);
  const ok = validate(data);
  if (ok) {
    console.log(`  ok   ${name}`);
  } else {
    failures++;
    console.log(`  FAIL ${name}`);
    for (const e of validate.errors) console.log(`       ${e.instancePath || "/"} ${e.message}`);
  }
};

// 4D-ID canonical grammar check (Part 1, 7.2), independent of the schema pattern.
const FOURDID =
  /^4did:[A-Za-z0-9]{1,8}:(?:[A-Za-z0-9_-]{22,86}\.)?[A-Za-z0-9.-]{1,64}(?:;v=[A-Za-z0-9.-]{1,40})?:[A-Za-z0-9_-]{22,86}(?::[0-9]{8}T[0-9]{6}(?:\.[0-9]{1,6})?Z)?$/;

console.log("4D-ID identifier grammar:");
const ids = [
  ["4did:h3:8928308280fffff:AZmR3kB8dH2qT7vLxN1pWg", true],
  ["4did:h3:8928308280fffff:Q3qP1zV9fT2xLmN8wK5aBg:20260503T141500Z", true],
  ["4did:h3:8928308280fffff;v=floor.12.b7:AZmR3kB8dH2qT7vLxN1pWg", true],
  ["4did:oct:ROOTdesc0000000000000000.0123:Vx2Pq9Lm3Nt8Ka5Rb7Yc1D", true],
  ["not-an-id", false],
  ["4did:h3:cell:tooShort", false]
];
for (const [id, expect] of ids) {
  const got = FOURDID.test(id);
  const ok = got === expect;
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${expect ? "accept" : "reject"} ${id}`);
}

console.log("\nSample records:");
const sample = load("samples/facility/entities.json");
sample.states.forEach((s, i) => check("https://4did.org/schemas/2.3/state.json", s, `state[${i}] ${s.producer}`));
sample.domains.forEach((d, i) => check("https://4did.org/schemas/2.3/domain.json", d, `domain[${i}] ${d.mode}`));

console.log("\nNegative cases (should FAIL to validate):");
const badState = structuredClone(sample.states[0]);
delete badState.time;
const v = ajv.getSchema("https://4did.org/schemas/2.3/state.json");
console.log(`  ${!v(badState) ? "ok  " : "FAIL"} state missing required 'time' is rejected`);
const badDomain = { id: sample.domains[0].id, grid: "oct", mode: "scenario", extent_policy: "fixed", time_mapping: { rate: 0 }, authority: "x" };
console.log(`  ${!v && true, !ajv.getSchema("https://4did.org/schemas/2.3/domain.json")(badDomain) ? "ok  " : "FAIL"} scenario domain without derived_from is rejected`);

console.log(`\n${failures === 0 ? "PASS" : "FAIL"}: ${failures} problem(s).`);
process.exit(failures === 0 ? 0 : 1);
