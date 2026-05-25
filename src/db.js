const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { DEFAULT_WEIGHTS, normalizeWeights } = require('./scoring');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'app.sqlite');

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

class AppDatabase {
  constructor(dbPath = DB_PATH) {
    ensureDataDir();
    this.db = new DatabaseSync(dbPath);
    this.db.exec('PRAGMA journal_mode = WAL');
    this.db.exec('PRAGMA foreign_keys = ON');
    this.init();
  }

  init() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS purchase_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_name TEXT NOT NULL,
        image_path TEXT,
        model TEXT,
        specifications TEXT,
        required_quantity REAL NOT NULL DEFAULT 1,
        unit TEXT,
        delivery_warehouse TEXT,
        usd_rate REAL DEFAULT 25500,
        cny_rate REAL DEFAULT 4000,
        extra_fee_percent REAL DEFAULT 0,
        extra_fee_vnd REAL DEFAULT 0,
        priority TEXT DEFAULT 'balanced',
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS suppliers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        request_id INTEGER NOT NULL,
        supplier_name TEXT,
        source_platform TEXT,
        product_name TEXT,
        product_image TEXT,
        product_url TEXT,
        unit_price REAL,
        currency TEXT DEFAULT 'VND',
        shipping_fee REAL DEFAULT 0,
        estimated_delivery_days REAL,
        available_quantity REAL,
        unit TEXT,
        deliver_to_buyer_warehouse INTEGER DEFAULT 0,
        warranty_policy TEXT,
        quality_raw REAL,
        reputation_raw REAL,
        review_count REAL,
        rating_count REAL,
        imported_from TEXT,
        data_status TEXT DEFAULT 'manual',
        notes TEXT,
        raw_data TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(request_id) REFERENCES purchase_requests(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS scores (
        supplier_id INTEGER PRIMARY KEY,
        price_score REAL,
        quality_score REAL,
        reputation_score REAL,
        delivery_score REAL,
        quantity_score REAL,
        warehouse_delivery_score REAL,
        warranty_score REAL,
        total_score REAL,
        total_cost REAL,
        rank INTEGER,
        explanation TEXT,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(supplier_id) REFERENCES suppliers(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    this.ensureColumns('purchase_requests', {
      usd_rate: 'REAL DEFAULT 25500',
      cny_rate: 'REAL DEFAULT 4000',
      extra_fee_percent: 'REAL DEFAULT 0',
      extra_fee_vnd: 'REAL DEFAULT 0',
      priority: "TEXT DEFAULT 'balanced'",
    });
    this.ensureColumns('suppliers', {
      verification_status: "TEXT DEFAULT 'unverified'",
      verification_notes: 'TEXT',
      seller_rating: 'REAL',
      seller_review_count: 'REAL',
      seller_years_active: 'REAL',
      negative_review_rate: 'REAL',
      response_time_hours: 'REAL',
      return_policy: 'TEXT',
      payment_protection: 'INTEGER DEFAULT 0',
      invoice_available: 'INTEGER DEFAULT 0',
      sample_available: 'INTEGER DEFAULT 0',
      risk_flags_json: 'TEXT',
    });
    this.ensureColumns('scores', {
      base_score: 'REAL',
      risk_penalty: 'REAL',
      risk_level: 'TEXT',
      decision_label: 'TEXT',
      recommendation_reason: 'TEXT',
      risk_flags_json: 'TEXT',
    });
    this.ensureDefaultSettings();
  }

  ensureColumns(table, columns) {
    const existing = new Set(this.db.prepare(`PRAGMA table_info(${table})`).all().map((row) => row.name));
    for (const [name, definition] of Object.entries(columns)) {
      if (!existing.has(name)) {
        this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
      }
    }
  }

  ensureDefaultSettings() {
    const existing = this.db.prepare('SELECT key FROM app_settings WHERE key = ?').get('weights');
    if (!existing) {
      this.db.prepare('INSERT INTO app_settings (key, value) VALUES (?, ?)').run(
        'weights',
        JSON.stringify(DEFAULT_WEIGHTS),
      );
    }
  }

  getSettings() {
    const weightsRow = this.db.prepare('SELECT value FROM app_settings WHERE key = ?').get('weights');
    return {
      weights: normalizeWeights(safeJson(weightsRow?.value) || DEFAULT_WEIGHTS),
    };
  }

  updateSettings(payload = {}) {
    const settings = {
      weights: normalizeWeights(payload.weights),
    };
    this.db.prepare(`
      INSERT INTO app_settings (key, value, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
    `).run('weights', JSON.stringify(settings.weights));
    return this.getSettings();
  }

  listSuggestions(kind, query = '', limit = 8) {
    const config = {
      products: { table: 'purchase_requests', column: 'product_name' },
      models: { table: 'purchase_requests', column: 'model' },
      warehouses: { table: 'purchase_requests', column: 'delivery_warehouse' },
      suppliers: { table: 'suppliers', column: 'supplier_name' },
    }[kind];
    if (!config) return [];
    const rows = this.db.prepare(`
      SELECT ${config.column} AS value, COUNT(*) AS use_count, MAX(updated_at) AS latest_at
      FROM ${config.table}
      WHERE TRIM(COALESCE(${config.column}, '')) <> ''
      GROUP BY ${config.column}
    `).all();
    const needle = normalizeSearchText(query);
    return rows
      .map((row) => ({
        value: row.value,
        normalized: normalizeSearchText(row.value),
        use_count: row.use_count,
        latest_at: row.latest_at || '',
      }))
      .filter((row) => !needle || row.normalized.includes(needle))
      .sort((a, b) => {
        const aStarts = needle && a.normalized.startsWith(needle) ? 1 : 0;
        const bStarts = needle && b.normalized.startsWith(needle) ? 1 : 0;
        return bStarts - aStarts
          || b.use_count - a.use_count
          || String(b.latest_at).localeCompare(String(a.latest_at))
          || a.value.length - b.value.length;
      })
      .slice(0, limit)
      .map(({ value, use_count, latest_at }) => ({ value, use_count, latest_at }));
  }

  listRequests() {
    return this.db.prepare(`
      SELECT pr.*,
        COUNT(s.id) AS supplier_count,
        MAX(sc.total_score) AS best_score
      FROM purchase_requests pr
      LEFT JOIN suppliers s ON s.request_id = pr.id
      LEFT JOIN scores sc ON sc.supplier_id = s.id
      GROUP BY pr.id
      ORDER BY pr.updated_at DESC, pr.id DESC
    `).all();
  }

  getRequest(id) {
    const request = this.db.prepare('SELECT * FROM purchase_requests WHERE id = ?').get(id);
    if (!request) return null;
    const suppliers = this.db.prepare(`
      SELECT s.*, sc.price_score, sc.quality_score, sc.reputation_score, sc.delivery_score,
        sc.quantity_score, sc.warehouse_delivery_score, sc.warranty_score, sc.total_score,
        sc.total_cost, sc.rank, sc.explanation, sc.base_score, sc.risk_penalty, sc.risk_level,
        sc.decision_label, sc.recommendation_reason, sc.risk_flags_json AS score_risk_flags_json
      FROM suppliers s
      LEFT JOIN scores sc ON sc.supplier_id = s.id
      WHERE s.request_id = ?
      ORDER BY COALESCE(sc.rank, 999999), s.id
    `).all(id).map(rowToSupplier);
    return { purchaseRequest: request, suppliers };
  }

  createRequest(payload) {
    const pr = payload.purchaseRequest || {};
    const insert = this.db.prepare(`
      INSERT INTO purchase_requests
      (product_name, image_path, model, specifications, required_quantity, unit, delivery_warehouse,
        usd_rate, cny_rate, extra_fee_percent, extra_fee_vnd, priority, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const result = insert.run(
      pr.product_name || 'Yêu cầu mua hàng mới',
      pr.image_path || '',
      pr.model || '',
      pr.specifications || '',
      Number(pr.required_quantity || 1),
      pr.unit || '',
      pr.delivery_warehouse || '',
      nullableNumber(pr.usd_rate) ?? 25500,
      nullableNumber(pr.cny_rate) ?? 4000,
      nullableNumber(pr.extra_fee_percent) ?? 0,
      nullableNumber(pr.extra_fee_vnd) ?? 0,
      pr.priority || 'balanced',
      pr.notes || '',
    );
    const requestId = Number(result.lastInsertRowid);
    this.replaceSuppliers(requestId, payload.suppliers || []);
    return this.getRequest(requestId);
  }

  updateRequest(id, payload) {
    const pr = payload.purchaseRequest || {};
    const existing = this.db.prepare('SELECT id FROM purchase_requests WHERE id = ?').get(id);
    if (!existing) return null;
    this.db.prepare(`
      UPDATE purchase_requests
      SET product_name = ?, image_path = ?, model = ?, specifications = ?, required_quantity = ?,
        unit = ?, delivery_warehouse = ?, usd_rate = ?, cny_rate = ?, extra_fee_percent = ?,
        extra_fee_vnd = ?, priority = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      pr.product_name || 'Yêu cầu mua hàng',
      pr.image_path || '',
      pr.model || '',
      pr.specifications || '',
      Number(pr.required_quantity || 1),
      pr.unit || '',
      pr.delivery_warehouse || '',
      nullableNumber(pr.usd_rate) ?? 25500,
      nullableNumber(pr.cny_rate) ?? 4000,
      nullableNumber(pr.extra_fee_percent) ?? 0,
      nullableNumber(pr.extra_fee_vnd) ?? 0,
      pr.priority || 'balanced',
      pr.notes || '',
      id,
    );
    this.replaceSuppliers(id, payload.suppliers || []);
    return this.getRequest(id);
  }

  deleteRequest(id) {
    const result = this.db.prepare('DELETE FROM purchase_requests WHERE id = ?').run(id);
    return result.changes > 0;
  }

  replaceSuppliers(requestId, suppliers) {
    this.db.exec('BEGIN');
    try {
      this.db.prepare('DELETE FROM suppliers WHERE request_id = ?').run(requestId);
      const insert = this.db.prepare(`
        INSERT INTO suppliers
        (request_id, supplier_name, source_platform, product_name, product_image, product_url,
          unit_price, currency, shipping_fee, estimated_delivery_days, available_quantity, unit,
          deliver_to_buyer_warehouse, warranty_policy, quality_raw, reputation_raw, review_count,
          rating_count, imported_from, data_status, notes, raw_data, verification_status,
          verification_notes, seller_rating, seller_review_count, seller_years_active,
          negative_review_rate, response_time_hours, return_policy, payment_protection,
          invoice_available, sample_available, risk_flags_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const row of suppliers) {
        insert.run(
          requestId,
          row.supplier_name || '',
          row.source_platform || 'Manual',
          row.product_name || '',
          row.product_image || '',
          row.product_url || '',
          nullableNumber(row.unit_price),
          row.currency || 'VND',
          nullableNumber(row.shipping_fee) ?? 0,
          nullableNumber(row.estimated_delivery_days),
          nullableNumber(row.available_quantity),
          row.unit || '',
          row.deliver_to_buyer_warehouse ? 1 : 0,
          row.warranty_policy || '',
          nullableNumber(row.quality_raw ?? row.quality),
          nullableNumber(row.reputation_raw ?? row.reputation),
          nullableNumber(row.review_count),
          nullableNumber(row.rating_count),
          row.imported_from || 'manual',
          row.data_status || 'manual',
          row.notes || '',
          row.raw_data ? JSON.stringify(row.raw_data) : '',
          row.verification_status || 'unverified',
          row.verification_notes || '',
          nullableNumber(row.seller_rating),
          nullableNumber(row.seller_review_count),
          nullableNumber(row.seller_years_active),
          nullableNumber(row.negative_review_rate),
          nullableNumber(row.response_time_hours),
          row.return_policy || '',
          row.payment_protection ? 1 : 0,
          row.invoice_available ? 1 : 0,
          row.sample_available ? 1 : 0,
          row.risk_flags_json ? JSON.stringify(row.risk_flags_json) : '',
        );
      }
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  saveScores(requestId, rankedRows) {
    this.db.exec('BEGIN');
    try {
      this.db.prepare(`
        DELETE FROM scores
        WHERE supplier_id IN (SELECT id FROM suppliers WHERE request_id = ?)
      `).run(requestId);
      const insert = this.db.prepare(`
        INSERT INTO scores
        (supplier_id, price_score, quality_score, reputation_score, delivery_score, quantity_score,
          warehouse_delivery_score, warranty_score, total_score, total_cost, rank, explanation,
          base_score, risk_penalty, risk_level, decision_label, recommendation_reason, risk_flags_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const row of rankedRows) {
        if (!row.id) continue;
        const score = row.score || {};
        insert.run(
          row.id,
          score.priceScore || 0,
          score.qualityScore || 0,
          score.reputationScore || 0,
          score.deliveryScore || 0,
          score.quantityScore || 0,
          score.warehouseDeliveryScore || 0,
          score.warrantyScore || 0,
          score.totalScore || 0,
          score.totalCost,
          score.rank,
          score.explanation || '',
          score.baseScore || 0,
          score.riskPenalty || 0,
          score.riskLevel || '',
          score.decisionLabel || '',
          score.recommendationReason || '',
          JSON.stringify(score.riskFlags || []),
        );
      }
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
}

function nullableNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function rowToSupplier(row) {
  const score = row.total_score === null || row.total_score === undefined
    ? null
    : {
      priceScore: row.price_score,
      qualityScore: row.quality_score,
      reputationScore: row.reputation_score,
      deliveryScore: row.delivery_score,
      quantityScore: row.quantity_score,
      warehouseDeliveryScore: row.warehouse_delivery_score,
      warrantyScore: row.warranty_score,
      baseScore: row.base_score ?? row.total_score,
      riskPenalty: row.risk_penalty ?? 0,
      riskLevel: row.risk_level || 'low',
      decisionLabel: row.decision_label || '',
      recommendationReason: row.recommendation_reason || '',
      riskFlags: safeJson(row.score_risk_flags_json) || [],
      totalScore: row.total_score,
      totalCost: row.total_cost,
      rank: row.rank,
      explanation: row.explanation,
      rankable: row.rank !== null,
    };
  return {
    id: row.id,
    request_id: row.request_id,
    supplier_name: row.supplier_name,
    source_platform: row.source_platform,
    product_name: row.product_name,
    product_image: row.product_image,
    product_url: row.product_url,
    unit_price: row.unit_price,
    currency: row.currency,
    shipping_fee: row.shipping_fee,
    estimated_delivery_days: row.estimated_delivery_days,
    available_quantity: row.available_quantity,
    unit: row.unit,
    deliver_to_buyer_warehouse: Boolean(row.deliver_to_buyer_warehouse),
    warranty_policy: row.warranty_policy,
    quality_raw: row.quality_raw,
    reputation_raw: row.reputation_raw,
    review_count: row.review_count,
    rating_count: row.rating_count,
    imported_from: row.imported_from,
    data_status: row.data_status,
    verification_status: row.verification_status || 'unverified',
    verification_notes: row.verification_notes || '',
    seller_rating: row.seller_rating,
    seller_review_count: row.seller_review_count,
    seller_years_active: row.seller_years_active,
    negative_review_rate: row.negative_review_rate,
    response_time_hours: row.response_time_hours,
    return_policy: row.return_policy,
    payment_protection: Boolean(row.payment_protection),
    invoice_available: Boolean(row.invoice_available),
    sample_available: Boolean(row.sample_available),
    risk_flags_json: safeJson(row.risk_flags_json),
    notes: row.notes,
    raw_data: safeJson(row.raw_data),
    score,
  };
}

function normalizeSearchText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function safeJson(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

module.exports = {
  AppDatabase,
  DB_PATH,
};
