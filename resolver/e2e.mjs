// End-to-end: the four-call quickstart over real HTTP.
import { createServer } from "./server.mjs";
const { app } = await createServer();
const srv = app.listen(0);
const port = srv.address().port;
const base = `http://localhost:${port}`;
const get = async (p) => (await fetch(base + p)).json();

let fail = 0;
const t = (n, c) => { console.log(`  ${c ? "ok  " : "FAIL"} ${n}`); if (!c) fail++; };

console.log("The four-call quickstart:");
// 1. resolve
const r = await get(`/resolve?registry=asset.register&external_id=TB-WH-01`);
t("resolve(registry,id) -> 4did", r.id && r.id.startsWith("4did:h3:"));
const id = r.id;

// 2. context
const ctx = await get(`/entity/${encodeURIComponent(id)}/context`);
t("context(4did) -> class + labels", ctx.id === id && Array.isArray(ctx.labels));
t("context bounded (< 16KB)", JSON.stringify(ctx).length < 16384);

// 3. representations
const reps = await get(`/entity/${encodeURIComponent(id)}/representations?purpose=rendering`);
t("get_representations -> ranked list", Array.isArray(reps) && reps[0].kind === "tileset");

// 4. watch
const w = await get(`/watch?cells=${encodeURIComponent(r.locator)}&since=0`);
t("watch -> changes", Array.isArray(w));

console.log("Other operations:");
const snap = await get(`/snapshot`);
t("snapshot", snap.snapshot_id.startsWith("snap:"));
const ent = await get(`/entity/${encodeURIComponent(id)}`);
t("get_entity", ent.id === id);
const st = await get(`/entity/${encodeURIComponent(id)}/state`);
t("get_state pose", Array.isArray(st.pose.position));
const missing = await (await fetch(base + `/resolve?registry=x&external_id=none`)).status;
t("resolve miss -> 404", missing === 404);

srv.close();
console.log(`\n${fail === 0 ? "PASS" : "FAIL"}: ${fail} problem(s).`);
process.exit(fail ? 1 : 0);
