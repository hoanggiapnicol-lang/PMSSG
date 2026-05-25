const DEFAULT_WEIGHTS = Object.freeze({
  price: 30,
  quality: 25,
  reputation: 20,
  delivery: 10,
  quantity: 5,
  warehouseDelivery: 5,
  warranty: 5,
});

const WEIGHT_KEYS = Object.keys(DEFAULT_WEIGHTS);

function toNumber(value, fallback = null) {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
  const cleaned = String(value)
    .replace(/[^\d,.\-]/g, '')
    .replace(/,(?=\d{3}(\D|$))/g, '')
    .replace(',', '.');
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function normalizeScore(value, fallback = 50) {
  const n = toNumber(value, null);
  if (n === null) return fallback;
  if (n <= 5) return clamp((n / 5) * 100);
  return clamp(n);
}

function normalizeBool(value) {
  if (typeof value === 'boolean') return value;
  const text = String(value ?? '').trim().toLowerCase();
  if (!text) return false;
  return ['yes', 'y', 'true', '1', 'co', 'có', 'có giao', 'dat', 'đạt', 'ok'].includes(text);
}

function warrantyScore(policy) {
  const text = String(policy ?? '').trim().toLowerCase();
  if (!text) return 30;
  if (/(không|khong|no warranty|none)/.test(text)) return 10;
  if (/^\d+([.,]\d+)?$/.test(text)) {
    const months = toNumber(text, 0);
    if (months >= 24) return 100;
    if (months >= 12) return 85;
    if (months >= 6) return 70;
    return 55;
  }
  const monthMatch = text.match(/(\d+)\s*(tháng|thang|month|months)/);
  const yearMatch = text.match(/(\d+)\s*(năm|nam|year|years)/);
  const months = yearMatch ? Number(yearMatch[1]) * 12 : monthMatch ? Number(monthMatch[1]) : null;
  if (months !== null) {
    if (months >= 24) return 100;
    if (months >= 12) return 85;
    if (months >= 6) return 70;
    return 55;
  }
  if (/(rõ|ro|đổi trả|doi tra|bảo hành|bao hanh|warranty|return)/.test(text)) return 70;
  return 50;
}

function normalizeWeights(inputWeights = null) {
  const source = inputWeights && typeof inputWeights === 'object' ? inputWeights : DEFAULT_WEIGHTS;
  const weights = {};
  let total = 0;
  for (const key of WEIGHT_KEYS) {
    const value = toNumber(source[key], DEFAULT_WEIGHTS[key]);
    weights[key] = Math.max(0, value);
    total += weights[key];
  }
  if (!Number.isFinite(total) || Math.round(total * 100) / 100 !== 100) {
    return { ...DEFAULT_WEIGHTS };
  }
  return weights;
}

function currencyRate(purchaseRequest, currency) {
  const normalized = String(currency || 'VND').trim().toUpperCase();
  if (!normalized || normalized === 'VND' || normalized === 'VNĐ') return 1;
  if (normalized === 'USD') return Math.max(0, toNumber(purchaseRequest.usd_rate, 25500));
  if (normalized === 'CNY' || normalized === 'RMB' || normalized === '¥' || normalized === '￥') {
    return Math.max(0, toNumber(purchaseRequest.cny_rate, 4000));
  }
  return Math.max(0, toNumber(purchaseRequest[`${normalized.toLowerCase()}_rate`], 1));
}

function totalCostForSupplier(purchaseRequest, supplier, requiredQuantity) {
  const unitPrice = toNumber(supplier.unit_price, null);
  if (unitPrice === null) {
    return {
      unitPrice,
      shippingFee: toNumber(supplier.shipping_fee, 0),
      convertedUnitPrice: null,
      convertedShippingFee: 0,
      exchangeRate: currencyRate(purchaseRequest, supplier.currency),
      totalBeforeFees: null,
      totalCost: null,
    };
  }

  const shippingFee = toNumber(supplier.shipping_fee, 0);
  const exchangeRate = currencyRate(purchaseRequest, supplier.currency);
  const convertedUnitPrice = unitPrice * exchangeRate;
  const convertedShippingFee = shippingFee * exchangeRate;
  const totalBeforeFees = convertedUnitPrice * requiredQuantity + convertedShippingFee;
  const extraPercent = Math.max(0, toNumber(purchaseRequest.extra_fee_percent, 0));
  const extraFixed = Math.max(0, toNumber(purchaseRequest.extra_fee_vnd, 0));
  const totalCost = totalBeforeFees * (1 + extraPercent / 100) + extraFixed;
  return {
    unitPrice,
    shippingFee,
    convertedUnitPrice,
    convertedShippingFee,
    exchangeRate,
    totalBeforeFees,
    totalCost,
  };
}

function explainSupplier(supplier, score, weights) {
  const parts = [];
  if (score.totalCost !== null) parts.push(`Tổng chi phí ${formatMoney(score.totalCost)}.`);
  parts.push(`Giá ${formatPoint(score.priceScore)}/${weights.price}.`);
  parts.push(`Chất lượng ${formatPoint(score.qualityScore)}/${weights.quality}.`);
  parts.push(`Uy tín ${formatPoint(score.reputationScore)}/${weights.reputation}.`);
  if (score.quantityScore >= weights.quantity) parts.push('Đáp ứng đủ số lượng.');
  if (normalizeBool(supplier.deliver_to_buyer_warehouse)) parts.push('Có giao tận kho.');
  if (supplier.warranty_policy) parts.push('Có thông tin bảo hành.');
  return parts.join(' ');
}

function formatPoint(value) {
  return Math.round(value * 10) / 10;
}

function formatMoney(value) {
  return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(value);
}

function getMissingFields(supplier) {
  const missing = [];
  if (toNumber(supplier.unit_price, null) === null) missing.push('unit_price');
  if (toNumber(supplier.shipping_fee, null) === null) missing.push('shipping_fee');
  if (toNumber(supplier.estimated_delivery_days, null) === null) missing.push('estimated_delivery_days');
  if (!String(supplier.warranty_policy ?? '').trim()) missing.push('warranty_policy');
  if (!String(supplier.product_url ?? '').trim()) missing.push('product_url');
  if (!String(supplier.supplier_name ?? '').trim()) missing.push('supplier_name');
  return missing;
}

function buildStrengthsAndRisks(supplier, score, weights) {
  const strengths = [];
  const risks = [];
  if (!score.rankable) risks.push('Thiếu giá nên chưa thể xếp hạng.');
  if (score.priceScore >= weights.price * 0.8) strengths.push('Giá cạnh tranh.');
  if (score.priceScore <= weights.price * 0.25 && weights.price > 0) risks.push('Giá cao so với nhóm so sánh.');
  if (score.qualityScore >= weights.quality * 0.85) strengths.push('Chất lượng tốt.');
  if (score.reputationScore >= weights.reputation * 0.85) strengths.push('Uy tín cao.');
  if (score.deliveryScore >= weights.delivery * 0.85) strengths.push('Giao hàng nhanh.');
  if (score.quantityScore >= weights.quantity) strengths.push('Đáp ứng đủ số lượng.');
  if (score.quantityScore < weights.quantity && weights.quantity > 0) risks.push('Chưa đáp ứng đủ số lượng yêu cầu.');
  if (score.warehouseDeliveryScore >= weights.warehouseDelivery) strengths.push('Có giao tận kho.');
  if (score.warehouseDeliveryScore === 0 && weights.warehouseDelivery > 0) risks.push('Chưa xác nhận giao tận kho.');
  if (score.warrantyScore < weights.warranty * 0.5 && weights.warranty > 0) risks.push('Bảo hành yếu hoặc chưa rõ.');
  for (const field of score.missingFields) {
    risks.push(`Thiếu ${missingFieldLabel(field)}.`);
  }
  return { strengths, risks: [...new Set(risks)] };
}

function missingFieldLabel(field) {
  return {
    unit_price: 'giá',
    shipping_fee: 'phí vận chuyển',
    estimated_delivery_days: 'thời gian giao hàng',
    warranty_policy: 'bảo hành',
    product_url: 'link nguồn',
    supplier_name: 'tên nhà cung cấp',
  }[field] || field;
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function statusRisk(status) {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'blocked') return { points: 25, flag: 'Dữ liệu nguồn bị chặn.' };
  if (normalized === 'manual_required') return { points: 15, flag: 'Dữ liệu nguồn cần nhập tay xác minh.' };
  if (normalized === 'missing_data') return { points: 8, flag: 'Dữ liệu nguồn còn thiếu.' };
  return { points: 0, flag: '' };
}

function verificationAdjustment(status) {
  const normalized = String(status || 'unverified').toLowerCase();
  if (normalized === 'rejected') return { points: 30, flag: 'Nhà cung cấp đã bị đánh dấu loại bỏ.' };
  if (normalized === 'approved') return { points: -5, flag: '' };
  if (normalized === 'sample_checked') return { points: -3, flag: '' };
  if (normalized === 'source_checked') return { points: -2, flag: '' };
  return { points: 0, flag: 'Nhà cung cấp chưa được xác minh.' };
}

function buildRiskAssessment(supplier, score, context) {
  const flags = [];
  let penalty = 0;

  const add = (points, label) => {
    if (!label || points === 0) return;
    flags.push(label);
    penalty += points;
  };

  for (const field of score.missingFields) {
    const points = {
      product_url: 8,
      warranty_policy: 8,
      shipping_fee: 6,
      estimated_delivery_days: 5,
      supplier_name: 4,
      unit_price: 100,
    }[field] || 3;
    add(points, `Thiếu ${missingFieldLabel(field)}.`);
  }

  const sourceRisk = statusRisk(supplier.data_status);
  add(sourceRisk.points, sourceRisk.flag);

  const verification = verificationAdjustment(supplier.verification_status);
  add(verification.points, verification.flag);
  if (verification.points < 0) penalty += verification.points;

  if (score.reputationNorm < 40) add(12, 'Uy tín thấp, cần kiểm tra kỹ review xấu.');
  else if (score.reputationNorm < 60) add(6, 'Uy tín chưa đủ mạnh.');

  const reviews = toNumber(supplier.review_count ?? supplier.seller_review_count, null);
  const source = String(supplier.source_platform || '').toLowerCase();
  if (reviews !== null && reviews < 10) add(4, 'Số lượng review còn ít.');
  if (reviews === null && source && source !== 'manual') add(4, 'Chưa có số lượng review để đối chiếu.');

  const negativeRate = toNumber(supplier.negative_review_rate, null);
  if (negativeRate !== null && negativeRate >= 15) add(10, 'Tỷ lệ review xấu cao.');

  if (score.warrantyNorm < 50) add(7, 'Bảo hành yếu hoặc không rõ đổi trả.');
  if (score.warehouseNorm === 0) add(3, 'Chưa xác nhận giao tận kho.');

  if (
    score.rankable
    && context.medianCost
    && score.totalCost < context.medianCost * 0.75
    && (score.reputationNorm < 65 || score.warrantyNorm < 70 || score.missingFields.length)
  ) {
    add(12, 'Giá thấp bất thường so với nhóm, cần xác minh trước khi mua.');
  }

  penalty = clamp(penalty, 0, 45);
  let riskLevel = 'low';
  if (String(supplier.data_status || '').toLowerCase() === 'blocked' || String(supplier.verification_status || '').toLowerCase() === 'rejected') {
    riskLevel = 'blocked';
  } else if (penalty >= 22) {
    riskLevel = 'high';
  } else if (penalty >= 10) {
    riskLevel = 'medium';
  }

  const decisionLabel = !score.rankable
    ? 'Cần kiểm tra'
    : riskLevel === 'blocked'
      ? 'Không nên chọn'
      : riskLevel === 'high'
        ? 'Cần kiểm tra'
        : riskLevel === 'medium'
          ? 'Có thể đàm phán'
          : 'Nên chọn';

  const recommendationReason = decisionLabel === 'Nên chọn'
    ? 'Điểm tốt và rủi ro thấp trong nhóm so sánh.'
    : flags[0] || 'Cần bổ sung dữ liệu trước khi ra quyết định.';

  return {
    riskPenalty: penalty,
    riskLevel,
    decisionLabel,
    riskFlags: [...new Set(flags)],
    recommendationReason,
  };
}

function scoreSuppliers(purchaseRequest, suppliers, options = {}) {
  const weights = normalizeWeights(options.weights || purchaseRequest.weights);
  const requiredQuantity = Math.max(1, toNumber(purchaseRequest.required_quantity, 1));
  const prepared = suppliers.map((supplier, index) => {
    const cost = totalCostForSupplier(purchaseRequest, supplier, requiredQuantity);
    return {
      supplier: { ...supplier, _inputIndex: index },
      ...cost,
      missingFields: getMissingFields(supplier),
    };
  });

  const rankableCosts = prepared
    .map((item) => item.totalCost)
    .filter((value) => value !== null && Number.isFinite(value));
  const minCost = rankableCosts.length ? Math.min(...rankableCosts) : null;
  const maxCost = rankableCosts.length ? Math.max(...rankableCosts) : null;
  const medianCost = median(rankableCosts);

  const deliveryDays = prepared
    .map((item) => toNumber(item.supplier.estimated_delivery_days, null))
    .filter((value) => value !== null && value >= 0);
  const minDays = deliveryDays.length ? Math.min(...deliveryDays) : null;
  const maxDays = deliveryDays.length ? Math.max(...deliveryDays) : null;

  const scored = prepared.map((item) => {
    const supplier = item.supplier;
    const rankable = item.totalCost !== null;
    const priceNorm = !rankable
      ? 0
      : minCost === maxCost
        ? 100
        : ((maxCost - item.totalCost) / (maxCost - minCost)) * 100;

    const qualityNorm = normalizeScore(supplier.quality_raw ?? supplier.quality ?? supplier.rating, 50);
    const reputationBase = normalizeScore(supplier.reputation_raw ?? supplier.reputation, null);
    const reviews = toNumber(supplier.review_count, 0);
    const reputationNorm = reputationBase === null
      ? clamp(45 + Math.log10(Math.max(1, reviews)) * 15)
      : reputationBase;

    const days = toNumber(supplier.estimated_delivery_days, null);
    const deliveryNorm = days === null
      ? 50
      : minDays === maxDays
        ? 100
        : ((maxDays - days) / (maxDays - minDays)) * 100;

    const available = toNumber(supplier.available_quantity, 0);
    const quantityNorm = clamp((available / requiredQuantity) * 100);
    const warehouseNorm = normalizeBool(supplier.deliver_to_buyer_warehouse) ? 100 : 0;
    const warrantyNorm = warrantyScore(supplier.warranty_policy);

    const score = {
      supplier_id: supplier.id ?? null,
      priceScore: rankable ? (priceNorm / 100) * weights.price : 0,
      qualityScore: (qualityNorm / 100) * weights.quality,
      reputationScore: (reputationNorm / 100) * weights.reputation,
      deliveryScore: (deliveryNorm / 100) * weights.delivery,
      quantityScore: (quantityNorm / 100) * weights.quantity,
      warehouseDeliveryScore: (warehouseNorm / 100) * weights.warehouseDelivery,
      warrantyScore: (warrantyNorm / 100) * weights.warranty,
      priceNorm: rankable ? priceNorm : 0,
      qualityNorm,
      reputationNorm,
      deliveryNorm,
      quantityNorm,
      warehouseNorm,
      warrantyNorm,
      totalCost: item.totalCost,
      totalBeforeFees: item.totalBeforeFees,
      convertedUnitPrice: item.convertedUnitPrice,
      convertedShippingFee: item.convertedShippingFee,
      exchangeRate: item.exchangeRate,
      rankable,
      missingFields: item.missingFields,
      rank: null,
      baseScore: 0,
      riskPenalty: 0,
      riskLevel: 'low',
      decisionLabel: 'Cần kiểm tra',
      riskFlags: [],
      recommendationReason: '',
      totalScore: 0,
      explanation: '',
    };
    score.baseScore = rankable
      ? score.priceScore + score.qualityScore + score.reputationScore + score.deliveryScore + score.quantityScore + score.warehouseDeliveryScore + score.warrantyScore
      : 0;
    const risk = buildRiskAssessment(supplier, score, { medianCost });
    score.riskPenalty = risk.riskPenalty;
    score.riskLevel = risk.riskLevel;
    score.decisionLabel = risk.decisionLabel;
    score.riskFlags = risk.riskFlags;
    score.recommendationReason = risk.recommendationReason;
    score.totalScore = rankable ? clamp(score.baseScore - score.riskPenalty, 0, 100) : 0;
    const detail = buildStrengthsAndRisks(supplier, score, weights);
    score.strengths = detail.strengths;
    score.risks = [...new Set([...detail.risks, ...score.riskFlags])];
    score.explanation = rankable ? explainSupplier(supplier, score, weights) : 'Thiếu giá nên chưa được xếp hạng.';
    return { supplier, score };
  });

  const ranked = scored
    .filter((item) => item.score.rankable)
    .sort((a, b) => b.score.totalScore - a.score.totalScore || a.score.totalCost - b.score.totalCost);

  ranked.forEach((item, index) => {
    item.score.rank = index + 1;
  });

  const missing = scored.filter((item) => !item.score.rankable);
  const all = [...ranked, ...missing].map(({ supplier, score }) => ({
    ...supplier,
    total_cost: score.totalCost,
    score,
    data_status: score.missingFields.length ? 'missing_data' : (supplier.data_status || 'complete'),
  }));

  return {
    ranked: all,
    top5: all.filter((item) => item.score.rankable).slice(0, 5),
    missing: all.filter((item) => !item.score.rankable || item.score.missingFields.length),
    weights,
  };
}

module.exports = {
  WEIGHTS: DEFAULT_WEIGHTS,
  DEFAULT_WEIGHTS,
  normalizeWeights,
  scoreSuppliers,
  toNumber,
  normalizeScore,
  normalizeBool,
  warrantyScore,
  currencyRate,
  missingFieldLabel,
};
