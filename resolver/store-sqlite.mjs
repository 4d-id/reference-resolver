// Optional SQLite backend. Imported lazily by makeStore only when STORE=sqlite,
// so the native better-sqlite3 dependency is never required for the default deploy.
import Database from "better-sqlite3";

export class SqliteStore {
  constructor(path = "4did.db") {
    this.db = new Database(path);
    this.db.pragma("journal_mode = WAL");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS entity (
        id TEXT PRIMARY KEY, parent TEXT, zone TEXT, home_zone TEXT,
        motion_mode TEXT, status TEXT, layer TEXT, lease TEXT,
        state_json TEXT, sequence INTEGER, generation INTEGER, updated TEXT, merged_into TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_entity_zone ON entity(zone);
      CREATE TABLE IF NOT EXISTS relation (
        src TEXT, type TEXT, target TEXT, registry TEXT, external_id TEXT,
        rel_json TEXT, valid_from TEXT, valid_to TEXT, confidence REAL
      );
      CREATE INDEX IF NOT EXISTS idx_rel_src ON relation(src);
      CREATE INDEX IF NOT EXISTS idx_rel_ext ON relation(registry, external_id);
      CREATE TABLE IF NOT EXISTS zone_gen (zone TEXT PRIMARY KEY, generation INTEGER);
      CREATE TABLE IF NOT EXISTS history (id TEXT, sequence INTEGER, source TEXT, state_json TEXT);
      CREATE INDEX IF NOT EXISTS idx_hist ON history(id, source);
      CREATE TABLE IF NOT EXISTS recon (kind TEXT, survivor TEXT, merged TEXT, from_id TEXT, into_json TEXT, authority TEXT, reason TEXT, at TEXT, event_json TEXT);
      CREATE TABLE IF NOT EXISTS candidate (cand_json TEXT);
    `);
    const cols = this.db.prepare("PRAGMA table_info(entity)").all().map((c) => c.name);
    if (!cols.includes("merged_into")) this.db.prepare("ALTER TABLE entity ADD COLUMN merged_into TEXT").run();
    const reconCols = this.db.prepare("PRAGMA table_info(recon)").all().map((c) => c.name);
    if (!reconCols.includes("event_json")) this.db.prepare("ALTER TABLE recon ADD COLUMN event_json TEXT").run();
  }
  // reconciliation support
  addCandidate(c) {
    this.db.prepare("INSERT INTO candidate(cand_json) VALUES(?)").run(JSON.stringify(c));
    this.db.prepare("DELETE FROM candidate WHERE rowid NOT IN (SELECT rowid FROM candidate ORDER BY rowid DESC LIMIT 1000)").run();
  }
  candidates() { return this.db.prepare("SELECT cand_json FROM candidate ORDER BY rowid").all().map((r) => JSON.parse(r.cand_json)); }
  markCandidate(id, status) {
    const row = this.db.prepare("SELECT rowid,cand_json FROM candidate ORDER BY rowid").all().find(r => JSON.parse(r.cand_json).candidate_id === id);
    if (!row) return;
    const c = JSON.parse(row.cand_json); c.status = status;
    this.db.prepare("UPDATE candidate SET cand_json=? WHERE rowid=?").run(JSON.stringify(c), row.rowid);
  }
  recordHistory(h) {
    this.db.prepare("INSERT INTO recon(kind,survivor,merged,from_id,into_json,authority,reason,at,event_json) VALUES(?,?,?,?,?,?,?,?,?)")
      .run(h.kind ?? null, h.survivor ?? null, h.merged ?? null, h.from ?? null, h.into ? JSON.stringify(h.into) : null, h.authority ?? null, h.reason ?? null, h.at ?? null, JSON.stringify(h));
  }
  reconHistory() {
    return this.db.prepare("SELECT kind,survivor,merged,from_id AS from,into_json,authority,reason,at,event_json FROM recon").all().map((r) => {
      if (r.event_json) return JSON.parse(r.event_json);
      return { ...r, into: r.into_json ? JSON.parse(r.into_json) : undefined, into_json: undefined, event_json: undefined };
    });
  }
  reindexExternalTo(fromId, toId) {
    this.db.prepare("UPDATE relation SET src=? WHERE src=? AND type='identified_as'").run(toId, fromId);
  }
  setMerged(loserId, survivorId) {
    this.db.prepare("UPDATE entity SET status='merged', merged_into=?, state_json=json_set(state_json,'$.status','merged','$.merged_into',?) WHERE id=?").run(survivorId, survivorId, loserId);
  }
  bumpZone(zone) {
    const row = this.db.prepare("SELECT generation FROM zone_gen WHERE zone=?").get(zone);
    const g = (row?.generation ?? 0) + 1;
    this.db.prepare("INSERT INTO zone_gen(zone,generation) VALUES(?,?) ON CONFLICT(zone) DO UPDATE SET generation=?").run(zone, g, g);
    return g;
  }
  putEntity(r) {
    this.db.prepare(`
      INSERT INTO entity(id,parent,zone,home_zone,motion_mode,status,layer,lease,state_json,sequence,generation,updated)
      VALUES(@id,@parent,@zone,@home_zone,@motion_mode,@status,@layer,@lease,@state_json,@sequence,@generation,@updated)
      ON CONFLICT(id) DO UPDATE SET parent=@parent,zone=@zone,motion_mode=@motion_mode,status=@status,
        layer=@layer,lease=@lease,state_json=@state_json,sequence=@sequence,generation=@generation,updated=@updated
    `).run({
      id: r.id, parent: r.parent ?? null, zone: r.zone, home_zone: r.home_zone ?? null,
      motion_mode: r.motion_mode ?? null, status: r.status ?? "active", layer: r.layer ?? "public",
      lease: r.lease ?? null, state_json: r.state_json, sequence: r.sequence ?? 0,
      generation: r.generation, updated: r.updated ?? null
    });
  }
  putRelations(src, rels) {
    this.db.prepare("DELETE FROM relation WHERE src=?").run(src);
    const ins = this.db.prepare(`INSERT INTO relation(src,type,target,registry,external_id,rel_json,valid_from,valid_to,confidence) VALUES(?,?,?,?,?,?,?,?,?)`);
    for (const r of rels) ins.run(src, r.type, r.target ?? null, r.registry ?? null, r.external_id ?? null, JSON.stringify(r), r.valid_from ?? null, r.valid_to ?? null, r.confidence ?? null);
  }
  addHistory(h) { this.db.prepare("INSERT INTO history(id,sequence,source,state_json) VALUES(?,?,?,?)").run(h.id, h.sequence, h.source, h.state_json); }
  getEntity(id) { return this.db.prepare("SELECT * FROM entity WHERE id=?").get(id) ?? null; }
  getRelations(src) { return this.db.prepare("SELECT rel_json FROM relation WHERE src=?").all(src).map((r) => JSON.parse(r.rel_json)); }
  srcByExternal(registry, external_id) { return this.db.prepare("SELECT src FROM relation WHERE type='identified_as' AND registry=? AND external_id=?").get(registry, external_id)?.src ?? null; }
  allEntities() { return this.db.prepare("SELECT * FROM entity").all(); }
  entitiesGenAbove(gen) { return this.db.prepare("SELECT * FROM entity WHERE generation > ?").all(gen); }
  zones() { return this.db.prepare("SELECT zone,generation FROM zone_gen ORDER BY zone").all(); }
  stateAt(id, at) {
    const row = at
      ? this.db.prepare("SELECT state_json FROM history WHERE id=? AND source<=? ORDER BY source DESC LIMIT 1").get(id, at)
      : this.db.prepare("SELECT state_json FROM history WHERE id=? ORDER BY source DESC LIMIT 1").get(id);
    return row?.state_json ?? null;
  }
}
