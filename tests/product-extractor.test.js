const test = require('node:test');
const assert = require('node:assert/strict');
const { inferProductFields } = require('../src/product-extractor');

test('infers product fields from labeled Vietnamese text', () => {
  const fields = inferProductFields(`
Tên sản phẩm: Máy bơm nước công nghiệp
Model: MB-220V
Thông số kỹ thuật:
Công suất 2.2kW
Điện áp 220V
Số lượng: 10 cái
Đơn vị: cái
Kho nhận hàng: Kho Hà Nội
`);
  assert.equal(fields.product_name, 'Máy bơm nước công nghiệp');
  assert.equal(fields.model, 'MB-220V');
  assert.equal(fields.required_quantity, 10);
  assert.equal(fields.unit, 'cái');
  assert.equal(fields.delivery_warehouse, 'Kho Hà Nội');
  assert.match(fields.specifications, /2\.2kW/);
});
