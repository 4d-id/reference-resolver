// Direct core test before wiring HTTP.
import { Resolver, parse4did, mint4did, zoneOf } from "./core.mjs";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const here = dirname(fileURLToPath(import.meta.url));
const sample = JSON.parse(readFileSync(join(here, "..", "samples", "facility", "entities.json"), "utf8"));

let fail = 0;
const t = (name, cond) => { console.log(`  ${cond ? "ok  " : "FAIL"} ${name}`); if (!cond) fail++; };

console.log("parse:");
const p = parse4did("4did:h3:8a2830828a37fff;v=floor.12.b7:AZmR3kB8dH2qT7vLxN1pWg");
t("variant h3", p.variant === "h3");
t("cell", p.cell === "8a2830828a37fff");
t("vref floor", p.vref === "floor.12.b7");
const pv = parse4did("4did:oct:ROOTdesc0000000000000000.0123:Vx2Pq9Lm3Nt8Ka5Rb7Yc1D");
t("virtual domain parsed", pv.domain === "ROOTdesc0000000000000000" && pv.cell === "0123");

console.log("mint:");
const m = mint4did("h3", "8a2830828a37fff");
t("minted valid", /^4did:h3:8a2830828a37fff:[A-Za-z0-9_-]{22,86}$/.test(m));

console.log("ingest + operations:");
const R = new Resolver();
for (const s of sample.states) R.putState(s);
const bld = sample.states[0].id, agv = sample.states[1].id;

const r = R.resolve({ registry: "asset.register", external_id: "TB-WH-01" });
t("resolve by external id", r && r.id === bld);
t("resolve carries snapshot", r && r.snapshot_id.startsWith("snap:"));

const ent = R.get_entity(agv);
t("get_entity id", ent.id === agv);
t("get_entity labels or relations", Array.isArray(ent.relations));

const st = R.get_state(agv);
t("get_state pose", Array.isArray(st.pose.position));

const reps = R.get_representations(bld, { purpose: "rendering" });
t("get_representations returns tileset", reps.length === 1 && reps[0].kind === "tileset");

const q = R.query({ cells: [zoneOf(sample.states[1].anchor)] });
t("query by zone finds agv", q.some((s) => s.id === agv));

const snap = R.get_snapshot();
t("snapshot has zones", snap.zones.length >= 1);

const ctx = R.context(bld, { max_bytes: 16384 });
t("context id", ctx.id === bld);
t("context deterministic snapshot", ctx.snapshot_id === snap.snapshot_id);
t("context no geometry beyond hull", !JSON.stringify(ctx).includes("point_cloud"));

// watch: bump the agv and see it appear
const s2 = structuredClone(sample.states[1]); s2.sequence = 48212; s2.pose.position = [13, 0, -3];
const before = R.get_snapshot();
R.putState(s2);
const changes = R.watch({ cells: [zoneOf(s2.anchor)], since: 0 });
t("watch sees change", changes.some((s) => s.id === agv));

// context field selection + byte bound
const small = R.context(bld, { fields: "class,pose", max_bytes: 400 });
t("context field selection keeps id", small.id === bld);

console.log(`\n${fail === 0 ? "PASS" : "FAIL"}: ${fail} problem(s).`);
process.exit(fail ? 1 : 0);
