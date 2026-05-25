const https = require('https');

const PLATFORMS = [
  {
    name: 'Shopee',
    searchUrl: (q) => `https://shopee.vn/search?keyword=${encodeURIComponent(q)}`,
  },
  {
    name: 'Tiki',
    searchUrl: (q) => `https://tiki.vn/search?q=${encodeURIComponent(q)}`,
  },
  {
    name: 'Alibaba',
    searchUrl: (q) => `https://www.alibaba.com/trade/search?SearchText=${encodeURIComponent(q)}`,
  },
  {
    name: 'Taobao',
    searchUrl: (q) => `https://s.taobao.com/search?q=${encodeURIComponent(q)}`,
  },
  {
    name: '1688',
    searchUrl: (q) => `https://s.1688.com/selloffer/offer_search.htm?keywords=${encodeURIComponent(q)}`,
  },
];

async function fetchMarketplaceCandidates(query, model = '') {
  const searchText = [query, model].filter(Boolean).join(' ').trim();
  if (!searchText) return [];
  const results = await Promise.all(PLATFORMS.map((platform) => fetchPlatform(platform, searchText)));
  return results.flat();
}

async function fetchPlatform(platform, searchText) {
  const url = platform.searchUrl(searchText);
  try {
    const html = await getText(url, 8000);
    const title = extractTitle(html) || `${platform.name}: ${searchText}`;
    const price = extractFirstPrice(html);
    const rating = extractRating(html);
    return [{
      source_platform: platform.name,
      supplier_name: `${platform.name} - cần kiểm tra`,
      product_name: title.slice(0, 160),
      product_url: url,
      product_image: '',
      unit_price: price,
      currency: platform.name === 'Alibaba' ? 'USD' : platform.name === 'Taobao' || platform.name === '1688' ? 'CNY' : 'VND',
      shipping_fee: null,
      estimated_delivery_days: null,
      available_quantity: null,
      rating,
      quality_raw: rating,
      reputation_raw: null,
      review_count: null,
      warranty_policy: '',
      imported_from: 'public_search',
      data_status: price ? 'missing_data' : 'manual_required',
      raw_data: {
        fetched_at: new Date().toISOString(),
        note: 'Dữ liệu công khai được trích xuất sơ bộ từ HTML tìm kiếm. Người dùng cần mở link để kiểm tra và bổ sung.',
      },
    }];
  } catch (error) {
    return [{
      source_platform: platform.name,
      supplier_name: `${platform.name} - chưa lấy được dữ liệu`,
      product_name: searchText,
      product_url: url,
      product_image: '',
      unit_price: null,
      currency: platform.name === 'Alibaba' ? 'USD' : platform.name === 'Taobao' || platform.name === '1688' ? 'CNY' : 'VND',
      shipping_fee: null,
      estimated_delivery_days: null,
      available_quantity: null,
      rating: null,
      quality_raw: null,
      reputation_raw: null,
      review_count: null,
      warranty_policy: '',
      imported_from: 'public_search',
      data_status: error.code === 'TIMEOUT' ? 'blocked' : 'manual_required',
      raw_data: {
        fetched_at: new Date().toISOString(),
        error: error.message,
        note: 'Sàn có thể chặn crawler, cần mở link nguồn và nhập tay dữ liệu còn thiếu.',
      },
    }];
  }
}

function getText(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'user-agent': 'Mozilla/5.0 SupplierComparisonLocalApp/1.0',
        accept: 'text/html,application/xhtml+xml',
      },
    }, (res) => {
      if (res.statusCode && res.statusCode >= 400) {
        res.resume();
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        body += chunk;
        if (body.length > 600000) req.destroy();
      });
      res.on('end', () => resolve(body));
    });
    req.setTimeout(timeoutMs, () => {
      const err = new Error('Request timeout');
      err.code = 'TIMEOUT';
      req.destroy(err);
    });
    req.on('error', reject);
  });
}

function extractTitle(html) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!match) return '';
  return decodeEntities(stripTags(match[1])).replace(/\s+/g, ' ').trim();
}

function extractFirstPrice(html) {
  const patterns = [
    /(?:₫|đ|VND)\s*([\d.,]+)/i,
    /(?:¥|￥|CNY)\s*([\d.,]+)/i,
    /(?:\$|USD)\s*([\d.,]+)/i,
    /"price"\s*:\s*"?([\d.]+)"?/i,
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) {
      const number = Number(String(match[1]).replace(/[,.](?=\d{3}\b)/g, '').replace(',', '.'));
      if (Number.isFinite(number) && number > 0) return number;
    }
  }
  return null;
}

function extractRating(html) {
  const match = html.match(/"ratingValue"\s*:\s*"?([\d.]+)"?/i) || html.match(/([\d.]+)\s*\/\s*5/);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

function stripTags(value) {
  return String(value).replace(/<[^>]+>/g, '');
}

function decodeEntities(value) {
  return String(value)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

module.exports = {
  PLATFORMS,
  fetchMarketplaceCandidates,
};
