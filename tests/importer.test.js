const test = require('node:test');
const assert = require('node:assert/strict');
const XLSX = require('xlsx');
const { parseImportContent } = require('../src/importer');

test('imports xlsx rows and maps Vietnamese columns', () => {
  const sheet = XLSX.utils.json_to_sheet([
    {
      'Nhà cung cấp': 'Công ty A',
      'Giá sản phẩm': 120000,
      'Phí vận chuyển': 30000,
      'Ngày giao': 4,
      'Bảo hành': '12 tháng',
      Link: 'https://example.com/a',
    },
  ]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Bao gia');
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  const result = parseImportContent({
    filename: 'bao-gia.xlsx',
    contentBase64: buffer.toString('base64'),
  });
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].supplier_name, 'Công ty A');
  assert.equal(Number(result.rows[0].unit_price), 120000);
  assert.equal(result.warnings.length, 0);
});

test('import preview reports missing supplier data', () => {
  const csv = 'nha cung cap,gia\n,100000\n';
  const result = parseImportContent({
    filename: 'bao-gia.csv',
    contentBase64: Buffer.from(csv, 'utf8').toString('base64'),
  });
  assert.equal(result.rows.length, 1);
  assert.ok(result.warnings[0].issues.includes('thiếu tên nhà cung cấp'));
  assert.ok(result.warnings[0].issues.includes('thiếu phí vận chuyển'));
});
