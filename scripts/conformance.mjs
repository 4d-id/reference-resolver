#!/usr/bin/env node
// Phase 1 conformance status report against the manifest.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const here = dirname(fileURLToPath(import.meta.url));
const m = JSON.parse(readFileSync(join(here, "..", "conformance", "manifest.json"), "utf8"));
const by = { schema: 0, todo: 0 };
for (const t of m.tests) by[t.status] = (by[t.status] || 0) + 1;
console.log(`4D-ID ${m.version} conformance manifest: ${m.tests.length} tests`);
console.log(`  wired at schema level (Phase 1): ${by.schema}`);
console.log(`  awaiting reference resolver:      ${by.todo}`);
