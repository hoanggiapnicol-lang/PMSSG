const test = require('node:test');
const assert = require('node:assert/strict');
const { buildExcelXml } = require('../src/exporter');

test('exported Excel XML includes borders and Times New Roman styles', () => {
  const xml = buildExcelXml(
    { id: 1, product_name: 'Máy bơm', required_quantity: 1 },
    [{
      supplier_name: 'NCC A',
      score: { rankable: true, rank: 1, totalScore: 90, baseScore: 95, riskPenalty: 5 },
    }],
    { weights: { price: 30 } },
  );
  assert.match(xml, /Times New Roman/);
  assert.match(xml, /ss:ID="Header"/);
  assert.match(xml, /ss:Position="Bottom"/);
  assert.match(xml, /Checklist kiem chung/);
});
