// Storage backends for the resolver. The default is a pure-JS in-memory store
// with no native dependency, so the default deploy needs no compile step.
// Set STORE=sqlite and DB_PATH to use the persistent SQLite backend.

// Minimal row store with the few query shapes the resolver needs.
// Both backends expose the same methods.

export class MemoryStore {
  constructor() {
    this.entity = new Map();      // id -> row
    this.relations = new Map();   // src -> [rel rows]
    this.extIndex = new Map();    // registry\x00external_id -> src
    this.zoneGen = new Map();     // zone -> generation
    this.history = [];            // { id, sequence, source, state_json }
  }
  bumpZone(zone) {
    const g = (this.zoneGen.get(zone) ?? 0) + 1;
    this.zoneGen.set(zone, g);
    return g;
  }
  putEntity(row) {
    this.entity.set(row.id, row);
  }
  putRelations(src, rels) {
    this.relations.set(src, rels);
    for (const [k, v] of this.extIndex) if (v === src) this.extIndex.delete(k);
    for (const r of rels) if (r.type === "identified_as" && r.registry && r.external_id)
      this.extIndex.set(`${r.registry}\x00${r.external_id}`, src);
  }
  addHistory(h) { this.history.push(h); }
  getEntity(id) { return this.entity.get(id) ?? null; }
  getRelations(src) { return this.relations.get(src) ?? []; }
  srcByExternal(registry, external_id) { return this.extIndex.get(`${registry}\x00${external_id}`) ?? null; }
  allEntities() { return [...this.entity.values()]; }
  entitiesGenAbove(gen) { return this.allEntities().filter((e) => e.generation > gen); }
  zones() { return [...this.zoneGen.entries()].map(([zone, generation]) => ({ zone, generation })).sort((a, b) => a.zone < b.zone ? -1 : 1); }
  stateAt(id, at) {
    const rows = this.history.filter((h) => h.id === id && (!at || (h.source && h.source <= at))).sort((a, b) => (a.source < b.source ? -1 : 1));
    return rows.length ? rows[rows.length - 1].state_json : null;
  }
}

export async function makeStore() {
  const kind = (process.env.STORE || "memory").toLowerCase();
  if (kind === "sqlite") {
    try {
      const { SqliteStore } = await import("./store-sqlite.mjs");
      return new SqliteStore(process.env.DB_PATH || "4did.db");
    } catch (e) {
      console.warn(`[4D-ID] STORE=sqlite requested but unavailable (${e.message}); falling back to in-memory.`);
      return new MemoryStore();
    }
  }
  return new MemoryStore();
}
