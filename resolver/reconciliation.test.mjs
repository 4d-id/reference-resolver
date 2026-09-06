// The reconciliation demo as a test: two independent systems mint the same forklift,
// then A ≡ B with provenance, confidence, merge, history, surviving references, and
// authoritative resolution. This is the reviewer's "more important" test.
import { Resolver, mint4did, genesisMarker } from "./core.mjs";
import { MemoryStore } from "./store.mjs";

const r = new Resolver(new MemoryStore());
let fail = 0; const t = (n, c) => { console.log(`  ${c ? "ok  " : "FAIL"} ${n}`); if (!c) fail++; };
const now = () => new Date().toISOString();

// Robot A sees a forklift in a warehouse zone and mints ID A
const cell = "8c2a100d2d0dbff";
const gA = genesisMarker(new Date(Date.now()-60000)); // A minted a minute earlier
const idA = mint4did("h3", cell, { genesis: gA });
r.putState({ id: idA, anchor:{variant:"h3",cell,resolution:12}, pose:{position:[10,2,0]},
  time:{source:now(),publish:now()}, sequence:1, producer:"robot:A",
  status:"active", motion_mode:"physical",
  relations:[{type:"identified_as",registry:"asset.tag",external_id:"FORKLIFT-42"}],
  provenance:{sensor:"robotA:lidar", confidence:0.9} });

// Vision system B independently sees the same forklift and mints ID B (a bit later)
const gB = genesisMarker(new Date()); // B minted now
const idB = mint4did("h3", cell, { genesis: gB });
r.putState({ id: idB, anchor:{variant:"h3",cell,resolution:12}, pose:{position:[10.1,2.0,0]},
  time:{source:now(),publish:now()}, sequence:1, producer:"vision:B",
  status:"active", motion_mode:"physical",
  relations:[{type:"identified_as",registry:"asset.tag",external_id:"FORKLIFT-42"}],
  provenance:{sensor:"cameraB:cnn", confidence:0.82} });

t("two independent identities exist", !!r.get_entity(idA) && !!r.get_entity(idB) && idA !== idB);

// A matcher proposes A ≡ B with confidence + provenance (automation proposes)
const cand = r.proposeMatch(idA, idB, { confidence:0.94, by:"reconciler:spatial", method:"iou+class+tag", evidence:["same asset.tag","0.1m apart","class=forklift"] });
t("candidate carries confidence", cand.confidence === 0.94);
t("candidate carries provenance", cand.by === "reconciler:spatial" && cand.evidence.length === 3);
t("candidate is listed", r.listCandidates().length === 1);

// Authority promotes the candidate to a merge (authority promotes, not automation)
let threw=false; try { r.merge(idA, idB, {}); } catch { threw=true; }
t("merge without authority is rejected", threw);

const res = r.merge(idA, idB, { authority:"warehouse-ops:signed", reason:"same forklift" });
t("survivor is the earlier genesis", res.survivor === idA && res.merged === idB);

// Surviving references: resolving the LOSER's id redirects to the survivor
const viaLoser = r.resolve({ id: idB });
t("resolving the merged id redirects to survivor", viaLoser.id === idA && viaLoser.redirected_from === idB);

// Resolving by the shared external id lands on the survivor
const viaTag = r.resolve({ registry:"asset.tag", external_id:"FORKLIFT-42" });
t("external-id resolves to the survivor", viaTag.id === idA);

// Merge history is preserved with authority + derivation
const hist = r.mergeHistory(idA);
t("merge history recorded with authority", hist.some(h => h.kind==="merge" && h.survivor===idA && h.merged===idB && h.authority==="warehouse-ops:signed"));
const survivorState = r._state(idA);
t("survivor keeps a derivation link to the merged id", survivorState.relations.some(rel => rel.type==="derived_from" && rel.target===idB));
t("survivor carries merge authority in provenance", survivorState.provenance.merge_authority==="warehouse-ops:signed");

// Move the forklift: survivor updates its pose; identity unchanged
r.putState(Object.assign({}, survivorState, { pose:{position:[25,2,0]}, sequence:(survivorState.sequence||1)+1, time:{source:now(),publish:now()} }));
const moved = r.resolve({ registry:"asset.tag", external_id:"FORKLIFT-42" });
t("after moving, same identity still resolves", moved.id === idA);

// Split: the merged forklift turns out to be a forklift + a detached pallet
const sp = r.split(idA, [{label:"forklift body", vref:"body"},{label:"pallet", vref:"pallet"}], { authority:"warehouse-ops:signed" });
t("split produces two derived identities", sp.into.length===2 && sp.into.every(id=>r._state(id).relations.some(rel=>rel.type==="derived_from"&&rel.target===idA)));
t("split recorded in history", r.mergeHistory(idA).some(h=>h.kind==="split"&&h.from===idA));

console.log(`\n${fail?"FAIL":"PASS"}: ${fail} problem(s).`); process.exit(fail?1:0);
