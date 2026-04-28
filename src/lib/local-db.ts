import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import path from 'path';

// Use a file-based DB so data persists across restarts
const DB_PATH = path.join(process.cwd(), 'local.db');

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!_db) {
    _db = new Database(DB_PATH);
    _db.pragma('journal_mode = WAL');
    _db.pragma('foreign_keys = ON');
    initSchema(_db);
  }
  return _db;
}

function initSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sedes (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      name TEXT NOT NULL UNIQUE,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS areas (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      name TEXT NOT NULL UNIQUE,
      slug TEXT NOT NULL UNIQUE,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      full_name TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin','service_manager','kitchen_manager','bar_manager')),
      area_id TEXT REFERENCES areas(id),
      sede_id TEXT REFERENCES sedes(id),
      username TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      area_id TEXT NOT NULL REFERENCES areas(id) ON DELETE CASCADE,
      sede_id TEXT REFERENCES sedes(id),
      name TEXT NOT NULL,
      unit TEXT NOT NULL DEFAULT 'unidades',
      category TEXT,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS inventory_items (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      area_id TEXT NOT NULL REFERENCES areas(id) ON DELETE CASCADE,
      sede_id TEXT REFERENCES sedes(id),
      quantity REAL NOT NULL DEFAULT 0,
      updated_at TEXT DEFAULT (datetime('now')),
      updated_by TEXT REFERENCES profiles(id)
    );

    CREATE TABLE IF NOT EXISTS inventory_updates (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      inventory_item_id TEXT NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
      previous_qty REAL NOT NULL,
      new_qty REAL NOT NULL,
      updated_by TEXT REFERENCES profiles(id),
      updated_at TEXT DEFAULT (datetime('now')),
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      area_id TEXT NOT NULL REFERENCES areas(id),
      sede_id TEXT REFERENCES sedes(id),
      created_by TEXT NOT NULL REFERENCES profiles(id),
      status TEXT NOT NULL DEFAULT 'borrador' CHECK (status IN ('borrador','enviado','aprobado')),
      category TEXT,
      notes TEXT,
      items TEXT DEFAULT '[]',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      product_name TEXT NOT NULL,
      quantity REAL NOT NULL DEFAULT 0,
      unit TEXT NOT NULL DEFAULT 'unidades',
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS physical_counts (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      area_id TEXT NOT NULL REFERENCES areas(id),
      submitted_by TEXT NOT NULL REFERENCES profiles(id),
      reviewed_by TEXT REFERENCES profiles(id),
      status TEXT NOT NULL DEFAULT 'pendiente' CHECK (status IN ('pendiente','aprobado','rechazado')),
      items TEXT NOT NULL DEFAULT '[]',
      notes TEXT,
      review_notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      reviewed_at TEXT
    );
  `);

  // Seed data if empty
  const sedeCount = db.prepare('SELECT COUNT(*) as c FROM sedes').get() as { c: number };
  if (sedeCount.c === 0) {
    seedData(db);
  }
}

function seedData(db: Database.Database) {
  // Default sede
  db.prepare(`INSERT INTO sedes (id, name) VALUES (?, ?)`).run('sede-principal', 'La Comitiva Principal');

  // Areas
  db.prepare(`INSERT INTO areas (id, name, slug) VALUES (?, ?, ?)`).run('area-servicio', 'Servicio', 'servicio');
  db.prepare(`INSERT INTO areas (id, name, slug) VALUES (?, ?, ?)`).run('area-cocina', 'Cocina', 'cocina');
  db.prepare(`INSERT INTO areas (id, name, slug) VALUES (?, ?, ?)`).run('area-bar', 'Bar', 'bar');

  // Users (password: demo1234)
  const hash = bcrypt.hashSync('demo1234', 10);
  const users = [
    { id: 'user-admin', email: 'admin', name: 'Admin La Comitiva', role: 'admin', area: null, sede: null },
    { id: 'user-servicio', email: 'servicio', name: 'Jefe de Servicio', role: 'service_manager', area: 'area-servicio', sede: 'sede-principal' },
    { id: 'user-cocina', email: 'cocina', name: 'Jefe de Cocina', role: 'kitchen_manager', area: 'area-cocina', sede: 'sede-principal' },
    { id: 'user-bar', email: 'bar', name: 'Jefe de Bar', role: 'bar_manager', area: 'area-bar', sede: 'sede-principal' },
  ];

  for (const u of users) {
    db.prepare(`INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)`).run(u.id, u.email, hash);
    db.prepare(`INSERT INTO profiles (id, full_name, role, area_id, sede_id, username) VALUES (?, ?, ?, ?, ?, ?)`).run(u.id, u.name, u.role, u.area, u.sede, u.email);
  }

  // Products — La Comitiva restaurant inventory
  const sid = 'sede-principal';
  const products = [
    // ── Cocina: Carnes y Proteínas ──
    { id: 'p1',  area: 'area-cocina', name: 'Costilla de Cerdo', unit: 'kg', cat: 'Cárnicos', notes: 'Para costillas BBQ', qty: 18 },
    { id: 'p2',  area: 'area-cocina', name: 'Pechuga de Pollo', unit: 'kg', cat: 'Cárnicos', notes: 'Deshuesada', qty: 12 },
    { id: 'p3',  area: 'area-cocina', name: 'Carne de Res', unit: 'kg', cat: 'Cárnicos', notes: 'Lomo fino para parrilla', qty: 10 },
    { id: 'p4',  area: 'area-cocina', name: 'Chorizo Artesanal', unit: 'unidades', cat: 'Cárnicos', notes: 'Chorizo santarrosano', qty: 40 },
    { id: 'p5',  area: 'area-cocina', name: 'Chicharrón', unit: 'kg', cat: 'Cárnicos', notes: 'Para bandeja paisa', qty: 8 },
    // ── Cocina: Acompañamientos ──
    { id: 'p6',  area: 'area-cocina', name: 'Arroz', unit: 'kg', cat: 'Abarrotes', notes: 'Arroz Diana x 5kg', qty: 25 },
    { id: 'p7',  area: 'area-cocina', name: 'Frijoles Rojos', unit: 'kg', cat: 'Abarrotes', notes: 'Para bandeja paisa', qty: 10 },
    { id: 'p8',  area: 'area-cocina', name: 'Plátano Maduro', unit: 'unidades', cat: 'Fruver', notes: 'Para patacón y tajadas', qty: 60 },
    { id: 'p9',  area: 'area-cocina', name: 'Papa Criolla', unit: 'kg', cat: 'Fruver', notes: null, qty: 15 },
    { id: 'p10', area: 'area-cocina', name: 'Yuca', unit: 'kg', cat: 'Fruver', notes: 'Para yuca frita', qty: 12 },
    // ── Cocina: Salsas y condimentos ──
    { id: 'p11', area: 'area-cocina', name: 'Salsa BBQ', unit: 'litros', cat: 'Abarrotes', notes: 'La Comitiva house BBQ', qty: 5 },
    { id: 'p12', area: 'area-cocina', name: 'Aceite Vegetal', unit: 'litros', cat: 'Abarrotes', notes: 'Para freidora', qty: 20 },
    { id: 'p13', area: 'area-cocina', name: 'Ajo', unit: 'kg', cat: 'Fruver', notes: null, qty: 3 },
    { id: 'p14', area: 'area-cocina', name: 'Cebolla Cabezona', unit: 'kg', cat: 'Fruver', notes: null, qty: 8 },
    { id: 'p15', area: 'area-cocina', name: 'Tomate', unit: 'kg', cat: 'Fruver', notes: 'Tomate chonto', qty: 10 },
    // ── Bar: Licores ──
    { id: 'p16', area: 'area-bar', name: 'Aguardiente Antioqueño', unit: 'botellas', cat: 'Licores', notes: '750ml', qty: 24 },
    { id: 'p17', area: 'area-bar', name: 'Ron Viejo de Caldas', unit: 'botellas', cat: 'Licores', notes: '750ml', qty: 12 },
    { id: 'p18', area: 'area-bar', name: 'Whisky Old Parr', unit: 'botellas', cat: 'Licores', notes: '750ml', qty: 6 },
    { id: 'p19', area: 'area-bar', name: 'Tequila José Cuervo', unit: 'botellas', cat: 'Licores', notes: '750ml Reposado', qty: 8 },
    { id: 'p20', area: 'area-bar', name: 'Vodka Absolut', unit: 'botellas', cat: 'Licores', notes: '750ml', qty: 5 },
    // ── Bar: Cervezas ──
    { id: 'p21', area: 'area-bar', name: 'Cerveza Club Colombia', unit: 'unidades', cat: 'Cervezas', notes: 'Botella 330ml dorada', qty: 96 },
    { id: 'p22', area: 'area-bar', name: 'Cerveza Poker', unit: 'unidades', cat: 'Cervezas', notes: 'Botella 330ml', qty: 72 },
    { id: 'p23', area: 'area-bar', name: 'Cerveza Águila', unit: 'unidades', cat: 'Cervezas', notes: 'Botella 330ml', qty: 48 },
    { id: 'p24', area: 'area-bar', name: 'Cerveza Corona', unit: 'unidades', cat: 'Cervezas', notes: 'Botella 355ml', qty: 36 },
    // ── Bar: Insumos ──
    { id: 'p25', area: 'area-bar', name: 'Limones', unit: 'kg', cat: 'Fruver', notes: 'Para cócteles', qty: 6 },
    { id: 'p26', area: 'area-bar', name: 'Hielo', unit: 'kg', cat: 'Insumos', notes: 'Bolsa x 3kg', qty: 30 },
    { id: 'p27', area: 'area-bar', name: 'Gaseosa Coca-Cola', unit: 'unidades', cat: 'Bebidas', notes: 'Pet 400ml', qty: 48 },
    { id: 'p28', area: 'area-bar', name: 'Agua Cristal', unit: 'unidades', cat: 'Bebidas', notes: 'Pet 600ml', qty: 60 },
    // ── Servicio: Mesa y suministros ──
    { id: 'p29', area: 'area-servicio', name: 'Servilletas', unit: 'paquetes', cat: 'Suministros', notes: 'Paquete x 100', qty: 30 },
    { id: 'p30', area: 'area-servicio', name: 'Vasos Cristal', unit: 'unidades', cat: 'Suministros', notes: 'Vasos highball 350ml', qty: 80 },
    { id: 'p31', area: 'area-servicio', name: 'Platos Principales', unit: 'unidades', cat: 'Suministros', notes: 'Plato llano 27cm', qty: 60 },
    { id: 'p32', area: 'area-servicio', name: 'Cubiertos Set', unit: 'unidades', cat: 'Suministros', notes: 'Cuchillo + tenedor + cuchara', qty: 50 },
    { id: 'p33', area: 'area-servicio', name: 'Mantel Individual', unit: 'unidades', cat: 'Suministros', notes: 'Papel kraft', qty: 200 },
    { id: 'p34', area: 'area-servicio', name: 'Portavasos', unit: 'unidades', cat: 'Suministros', notes: 'Cartón con logo', qty: 500 },
  ];

  for (const p of products) {
    db.prepare(`INSERT INTO products (id, area_id, sede_id, name, unit, category, notes) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(p.id, p.area, sid, p.name, p.unit, p.cat, p.notes);
    db.prepare(`INSERT INTO inventory_items (id, product_id, area_id, sede_id, quantity, updated_by) VALUES (?, ?, ?, ?, ?, ?)`).run(`inv-${p.id}`, p.id, p.area, sid, p.qty, 'user-admin');
  }
}

// ---- Query helpers ----

export function getUserByUsername(username: string) {
  const db = getDb();
  return db.prepare('SELECT * FROM users WHERE email = ?').get(username) as { id: string; email: string; password_hash: string } | undefined;
}

export function getUserById(id: string) {
  const db = getDb();
  return db.prepare('SELECT id, email FROM users WHERE id = ?').get(id) as { id: string; email: string } | undefined;
}

export function getProfileById(id: string) {
  const db = getDb();
  return db.prepare('SELECT * FROM profiles WHERE id = ?').get(id) as Record<string, unknown> | undefined;
}

export function getProfileWithArea(id: string) {
  const db = getDb();
  return db.prepare(`
    SELECT p.*, a.name as area_name FROM profiles p
    LEFT JOIN areas a ON p.area_id = a.id
    WHERE p.id = ?
  `).get(id) as Record<string, unknown> | undefined;
}

export function getAllProfiles() {
  const db = getDb();
  return db.prepare(`
    SELECT p.*, a.name as area_name, u.email as username FROM profiles p
    LEFT JOIN areas a ON p.area_id = a.id
    LEFT JOIN users u ON p.id = u.id
    ORDER BY p.created_at DESC
  `).all() as Record<string, unknown>[];
}

export function getAllAreas() {
  const db = getDb();
  return db.prepare('SELECT * FROM areas').all();
}

// ---- SEDES ----

export function getAllSedes() {
  const db = getDb();
  return db.prepare('SELECT * FROM sedes ORDER BY name').all();
}

export function createSede(name: string) {
  const db = getDb();
  const id = genId();
  db.prepare('INSERT INTO sedes (id, name) VALUES (?, ?)').run(id, name);
  return { id, name };
}

export function deleteSede(id: string) {
  const db = getDb();
  db.prepare('DELETE FROM sedes WHERE id = ?').run(id);
}

export function getInventoryItems(opts: {
  areaId?: string;
  sedeId?: string;
  category?: string;
  lowStock?: boolean;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  sortField?: string;
  sortDir?: string;
  offset?: number;
  limit?: number;
}) {
  const db = getDb();
  let where = '1=1';
  const params: unknown[] = [];

  if (opts.areaId) { where += ' AND ii.area_id = ?'; params.push(opts.areaId); }
  if (opts.sedeId) { where += ' AND ii.sede_id = ?'; params.push(opts.sedeId); }
  if (opts.category) { where += ' AND p.category = ?'; params.push(opts.category); }
  if (opts.lowStock) { where += ' AND ii.quantity <= 5'; }
  if (opts.search) { where += ' AND p.name LIKE ?'; params.push(`%${opts.search}%`); }
  if (opts.dateFrom) { where += ' AND ii.updated_at >= ?'; params.push(opts.dateFrom); }
  if (opts.dateTo) { where += ' AND ii.updated_at < ?'; params.push(opts.dateTo); }

  // Count
  const countRow = db.prepare(`
    SELECT COUNT(*) as c FROM inventory_items ii
    JOIN products p ON ii.product_id = p.id
    WHERE ${where}
  `).get(...params) as { c: number };

  // Sort
  let orderBy = 'ii.updated_at DESC';
  if (opts.sortField === 'name') orderBy = `p.name ${opts.sortDir === 'asc' ? 'ASC' : 'DESC'}`;
  else if (opts.sortField === 'quantity') orderBy = `ii.quantity ${opts.sortDir === 'asc' ? 'ASC' : 'DESC'}`;
  else if (opts.sortField === 'updated_at') orderBy = `ii.updated_at ${opts.sortDir === 'asc' ? 'ASC' : 'DESC'}`;

  let limitClause = '';
  if (opts.limit !== undefined) {
    limitClause = ` LIMIT ? OFFSET ?`;
    params.push(opts.limit, opts.offset || 0);
  }

  const rows = db.prepare(`
    SELECT ii.*, p.name as product_name, p.unit as product_unit, p.category as product_category,
           p.notes as product_notes, p.area_id as product_area_id, p.created_at as product_created_at, p.id as product_id2,
           a.name as area_name, a.slug as area_slug, a.created_at as area_created_at, a.id as area_id2,
           s.name as sede_name
    FROM inventory_items ii
    JOIN products p ON ii.product_id = p.id
    JOIN areas a ON ii.area_id = a.id
    LEFT JOIN sedes s ON ii.sede_id = s.id
    WHERE ${where}
    ORDER BY ${orderBy}
    ${limitClause}
  `).all(...params) as Record<string, unknown>[];

  const data = rows.map(r => ({
    id: r.id,
    product_id: r.product_id,
    area_id: r.area_id,
    sede_id: r.sede_id,
    quantity: r.quantity,
    updated_at: r.updated_at,
    updated_by: r.updated_by,
    product: {
      id: r.product_id2,
      area_id: r.product_area_id,
      name: r.product_name,
      unit: r.product_unit,
      category: r.product_category,
      notes: r.product_notes,
      created_at: r.product_created_at,
    },
    area: {
      id: r.area_id2,
      name: r.area_name,
      slug: r.area_slug,
      created_at: r.area_created_at,
    },
    sede: r.sede_name ? { name: r.sede_name } : null,
  }));

  return { data, count: countRow.c };
}

export function getInventoryItemById(id: string) {
  const db = getDb();
  const r = db.prepare(`
    SELECT ii.*, p.name as product_name, p.unit as product_unit, p.category as product_category,
           p.notes as product_notes, p.id as product_id2, p.area_id as product_area_id, p.created_at as product_created_at
    FROM inventory_items ii
    JOIN products p ON ii.product_id = p.id
    WHERE ii.id = ?
  `).get(id) as Record<string, unknown> | undefined;

  if (!r) return null;
  return {
    id: r.id, product_id: r.product_id, area_id: r.area_id, quantity: r.quantity,
    updated_at: r.updated_at, updated_by: r.updated_by,
    product: {
      id: r.product_id2, area_id: r.product_area_id, name: r.product_name,
      unit: r.product_unit, category: r.product_category, notes: r.product_notes, created_at: r.product_created_at,
    },
  };
}

export function getHistoryEntries(opts: { offset?: number; limit?: number; dateFrom?: string; dateTo?: string }) {
  const db = getDb();
  let where = '1=1';
  const params: unknown[] = [];

  if (opts.dateFrom) { where += ' AND iu.updated_at >= ?'; params.push(opts.dateFrom); }
  if (opts.dateTo) { where += ' AND iu.updated_at < ?'; params.push(opts.dateTo); }

  const countRow = db.prepare(`SELECT COUNT(*) as c FROM inventory_updates iu WHERE ${where}`).get(...params) as { c: number };

  const limitParams = [...params];
  limitParams.push(opts.limit || 25, opts.offset || 0);

  const rows = db.prepare(`
    SELECT iu.*, pr.full_name as updater_name,
           p.name as product_name, p.unit as product_unit,
           a.name as area_name
    FROM inventory_updates iu
    LEFT JOIN profiles pr ON iu.updated_by = pr.id
    LEFT JOIN inventory_items ii ON iu.inventory_item_id = ii.id
    LEFT JOIN products p ON ii.product_id = p.id
    LEFT JOIN areas a ON ii.area_id = a.id
    WHERE ${where}
    ORDER BY iu.updated_at DESC
    LIMIT ? OFFSET ?
  `).all(...limitParams) as Record<string, unknown>[];

  const data = rows.map(r => ({
    id: r.id, previous_qty: r.previous_qty, new_qty: r.new_qty,
    updated_at: r.updated_at, notes: r.notes, updated_by: r.updated_by,
    updater: r.updater_name ? { full_name: r.updater_name } : null,
    inventory_item: {
      product: r.product_name ? { name: r.product_name, unit: r.product_unit } : null,
      area: r.area_name ? { name: r.area_name } : null,
    },
  }));

  return { data, count: countRow.c };
}

export function createProduct(data: { name: string; unit: string; category?: string; notes?: string; area_id: string; sede_id?: string }) {
  const db = getDb();
  const id = genId();
  db.prepare('INSERT INTO products (id, name, unit, category, notes, area_id, sede_id) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
    id, data.name, data.unit, data.category || null, data.notes || null, data.area_id, data.sede_id || null
  );
  return { id, ...data };
}

export function updateProduct(id: string, data: Record<string, unknown>) {
  const db = getDb();
  const sets = Object.keys(data).map(k => `${k} = ?`).join(', ');
  db.prepare(`UPDATE products SET ${sets} WHERE id = ?`).run(...Object.values(data), id);
}

export function deleteProduct(id: string) {
  getDb().prepare('DELETE FROM products WHERE id = ?').run(id);
}

export function createInventoryItem(data: { product_id: string; area_id: string; sede_id?: string; quantity: number; updated_by: string }) {
  const db = getDb();
  const id = genId();
  db.prepare('INSERT INTO inventory_items (id, product_id, area_id, sede_id, quantity, updated_by) VALUES (?, ?, ?, ?, ?, ?)').run(
    id, data.product_id, data.area_id, data.sede_id || null, data.quantity, data.updated_by
  );
  return { id };
}

export function updateInventoryItem(id: string, data: Record<string, unknown>) {
  const db = getDb();
  const sets = Object.keys(data).map(k => `${k} = ?`).join(', ');
  db.prepare(`UPDATE inventory_items SET ${sets} WHERE id = ?`).run(...Object.values(data), id);
}

export function deleteInventoryItem(id: string) {
  getDb().prepare('DELETE FROM inventory_items WHERE id = ?').run(id);
}

export function createInventoryUpdate(data: {
  inventory_item_id: string; previous_qty: number; new_qty: number; updated_by: string; notes?: string;
}) {
  const db = getDb();
  const id = genId();
  db.prepare('INSERT INTO inventory_updates (id, inventory_item_id, previous_qty, new_qty, updated_by, notes) VALUES (?, ?, ?, ?, ?, ?)').run(
    id, data.inventory_item_id, data.previous_qty, data.new_qty, data.updated_by, data.notes || null
  );
}

export function transferInventory(opts: {
  sourceItemId: string;
  targetSedeId: string;
  quantity: number;
  updatedBy: string;
  notes: string;
}) {
  const db = getDb();
  // Get source item with product info
  const source = db.prepare(`
    SELECT ii.*, p.name as pname, p.unit as punit, p.category as pcat, p.notes as pnotes, p.area_id as paid
    FROM inventory_items ii JOIN products p ON ii.product_id = p.id
    WHERE ii.id = ?
  `).get(opts.sourceItemId) as Record<string, unknown> | undefined;
  if (!source) throw new Error('Item no encontrado');

  const currentQty = Number(source.quantity) || 0;
  if (opts.quantity > currentQty) throw new Error('Cantidad insuficiente para transferir');

  // Subtract from source
  const newSrcQty = currentQty - opts.quantity;
  db.prepare('UPDATE inventory_items SET quantity = ?, updated_at = datetime(\'now\'), updated_by = ? WHERE id = ?')
    .run(newSrcQty, opts.updatedBy, opts.sourceItemId);

  // Log source deduction
  createInventoryUpdate({
    inventory_item_id: opts.sourceItemId,
    previous_qty: currentQty,
    new_qty: newSrcQty,
    updated_by: opts.updatedBy,
    notes: `📤 Transferencia salida: ${opts.notes}`,
  });

  // Find or create matching product in target sede
  const existingProduct = db.prepare(
    'SELECT id FROM products WHERE name = ? AND area_id = ? AND sede_id = ?'
  ).get(String(source.pname), String(source.paid), opts.targetSedeId) as { id: string } | undefined;

  let targetProductId: string;
  if (existingProduct) {
    targetProductId = existingProduct.id;
  } else {
    targetProductId = genId();
    db.prepare('INSERT INTO products (id, area_id, sede_id, name, unit, category, notes) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
      targetProductId, String(source.paid), opts.targetSedeId,
      String(source.pname), String(source.punit), source.pcat || null, source.pnotes || null
    );
  }

  // Find or create inventory item in target sede
  const existingItem = db.prepare(
    'SELECT id, quantity FROM inventory_items WHERE product_id = ? AND sede_id = ?'
  ).get(targetProductId, opts.targetSedeId) as { id: string; quantity: number } | undefined;

  if (existingItem) {
    const prevQty = Number(existingItem.quantity) || 0;
    const newQty = prevQty + opts.quantity;
    db.prepare('UPDATE inventory_items SET quantity = ?, updated_at = datetime(\'now\'), updated_by = ? WHERE id = ?')
      .run(newQty, opts.updatedBy, existingItem.id);
    createInventoryUpdate({
      inventory_item_id: existingItem.id,
      previous_qty: prevQty,
      new_qty: newQty,
      updated_by: opts.updatedBy,
      notes: `📥 Transferencia entrada: ${opts.notes}`,
    });
  } else {
    const newItemId = genId();
    db.prepare('INSERT INTO inventory_items (id, product_id, area_id, sede_id, quantity, updated_by) VALUES (?, ?, ?, ?, ?, ?)').run(
      newItemId, targetProductId, String(source.paid), opts.targetSedeId, opts.quantity, opts.updatedBy
    );
    createInventoryUpdate({
      inventory_item_id: newItemId,
      previous_qty: 0,
      new_qty: opts.quantity,
      updated_by: opts.updatedBy,
      notes: `📥 Transferencia entrada: ${opts.notes}`,
    });
  }

  return { success: true };
}

export function createUser(email: string, password: string, fullName: string, role: string, areaId: string | null, username?: string) {
  const db = getDb();
  const id = genId();
  const hash = bcrypt.hashSync(password, 10);
  db.prepare('INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)').run(id, email, hash);
  db.prepare('INSERT INTO profiles (id, full_name, role, area_id, username) VALUES (?, ?, ?, ?, ?)').run(id, fullName, role, areaId, username || email);
  return { id, email };
}

export function updateProfile(id: string, data: Record<string, unknown>) {
  const db = getDb();
  const sets = Object.keys(data).map(k => `${k} = ?`).join(', ');
  db.prepare(`UPDATE profiles SET ${sets} WHERE id = ?`).run(...Object.values(data), id);
}

export function deleteUser(id: string) {
  const db = getDb();
  db.prepare('DELETE FROM profiles WHERE id = ?').run(id);
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
}

export function updateUserPassword(id: string, newPassword: string) {
  const db = getDb();
  const hash = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, id);
}

export function updateUsername(id: string, newUsername: string) {
  const db = getDb();
  db.prepare('UPDATE users SET email = ? WHERE id = ?').run(newUsername, id);
}

export function getAllInventoryForExport(sedeId?: string) {
  const db = getDb();
  const where = sedeId ? 'WHERE ii.sede_id = ?' : '';
  const params = sedeId ? [sedeId] : [];
  return db.prepare(`
    SELECT ii.quantity, ii.updated_at, p.name as product_name, p.unit as product_unit,
           p.category as product_category, p.notes as product_notes,
           a.name as area_name, s.name as sede_name
    FROM inventory_items ii
    JOIN products p ON ii.product_id = p.id
    JOIN areas a ON ii.area_id = a.id
    LEFT JOIN sedes s ON ii.sede_id = s.id
    ${where}
    ORDER BY p.category, p.name
  `).all(...params) as Record<string, unknown>[];
}

export function getRecentUpdates(limit: number = 10) {
  const db = getDb();
  const rows = db.prepare(`
    SELECT iu.*, pr.full_name as updater_name, p.name as product_name, a.name as area_name
    FROM inventory_updates iu
    LEFT JOIN profiles pr ON iu.updated_by = pr.id
    LEFT JOIN inventory_items ii ON iu.inventory_item_id = ii.id
    LEFT JOIN products p ON ii.product_id = p.id
    LEFT JOIN areas a ON ii.area_id = a.id
    ORDER BY iu.updated_at DESC
    LIMIT ?
  `).all(limit) as Record<string, unknown>[];

  return rows.map((r) => ({
    id: r.id, previous_qty: r.previous_qty, new_qty: r.new_qty,
    updated_at: r.updated_at, notes: r.notes,
    updater: r.updater_name ? { full_name: r.updater_name } : null,
    inventory_item: {
      product: r.product_name ? { name: r.product_name } : null,
      area: r.area_name ? { name: r.area_name } : null,
    },
  }));
}

function genId(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map(b => b.toString(16).padStart(2, '0')).join('');
}

// ---- ORDERS ----

export function createOrder(data: { area_id: string; sede_id?: string; created_by: string; category?: string; notes?: string; items: { product_name: string; quantity: number; unit: string; notes?: string; category?: string }[] }) {
  const db = getDb();
  const id = genId();
  const itemsJson = JSON.stringify(data.items);
  db.prepare('INSERT INTO orders (id, area_id, sede_id, created_by, category, notes, items) VALUES (?, ?, ?, ?, ?, ?, ?)').run(id, data.area_id, data.sede_id || null, data.created_by, data.category || null, data.notes || null, itemsJson);
  // Also insert into order_items for backwards compatibility
  const insertItem = db.prepare('INSERT INTO order_items (id, order_id, product_name, quantity, unit, notes) VALUES (?, ?, ?, ?, ?, ?)');
  for (const item of data.items) {
    insertItem.run(genId(), id, item.product_name, item.quantity, item.unit, item.notes || null);
  }
  return { id };
}

export function getOrders(opts: { areaId?: string; status?: string }) {
  const db = getDb();
  let where = '1=1';
  const params: unknown[] = [];
  if (opts.areaId) { where += ' AND o.area_id = ?'; params.push(opts.areaId); }
  if (opts.status) { where += ' AND o.status = ?'; params.push(opts.status); }

  const rows = db.prepare(`
    SELECT o.*, a.name as area_name, p.full_name as creator_name, s.name as sede_name,
           (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id) as item_count
    FROM orders o
    JOIN areas a ON o.area_id = a.id
    JOIN profiles p ON o.created_by = p.id
    LEFT JOIN sedes s ON o.sede_id = s.id
    WHERE ${where}
    ORDER BY o.created_at DESC
  `).all(...params) as Record<string, unknown>[];

  return rows.map(r => {
    let items: any[] = [];
    try { items = JSON.parse(String(r.items || '[]')); } catch { /* empty */ }
    return {
      id: r.id, area_id: r.area_id, sede_id: r.sede_id, created_by: r.created_by, status: r.status,
      category: r.category, notes: r.notes, created_at: r.created_at,
      area: { name: r.area_name }, sede: r.sede_name ? { name: r.sede_name } : null,
      creator: { full_name: r.creator_name },
      items,
      item_count: items.length || r.item_count,
    };
  });
}

export function getOrderById(id: string) {
  const db = getDb();
  const order = db.prepare(`
    SELECT o.*, a.name as area_name, p.full_name as creator_name, s.name as sede_name
    FROM orders o
    JOIN areas a ON o.area_id = a.id
    JOIN profiles p ON o.created_by = p.id
    LEFT JOIN sedes s ON o.sede_id = s.id
    WHERE o.id = ?
  `).get(id) as Record<string, unknown> | undefined;
  if (!order) return null;
  // Prefer JSON items column; fallback to order_items table
  let items: any[] = [];
  try { items = JSON.parse(String(order.items || '[]')); } catch { /* empty */ }
  if (items.length === 0) {
    const itemRows = db.prepare('SELECT * FROM order_items WHERE order_id = ? ORDER BY rowid').all(id) as Record<string, unknown>[];
    items = itemRows.map(i => ({ product_name: i.product_name, quantity: i.quantity, unit: i.unit, notes: i.notes }));
  }

  return {
    id: order.id, area_id: order.area_id, sede_id: order.sede_id, created_by: order.created_by, status: order.status,
    category: order.category, notes: order.notes, created_at: order.created_at,
    area: { name: order.area_name }, sede: order.sede_name ? { name: order.sede_name } : null,
    creator: { full_name: order.creator_name },
    items,
  };
}

export function updateOrderStatus(id: string, status: string) {
  getDb().prepare('UPDATE orders SET status = ? WHERE id = ?').run(status, id);
}

export function deleteOrder(id: string) {
  const db = getDb();
  db.prepare('DELETE FROM order_items WHERE order_id = ?').run(id);
  db.prepare('DELETE FROM orders WHERE id = ?').run(id);
}

export function getOrderCategories(): string[] {
  const db = getDb();
  const rows = db.prepare(`SELECT DISTINCT category FROM orders WHERE category IS NOT NULL AND length(category) > 0 ORDER BY category`).all() as { category: string }[];
  return rows.map(r => r.category);
}
