const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { AppDatabase } = require('../src/db');

test('suggestions come from SQLite history and ignore Vietnamese accents', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'supplier-app-'));
  const dbPath = path.join(dir, 'app.sqlite');
  const appDb = new AppDatabase(dbPath);
  appDb.createRequest({
    purchaseRequest: {
      product_name: 'Máy bơm nước công nghiệp',
      model: 'ABC-220V',
      required_quantity: 2,
      delivery_warehouse: 'Kho Hà Nội',
    },
    suppliers: [{ supplier_name: 'Nhà cung cấp Minh Long', unit_price: 100000, shipping_fee: 0 }],
  });

  assert.equal(appDb.listSuggestions('products', 'may bom')[0].value, 'Máy bơm nước công nghiệp');
  assert.equal(appDb.listSuggestions('warehouses', 'ha noi')[0].value, 'Kho Hà Nội');
  assert.equal(appDb.listSuggestions('suppliers', 'minh long')[0].value, 'Nhà cung cấp Minh Long');

  appDb.db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
