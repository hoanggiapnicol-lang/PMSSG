const XLSX = require('xlsx');
const { PDFParse } = require('pdf-parse');
const { createWorker } = require('tesseract.js');

async function extractProductInfo({ filename = 'product-file', contentBase64 = '' } = {}) {
  if (!contentBase64) {
    return { fields: {}, text: '', warnings: ['Chưa có dữ liệu file.'] };
  }
  const buffer = Buffer.from(contentBase64, 'base64');
  const ext = String(filename).toLowerCase().split('.').pop();
  const warnings = [];
  let text = '';

  if (['xlsx', 'xls', 'csv', 'tsv'].includes(ext)) {
    text = extractTextFromSpreadsheet(buffer, ext);
  } else if (ext === 'pdf') {
    text = await extractTextFromPdf(buffer);
  } else if (['png', 'jpg', 'jpeg', 'webp', 'bmp', 'tif', 'tiff'].includes(ext)) {
    const ocr = await extractTextFromImage(buffer).catch((error) => {
      warnings.push(`OCR ảnh chưa đọc được: ${error.message}`);
      return '';
    });
    text = ocr;
  } else {
    warnings.push('Định dạng file chưa hỗ trợ tự đọc.');
  }

  const fields = inferProductFields(text);
  if (!Object.keys(fields).length) {
    warnings.push('Chưa nhận diện được trường rõ ràng, vui lòng kiểm tra nội dung file và nhập bổ sung.');
  }
  return {
    fields,
    text: text.slice(0, 8000),
    warnings,
  };
}

function extractTextFromSpreadsheet(buffer, ext) {
  if (ext === 'csv' || ext === 'tsv') return buffer.toString('utf8');
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const lines = [];
  for (const sheetName of workbook.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: '', raw: false });
    lines.push(`Sheet: ${sheetName}`);
    for (const row of rows) {
      const text = row.map((cell) => String(cell || '').trim()).filter(Boolean).join(' | ');
      if (text) lines.push(text);
    }
  }
  return lines.join('\n');
}

async function extractTextFromPdf(buffer) {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return result.text || '';
  } finally {
    await parser.destroy();
  }
}

async function extractTextFromImage(buffer) {
  let worker;
  try {
    worker = await createWorker('vie+eng');
  } catch {
    worker = await createWorker('eng');
  }
  try {
    const result = await worker.recognize(buffer);
    return result.data?.text || '';
  } finally {
    await worker.terminate();
  }
}

function inferProductFields(text) {
  const normalizedText = String(text || '').replace(/\r/g, '\n');
  const lines = normalizedText
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const fields = {};

  fields.product_name = findLabeledValue(lines, [
    'ten san pham', 'tên sản phẩm', 'san pham', 'sản phẩm', 'product name', 'product',
    'item name', 'hang hoa', 'hàng hóa',
  ]);
  fields.model = findLabeledValue(lines, [
    'model', 'ma hang', 'mã hàng', 'ma san pham', 'mã sản phẩm', 'sku', 'part no', 'part number',
  ]) || findModelByPattern(lines);
  fields.required_quantity = findLabeledValue(lines, [
    'so luong', 'số lượng', 'qty', 'quantity', 'sl',
  ]);
  fields.unit = findLabeledValue(lines, [
    'don vi tinh', 'đơn vị tính', 'don vi', 'đơn vị', 'unit',
  ]);
  fields.delivery_warehouse = findLabeledValue(lines, [
    'kho nhan hang', 'kho nhận hàng', 'dia chi giao hang', 'địa chỉ giao hàng', 'delivery address',
    'warehouse', 'ship to',
  ]);

  const specs = collectSpecificationLines(lines);
  if (specs) fields.specifications = specs;

  if (!fields.product_name) {
    const firstLikelyName = lines.find((line) => !looksLikeLabelOnly(line) && line.length >= 4 && !/sheet\s*:/i.test(line));
    if (firstLikelyName) fields.product_name = cleanupValue(firstLikelyName);
  }

  if (fields.required_quantity) {
    const quantity = parseNumber(fields.required_quantity);
    fields.required_quantity = quantity || fields.required_quantity;
  }

  for (const key of Object.keys(fields)) {
    if (fields[key] === '' || fields[key] === null || fields[key] === undefined) delete fields[key];
  }
  return fields;
}

function findLabeledValue(lines, labels) {
  const normalizedLabels = labels.map(normalizeSearchText);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const normalizedLine = normalizeSearchText(line);
    const matched = normalizedLabels.find((label) => normalizedLine.startsWith(label) || normalizedLine.includes(`${label} `));
    if (!matched) continue;
    const inline = valueAfterLabel(line);
    if (inline) return cleanupValue(inline);
    const next = lines[i + 1];
    if (next && !looksLikeLabelOnly(next)) return cleanupValue(next);
  }
  return '';
}

function valueAfterLabel(line) {
  const parts = String(line).split(/[:：]| - | – |\|/);
  if (parts.length < 2) return '';
  return parts.slice(1).join(' ').trim();
}

function findModelByPattern(lines) {
  const pattern = /\b[A-Z0-9]{2,}[-_/][A-Z0-9][A-Z0-9\-_/]{1,}\b/i;
  const found = lines.map((line) => line.match(pattern)?.[0]).find(Boolean);
  return found || '';
}

function collectSpecificationLines(lines) {
  const startIndex = lines.findIndex((line) => {
    const key = normalizeSearchText(line);
    return key.includes('thong so') || key.includes('thông số') || key.includes('specification') || key.includes('technical');
  });
  if (startIndex >= 0) {
    const first = valueAfterLabel(lines[startIndex]);
    const collected = first ? [first] : [];
    for (let i = startIndex + 1; i < Math.min(lines.length, startIndex + 12); i += 1) {
      if (isStopField(lines[i])) break;
      collected.push(lines[i]);
    }
    return collected.map(cleanupValue).filter(Boolean).join('\n');
  }

  const specCandidates = lines.filter((line) => /(\d+\s?(mm|cm|m|kg|g|w|kw|v|hz|inch|mpa|bar)|ip\d{2}|inox|thép|thep|nhựa|nhua|công suất|cong suat|điện áp|dien ap)/i.test(line));
  return specCandidates.slice(0, 10).join('\n');
}

function isStopField(line) {
  const key = normalizeSearchText(line);
  return ['so luong', 'don vi', 'kho nhan hang', 'dia chi', 'bao hanh', 'gia', 'price', 'quantity', 'unit'].some((label) => key.startsWith(label));
}

function looksLikeLabelOnly(line) {
  return /[:：]\s*$/.test(line) || normalizeSearchText(line).split(' ').length <= 2 && line.length < 18;
}

function parseNumber(value) {
  const match = String(value).match(/[\d.,]+/);
  if (!match) return null;
  const parsed = Number(match[0].replace(/,(?=\d{3}(\D|$))/g, '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function cleanupValue(value) {
  return String(value || '')
    .replace(/^[\s:：\-–|]+/, '')
    .replace(/\s+/g, ' ')
    .trim();
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

module.exports = {
  extractProductInfo,
  inferProductFields,
};
