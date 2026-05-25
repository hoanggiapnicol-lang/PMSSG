const XLSX = require('xlsx');

function parseImportContent({ filename = 'import', contentBase64 = '' } = {}) {
  if (!contentBase64) {
    return { rows: [], warnings: [{ row: 0, issues: ['file rỗng hoặc chưa có dữ liệu'] }], detectedColumns: [] };
  }
  const buffer = Buffer.from(contentBase64, 'base64');
  const ext = filename.toLowerCase().split('.').pop();
  const rawRows = readRows(buffer, ext);
  const detectedColumns = rawRows[0] ? Object.keys(rawRows[0]) : [];
  const rows = rawRows.map(normalizeImportedRow);
  const warnings = rows
    .map((row, index) => ({ row: index + 1, issues: validateSupplierRow(row) }))
    .filter((item) => item.issues.length);
  return { rows, warnings, detectedColumns };
}

function readRows(buffer, ext) {
  const text = buffer.toString('utf8');
  if (ext === 'json') {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : parsed.suppliers || parsed.rows || [];
  }
  if (ext === 'csv' || ext === 'tsv' || ext === 'txt') {
    return parseDelimited(text, ext === 'tsv' ? '\t' : undefined);
  }
  if (ext === 'xls' && text.includes('<Workbook')) {
    return parseExcelXml(text);
  }
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) return [];
  return XLSX.utils.sheet_to_json(workbook.Sheets[firstSheetName], { defval: '', raw: false });
}

function parseDelimited(text, forcedDelimiter) {
  const lines = String(text).split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return [];
  const delimiter = forcedDelimiter || (lines[0].includes('\t') ? '\t' : ',');
  const headers = splitLine(lines[0], delimiter).map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const values = splitLine(line, delimiter);
    return Object.fromEntries(headers.map((h, index) => [h, values[index] ?? '']));
  });
}

function splitLine(line, delimiter) {
  const values = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === delimiter && !quoted) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current.trim());
  return values;
}

function parseExcelXml(text) {
  const rows = [...String(text).matchAll(/<Row>([\s\S]*?)<\/Row>/g)]
    .map((match) => [...match[1].matchAll(/<Data[^>]*>([\s\S]*?)<\/Data>/g)].map((cell) => decodeXml(cell[1])));
  const headerIndex = rows.findIndex((row) => row.some((cell) => /nha cung cap|nhà cung cấp|supplier/i.test(cell)));
  if (headerIndex < 0) return [];
  const headers = rows[headerIndex];
  return rows.slice(headerIndex + 1).map((row) => Object.fromEntries(headers.map((h, i) => [h, row[i] ?? ''])));
}

function normalizeImportedRow(row) {
  const aliases = {
    supplier_name: ['supplier_name', 'supplier', 'vendor', 'ncc', 'nha cung cap', 'nhà cung cấp', 'ten nha cung cap', 'tên nhà cung cấp'],
    available_quantity: ['available_quantity', 'so luong', 'số lượng', 'so luong cung cap', 'moq', 'ton kho'],
    unit: ['unit', 'don vi', 'đơn vị'],
    unit_price: ['unit_price', 'price', 'gia', 'giá', 'don gia', 'đơn giá', 'gia ban', 'gia san pham', 'giá sản phẩm'],
    shipping_fee: ['shipping_fee', 'shipping', 'phi van chuyen', 'phí vận chuyển', 'phi ship', 'ship'],
    estimated_delivery_days: ['estimated_delivery_days', 'lead time', 'thoi gian giao hang', 'ngay giao', 'ngày giao'],
    deliver_to_buyer_warehouse: ['deliver_to_buyer_warehouse', 'giao hang tai kho', 'giao tận kho', 'giao kho ben mua'],
    product_url: ['product_url', 'url', 'link', 'link san pham', 'link sản phẩm', 'link bao gia'],
    quality_raw: ['quality', 'quality_raw', 'chat luong', 'chất lượng'],
    reputation_raw: ['reputation', 'reputation_raw', 'uy tin', 'uy tín'],
    warranty_policy: ['warranty_policy', 'bao hanh', 'bảo hành'],
    source_platform: ['source_platform', 'san', 'sàn'],
    review_count: ['review_count', 'reviews', 'so review', 'số review', 'luot danh gia'],
    verification_status: ['verification_status', 'xac minh', 'xác minh', 'trang thai xac minh'],
    verification_notes: ['verification_notes', 'ghi chu xac minh', 'ghi chú xác minh'],
  };
  const normalized = {};
  const entries = Object.entries(row).map(([key, value]) => [normalizeKey(key), value]);
  for (const [field, keys] of Object.entries(aliases)) {
    const normalizedKeys = keys.map(normalizeKey);
    const found = entries.find(([key]) => normalizedKeys.includes(key));
    if (found) normalized[field] = found[1];
  }
  normalized.deliver_to_buyer_warehouse = truthy(normalized.deliver_to_buyer_warehouse);
  normalized.verification_status = normalizeVerificationStatus(normalized.verification_status);
  return normalized;
}

function validateSupplierRow(row) {
  const issues = [];
  if (!row.supplier_name) issues.push('thiếu tên nhà cung cấp');
  if (numberOrNull(row.unit_price) === null) issues.push('thiếu giá');
  if (numberOrNull(row.shipping_fee) === null) issues.push('thiếu phí vận chuyển');
  if (numberOrNull(row.estimated_delivery_days) === null) issues.push('thiếu thời gian giao hàng');
  if (!row.warranty_policy) issues.push('thiếu bảo hành');
  if (!row.product_url) issues.push('thiếu link nguồn');
  return issues;
}

function normalizeVerificationStatus(value) {
  const key = normalizeKey(value);
  if (['approved', 'da duyet', 'chap nhan'].includes(key)) return 'approved';
  if (['sample checked', 'da test mau', 'da kiem mau'].includes(key)) return 'sample_checked';
  if (['source checked', 'da kiem link', 'da kiem nguon'].includes(key)) return 'source_checked';
  if (['rejected', 'loai', 'khong chon'].includes(key)) return 'rejected';
  return 'unverified';
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(String(value).replace(/[^\d,.\-]/g, '').replace(/,(?=\d{3}(\D|$))/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function normalizeKey(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function truthy(value) {
  const text = normalizeKey(value);
  return ['co', 'yes', 'true', '1', 'dat', 'ok'].includes(text);
}

function decodeXml(value) {
  return String(value)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

module.exports = {
  parseImportContent,
  normalizeImportedRow,
  validateSupplierRow,
};
