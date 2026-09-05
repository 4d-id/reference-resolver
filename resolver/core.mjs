// 4D-ID reference resolver core (Phase 2). Transport- and storage-independent.
// The default store is pure JS (no native build); SQLite is optional (STORE=sqlite).
import { cellToParent, getResolution, isValidCell } from "h3-js";
import { randomUUID } from "node:crypto";
import { MemoryStore, makeStore } from "./store.mjs";

export const FOURDID =
  /^4did:[A-Za-z0-9]{1,8}:(?:[A-Za-z0-9_-]{22,86}\.)?[A-Za-z0-9.-]{1,64}(?:;v=[A-Za-z0-9.-]{1,40})?:[A-Za-z0-9_-]{22,86}(?::[0-9]{8}T[0-9]{6}(?:\.[0-9]{1,6})?Z)?$/;

export function parse4did(id) {
  if (!FOURDID.test(id)) throw new Error(`invalid 4D-ID: ${id}`);
  const body = id.slice(5);
  const variant = body.slice(0, body.indexOf(":"));
  const rest = body.slice(body.indexOf(":") + 1);
  const firstColon = rest.indexOf(":");
  let cellPart = rest.slice(0, firstColon);
  const tail = rest.slice(firstColon + 1);
  let vref = null;
  const vIdx = cellPart.indexOf(";v=");
  if (vIdx !== -1) { vref = cellPart.slice(vIdx + 3); cellPart = cellPart.slice(0, vIdx); }
  let domain = null, cell = cellPart;
  const dot = cellPart.indexOf(".");
  if (variant === "oct" && dot !== -1) { domain = cellPart.slice(0, dot); cell = cellPart.slice(dot + 1); }
  const gm = tail.match(/^(.*?)(?::([0-9]{8}T[0-9]{6}(?:\.[0-9]{1,6})?Z))?$/);
  return { variant, domain, cell, vref, local: gm[1], genesis: gm[2] || null };
}

function mintDescriptor() {
  return Buffer.from(randomUUID().replace(/-/g, ""), "hex").toString("base64url");
}
export function mint4did(variant, cell, { vref = null, domain = null } = {}) {
  const cellPart = domain ? `${domain}.${cell}` : cell;
  return `4did:${variant}:${cellPart}${vref ? `;v=${vref}` : ""}:${mintDescriptor()}`;
}

const ZONE_RES = 6;
export function zoneOf(anchor) {
  if (anchor.variant === "h3" && isValidCell(anchor.cell)) {
    const r = getResolution(anchor.cell);
    return r > ZONE_RES ? cellToParent(anchor.cell, ZONE_RES) : anchor.cell;
  }
  return `${anchor.variant}:${anchor.cell}`.slice(0, 24);
}

export class Resolver {
  constructor(store) { this.store = store || new MemoryStore(); }
  static async create() { return new Resolver(await makeStore()); }

  putState(state) {
    if (!FOURDID.test(state.id)) throw new Error(`invalid id: ${state.id}`);
    const zone = zoneOf(state.anchor);
    const parsed = parse4did(state.id);
    const homeZone = parsed.domain ? `oct:${parsed.domain}` : zone;
    const gen = this.store.bumpZone(zone);
    state.generation = gen;
    this.store.putEntity({
      id: state.id, parent: state.parent ?? null, zone, home_zone: homeZone,
      motion_mode: state.motion_mode ?? null, status: state.status ?? "active",
      layer: state.layer ?? "public", lease: state.lease ?? null,
      state_json: JSON.stringify(state), sequence: state.sequence ?? 0,
      generation: gen, updated: state.time?.publish ?? new Date().toISOString()
    });
    this.store.putRelations(state.id, state.relations ?? []);
    this.store.addHistory({ id: state.id, sequence: state.sequence ?? 0, source: state.time?.source ?? null, state_json: JSON.stringify(state) });
    return { id: state.id, zone, generation: gen };
  }

  _row(id) { return this.store.getEntity(id); }
  _state(id) { const r = this._row(id); return r ? JSON.parse(r.state_json) : null; }

  resolve({ registry, external_id, id }) {
    let target = id;
    if (!target && registry && external_id) target = this.store.srcByExternal(registry, external_id);
    if (!target) return null;
    const e = this._row(target);
    if (!e) return null;
    return { id: e.id, locator: e.zone, snapshot_id: this._snapshotId() };
  }

  get_entity(id) {
    const e = this._row(id); if (!e) return null;
    const s = JSON.parse(e.state_json);
    return { id: e.id, parent: e.parent, motion_mode: e.motion_mode, status: e.status, layer: e.layer, lease: e.lease, labels: s.labels ?? [], relations: this.get_relations(id, {}) };
  }

  get_state(id, { at } = {}) {
    if (at) { const j = this.store.stateAt(id, at); return j ? JSON.parse(j) : null; }
    return this._state(id);
  }

  get_relations(id, { type, min_confidence } = {}) {
    let out = this.store.getRelations(id);
    if (type) out = out.filter((r) => r.type === type);
    if (min_confidence != null) out = out.filter((r) => (r.confidence ?? 1) >= min_confidence);
    return out;
  }

  query({ cells, layer, class: klass }) {
    const set = new Set(cells);
    return this.store.allEntities().map((r) => JSON.parse(r.state_json)).filter((s) => {
      const z = zoneOf(s.anchor);
      const inCells = set.has(z) || set.has(s.anchor.cell) || [...set].some((c) => z.startsWith(c) || s.anchor.cell.startsWith(c));
      if (!inCells) return false;
      if (layer && s.layer !== layer) return false;
      if (klass && s.ext?.semantics?.class !== klass) return false;
      return true;
    });
  }

  query_events({ subject, class: klass }) {
    return this.store.allEntities().map((r) => JSON.parse(r.state_json)).filter((s) => {
      const c = s.ext?.semantics?.class ?? "";
      if (!c.startsWith("event:")) return false;
      if (klass && c !== klass) return false;
      if (subject) {
        const subs = (s.relations ?? []).filter((r) => r.type === "corresponds_to" || r.type === "observed_by").map((r) => r.target);
        if (!subs.includes(subject)) return false;
      }
      return true;
    });
  }

  get_representations(id, { purpose } = {}) {
    const reps = this.get_relations(id, {}).filter((r) => r.type === "represents");
    const rank = (r) => {
      const tier = r.provenance?.tier ?? "logical";
      const tierScore = { metric: 3, navigational: 2, logical: 1 }[tier] ?? 0;
      let boost = 0;
      if (purpose === "measurement" && tier === "metric") boost = 10;
      else if (purpose === "localization" && (r.kind === "mesh" || r.kind === "pointcloud")) boost = 5;
      else if (purpose === "rendering" && (r.kind === "splat" || r.kind === "tileset")) boost = 5;
      else if (purpose === "agent-context") boost = r.kind === "ifc" ? 3 : 1;
      const fresh = r.captured ? Date.parse(r.captured) / 1e13 : 0;
      return tierScore + boost + fresh;
    };
    const superseded = new Set(reps.map((r) => r.supersedes).filter(Boolean));
    return reps.filter((r) => !superseded.has(r.target)).sort((a, b) => rank(b) - rank(a));
  }

  _snapshotId() { return "snap:" + this.store.zones().map((r) => `${r.zone}@${r.generation}`).join(","); }
  get_snapshot() { return { snapshot_id: this._snapshotId(), zones: this.store.zones(), reference_time: new Date().toISOString(), max_skew_s: 1.0, staleness_s: 0 }; }
  list({ cells }) { return this.query({ cells }); }

  watch({ cells, id, since }) {
    if (id) { const e = this._row(id); return e && e.generation > Number(since || 0) ? [JSON.parse(e.state_json)] : []; }
    const set = new Set(cells ?? []);
    return this.store.entitiesGenAbove(Number(since || 0)).map((r) => JSON.parse(r.state_json)).filter((s) => {
      const z = zoneOf(s.anchor);
      return set.size === 0 || set.has(z) || [...set].some((c) => z.startsWith(c));
    });
  }

  context(id, { fields, max_entities = 32, max_bytes = 16384, snapshot_id } = {}) {
    const e = this._row(id); if (!e) return null;
    const s = JSON.parse(e.state_json);
    const rels = this.get_relations(id, {}).sort((a, b) => (b.confidence ?? 1) - (a.confidence ?? 1)).slice(0, max_entities);
    let env = {
      id: e.id, class: s.ext?.semantics?.class, labels: s.labels ?? [], parent: e.parent,
      pose: s.pose, as_of: s.time?.source, snapshot_id: snapshot_id ?? this._snapshotId(),
      uncertainty: s.uncertainty, affordances: s.ext?.semantics?.affordances ?? [], hull: s.ext?.semantics?.hull,
      relations: rels,
      representations: rels.filter((r) => r.type === "represents").map((r) => ({ target: r.target, kind: r.kind, tier: r.provenance?.tier, license: r.license })),
      provenance: s.provenance,
      freshness_s: s.time?.source ? Math.max(0, (Date.now() - Date.parse(s.time.source)) / 1000) : undefined,
      constraints: { disclosure: s.disclosure_policy ?? null }
    };
    if (fields) {
      const keep = new Set(fields.split(",").map((f) => f.trim()).concat(["id", "snapshot_id"]));
      env = Object.fromEntries(Object.entries(env).filter(([k]) => keep.has(k)));
    }
    while (Buffer.byteLength(JSON.stringify(env)) > max_bytes && env.relations?.length) {
      env.relations = env.relations.slice(0, -1);
      if (env.representations) env.representations = env.representations.slice(0, env.relations.length);
    }
    return env;
  }
}
