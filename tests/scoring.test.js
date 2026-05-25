const test = require('node:test');
const assert = require('node:assert/strict');
const { scoreSuppliers, warrantyScore, currencyRate } = require('../src/scoring');

const request = {
  product_name: 'Máy bơm',
  required_quantity: 100,
  unit: 'cái',
};

test('returns top 5 by weighted score', () => {
  const suppliers = Array.from({ length: 10 }, (_, index) => ({
    supplier_name: `NCC ${index + 1}`,
    unit_price: 100000 + index * 1000,
    shipping_fee: 200000,
    estimated_delivery_days: 3 + index,
    available_quantity: 100 + index,
    deliver_to_buyer_warehouse: index < 7,
    quality_raw: 90 - index,
    reputation_raw: 85 - index,
    warranty_policy: '12 tháng',
  }));
  const result = scoreSuppliers(request, suppliers);
  assert.equal(result.top5.length, 5);
  assert.equal(result.ranked[0].score.rank, 1);
  assert.ok(result.ranked[0].score.totalScore > result.ranked[5].score.totalScore);
});

test('cheap but low reputation supplier is not automatically first', () => {
  const result = scoreSuppliers(request, [
    {
      supplier_name: 'Rẻ nhưng rủi ro',
      unit_price: 70000,
      shipping_fee: 0,
      estimated_delivery_days: 15,
      available_quantity: 100,
      deliver_to_buyer_warehouse: false,
      quality_raw: 25,
      reputation_raw: 10,
      warranty_policy: 'không bảo hành',
    },
    {
      supplier_name: 'Cân bằng tốt',
      unit_price: 82000,
      shipping_fee: 0,
      estimated_delivery_days: 3,
      available_quantity: 200,
      deliver_to_buyer_warehouse: true,
      quality_raw: 95,
      reputation_raw: 95,
      warranty_policy: '24 tháng',
    },
  ]);
  assert.equal(result.top5[0].supplier_name, 'Cân bằng tốt');
});

test('supplier without price is not rankable', () => {
  const result = scoreSuppliers(request, [
    { supplier_name: 'Thiếu giá', quality_raw: 100, reputation_raw: 100 },
    { supplier_name: 'Có giá', unit_price: 100000, shipping_fee: 0 },
  ]);
  const missing = result.ranked.find((row) => row.supplier_name === 'Thiếu giá');
  assert.equal(missing.score.rankable, false);
  assert.equal(missing.score.rank, null);
});

test('quantity score rewards suppliers that can fulfill the required quantity', () => {
  const result = scoreSuppliers(request, [
    { supplier_name: 'Thiếu hàng', unit_price: 100000, shipping_fee: 0, available_quantity: 50 },
    { supplier_name: 'Đủ hàng', unit_price: 100000, shipping_fee: 0, available_quantity: 100 },
  ]);
  const low = result.ranked.find((row) => row.supplier_name === 'Thiếu hàng');
  const ok = result.ranked.find((row) => row.supplier_name === 'Đủ hàng');
  assert.ok(ok.score.quantityScore > low.score.quantityScore);
});

test('shipping fee contributes to total cost and price score', () => {
  const result = scoreSuppliers(request, [
    { supplier_name: 'Ship cao', unit_price: 100000, shipping_fee: 1000000 },
    { supplier_name: 'Ship thấp', unit_price: 100000, shipping_fee: 0 },
  ]);
  assert.equal(result.ranked[0].supplier_name, 'Ship thấp');
  assert.ok(result.ranked[0].score.priceScore > result.ranked[1].score.priceScore);
});

test('warranty text is converted into a normalized score', () => {
  assert.ok(warrantyScore('24 tháng') > warrantyScore('3 tháng'));
  assert.ok(warrantyScore('không bảo hành') < warrantyScore('12 tháng'));
  assert.equal(warrantyScore('12'), warrantyScore('12 tháng'));
});

test('foreign currency is converted by purchase request exchange rates', () => {
  const result = scoreSuppliers(
    { ...request, required_quantity: 2, usd_rate: 25000, extra_fee_percent: 10, extra_fee_vnd: 5000 },
    [{ supplier_name: 'USD supplier', unit_price: 10, currency: 'USD', shipping_fee: 2 }],
  );
  assert.equal(currencyRate({ usd_rate: 25000 }, 'USD'), 25000);
  assert.equal(result.ranked[0].score.totalCost, ((10 * 25000 * 2) + (2 * 25000)) * 1.1 + 5000);
});

test('custom weights are applied when they sum to 100', () => {
  const result = scoreSuppliers(request, [
    { supplier_name: 'A', unit_price: 100, shipping_fee: 0, quality_raw: 100, reputation_raw: 100 },
  ], {
    weights: { price: 50, quality: 20, reputation: 10, delivery: 10, quantity: 5, warehouseDelivery: 3, warranty: 2 },
  });
  assert.equal(result.weights.price, 50);
  assert.ok(result.ranked[0].score.priceScore <= 50);
});

test('risk penalty lowers suspicious cheap suppliers', () => {
  const result = scoreSuppliers(request, [
    {
      supplier_name: 'Rất rẻ nhưng thiếu xác minh',
      unit_price: 50000,
      shipping_fee: null,
      estimated_delivery_days: null,
      available_quantity: 100,
      quality_raw: 60,
      reputation_raw: 30,
      warranty_policy: '',
      data_status: 'manual_required',
    },
    {
      supplier_name: 'NCC đã kiểm nguồn',
      unit_price: 78000,
      shipping_fee: 100000,
      estimated_delivery_days: 4,
      available_quantity: 200,
      deliver_to_buyer_warehouse: true,
      quality_raw: 92,
      reputation_raw: 92,
      warranty_policy: '12 tháng',
      product_url: 'https://example.com/quote',
      verification_status: 'source_checked',
      review_count: 120,
    },
  ]);
  assert.equal(result.top5[0].supplier_name, 'NCC đã kiểm nguồn');
  const risky = result.ranked.find((row) => row.supplier_name === 'Rất rẻ nhưng thiếu xác minh');
  assert.ok(risky.score.riskPenalty > 0);
  assert.equal(risky.score.decisionLabel, 'Cần kiểm tra');
});

test('missing source and warranty become risk flags', () => {
  const result = scoreSuppliers(request, [
    {
      supplier_name: 'Thiếu kiểm chứng',
      unit_price: 100000,
      shipping_fee: 0,
      estimated_delivery_days: 3,
      quality_raw: 80,
      reputation_raw: 80,
    },
  ]);
  const row = result.ranked[0];
  assert.ok(row.score.riskFlags.some((flag) => flag.includes('link nguồn')));
  assert.ok(row.score.riskFlags.some((flag) => flag.includes('bảo hành')));
  assert.ok(row.score.riskPenalty > 0);
});
