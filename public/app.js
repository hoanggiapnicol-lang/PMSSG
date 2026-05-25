const state = {
  currentId: null,
  imageData: '',
  lastScore: null,
  pendingImportRows: [],
  weights: {
    price: 30,
    quality: 25,
    reputation: 20,
    delivery: 10,
    quantity: 5,
    warehouseDelivery: 5,
    warranty: 5,
  },
};

const requestForm = document.querySelector('#requestForm');
const suppliersBody = document.querySelector('#suppliersTable tbody');
const supplierTemplate = document.querySelector('#supplierRowTemplate');
const topFive = document.querySelector('#topFive');
const resultsBody = document.querySelector('#resultsTable tbody');
const statusText = document.querySelector('#statusText');
const currentId = document.querySelector('#currentId');
const historyList = document.querySelector('#historyList');
const noticeBar = document.querySelector('#noticeBar');
const weightStatus = document.querySelector('#weightStatus');
const weightInputs = [...document.querySelectorAll('[data-weight]')];
const scoreBtn = document.querySelector('#scoreBtn');
const fetchBtn = document.querySelector('#fetchBtn');
const importPreview = document.querySelector('#importPreview');
const importPreviewStatus = document.querySelector('#importPreviewStatus');
const importPreviewBody = document.querySelector('#importPreviewTable tbody');
const importWarnings = document.querySelector('#importWarnings');
const productExtractStatus = document.querySelector('#productExtractStatus');
const suggestionTimers = new Map();

document.querySelector('#addSupplierBtn').addEventListener('click', () => addSupplierRow());
scoreBtn.addEventListener('click', scoreCurrent);
document.querySelector('#saveBtn').addEventListener('click', saveCurrent);
document.querySelector('#newRequestBtn').addEventListener('click', resetApp);
document.querySelector('#refreshHistoryBtn').addEventListener('click', loadHistory);
fetchBtn.addEventListener('click', fetchMarketplaces);
document.querySelector('#exportBtn').addEventListener('click', exportCurrent);
document.querySelector('#saveWeightsBtn').addEventListener('click', saveWeights);
document.querySelector('#resetWeightsBtn').addEventListener('click', resetWeights);
document.querySelector('#importInput').addEventListener('change', importFile);
document.querySelector('#confirmImportBtn').addEventListener('click', confirmImportPreview);
document.querySelector('#cancelImportBtn').addEventListener('click', cancelImportPreview);
document.querySelector('#imageInput').addEventListener('change', handleImage);
document.querySelector('#clearImageBtn').addEventListener('click', clearProductImage);
requestForm.elements.priority.addEventListener('change', applyPriorityPreset);
weightInputs.forEach((input) => input.addEventListener('input', syncWeightsFromInputs));

suppliersBody.addEventListener('click', (event) => {
  const actionButton = event.target.closest('[data-action]');
  if (!actionButton) return;
  if (actionButton.dataset.action === 'remove') {
    actionButton.closest('tr').remove();
  } else if (actionButton.dataset.action === 'open-link') {
    openSupplierLink(actionButton.closest('tr'));
  }
});

document.addEventListener('click', (event) => {
  const linkButton = event.target.closest('[data-open-url]');
  if (!linkButton) return;
  event.preventDefault();
  openPurchaseUrl(linkButton.dataset.openUrl);
});

function requestPayload() {
  const form = new FormData(requestForm);
  const payload = Object.fromEntries(form.entries());
  payload.image_path = state.imageData || payload.image_path || '';
  payload.required_quantity = numberOrBlank(payload.required_quantity) || 1;
  payload.usd_rate = numberOrBlank(payload.usd_rate) || 25500;
  payload.cny_rate = numberOrBlank(payload.cny_rate) || 4000;
  payload.extra_fee_percent = numberOrBlank(payload.extra_fee_percent) || 0;
  payload.extra_fee_vnd = numberOrBlank(payload.extra_fee_vnd) || 0;
  return payload;
}

function supplierRows() {
  return [...suppliersBody.querySelectorAll('tr')].map((row) => {
    const data = {};
    row.querySelectorAll('[data-field]').forEach((input) => {
      const field = input.dataset.field;
      data[field] = input.type === 'checkbox' ? input.checked : input.value;
    });
    return {
      ...data,
      unit_price: numberOrNull(data.unit_price),
      shipping_fee: numberOrNull(data.shipping_fee),
      estimated_delivery_days: numberOrNull(data.estimated_delivery_days),
      available_quantity: numberOrNull(data.available_quantity),
      quality_raw: numberOrNull(data.quality_raw),
      reputation_raw: numberOrNull(data.reputation_raw),
      currency: data.currency || 'VND',
      source_platform: data.source_platform || 'Manual',
      imported_from: data.imported_from || 'manual',
    };
  }).filter((row) => Object.values(row).some((value) => value !== '' && value !== null && value !== false));
}

function addSupplierRow(data = {}) {
  const fragment = supplierTemplate.content.cloneNode(true);
  const row = fragment.querySelector('tr');
  row.querySelectorAll('[data-field]').forEach((input) => {
    const field = input.dataset.field;
    if (input.type === 'checkbox') {
      input.checked = Boolean(data[field]);
    } else {
      input.value = data[field] ?? defaultValue(field);
    }
  });
  suppliersBody.appendChild(row);
}

function defaultValue(field) {
  if (field === 'currency') return 'VND';
  if (field === 'source_platform') return 'Manual';
  if (field === 'shipping_fee') return 0;
  if (field === 'verification_status') return 'unverified';
  return '';
}

async function loadSettings() {
  const settings = await api('/api/settings');
  state.weights = { ...state.weights, ...(settings.weights || {}) };
  renderWeights();
}

function renderWeights() {
  weightInputs.forEach((input) => {
    input.value = state.weights[input.dataset.weight] ?? 0;
  });
  updateWeightStatus();
}

function syncWeightsFromInputs() {
  weightInputs.forEach((input) => {
    state.weights[input.dataset.weight] = numberOrNull(input.value) ?? 0;
  });
  updateWeightStatus();
}

function updateWeightStatus() {
  const total = weightTotal();
  weightStatus.textContent = `Tổng trọng số: ${total}. ${total === 100 ? 'Hợp lệ.' : 'Cần bằng 100.'}`;
  weightStatus.style.color = total === 100 ? 'var(--muted)' : 'var(--red)';
}

function weightTotal() {
  return Math.round(Object.values(state.weights).reduce((sum, value) => sum + Number(value || 0), 0) * 10) / 10;
}

async function saveWeights() {
  syncWeightsFromInputs();
  if (weightTotal() !== 100) {
    setStatus('Tổng trọng số phải bằng 100 trước khi lưu.', true);
    return;
  }
  const settings = await api('/api/settings', { method: 'PUT', body: { weights: state.weights } });
  state.weights = settings.weights;
  renderWeights();
  setStatus('Đã lưu trọng số điểm.');
}

function resetWeights() {
  state.weights = {
    price: 30,
    quality: 25,
    reputation: 20,
    delivery: 10,
    quantity: 5,
    warehouseDelivery: 5,
    warranty: 5,
  };
  renderWeights();
  setStatus('Đã đặt lại trọng số mặc định.');
}

function applyPriorityPreset() {
  const priority = requestForm.elements.priority.value;
  const presets = {
    balanced: { price: 30, quality: 25, reputation: 20, delivery: 10, quantity: 5, warehouseDelivery: 5, warranty: 5 },
    price: { price: 45, quality: 20, reputation: 15, delivery: 8, quantity: 4, warehouseDelivery: 4, warranty: 4 },
    reputation: { price: 22, quality: 25, reputation: 32, delivery: 8, quantity: 4, warehouseDelivery: 4, warranty: 5 },
    delivery: { price: 25, quality: 20, reputation: 15, delivery: 25, quantity: 5, warehouseDelivery: 5, warranty: 5 },
  };
  state.weights = presets[priority] || presets.balanced;
  renderWeights();
}

async function scoreCurrent() {
  syncWeightsFromInputs();
  if (weightTotal() !== 100) {
    setStatus('Tổng trọng số phải bằng 100 trước khi tính điểm.', true);
    return;
  }
  const payload = { purchaseRequest: requestPayload(), suppliers: supplierRows() };
  if (!payload.suppliers.length) {
    setStatus('Cần ít nhất một nhà cung cấp.', true);
    return;
  }
  setButtonLoading(scoreBtn, true, 'Đang xếp hạng...');
  try {
    const result = await api('/api/score', { method: 'POST', body: { ...payload, weights: state.weights } });
    state.lastScore = result;
    renderResults(result);
    setStatus(`Đã tính điểm ${result.ranked.length} nhà cung cấp.`);
  } catch (error) {
    setStatus(`Tính điểm lỗi: ${error.message}`, true);
  } finally {
    setButtonLoading(scoreBtn, false);
  }
}

async function saveCurrent() {
  syncWeightsFromInputs();
  if (weightTotal() === 100) {
    await api('/api/settings', { method: 'PUT', body: { weights: state.weights } });
  }
  const payload = { purchaseRequest: requestPayload(), suppliers: supplierRows() };
  const url = state.currentId ? `/api/requests/${state.currentId}` : '/api/requests';
  const method = state.currentId ? 'PUT' : 'POST';
  const saved = await api(url, { method, body: payload });
  state.currentId = saved.purchaseRequest.id;
  updateCurrentId();
  await api(`/api/requests/${state.currentId}/score`, { method: 'POST', body: {} }).catch(() => null);
  await loadHistory();
  setStatus('Đã lưu vào SQLite.');
}

async function fetchMarketplaces() {
  const request = requestPayload();
  if (!request.product_name && !request.model) {
    setStatus('Cần tên sản phẩm hoặc model để tìm dữ liệu công khai.', true);
    return;
  }
  const platforms = selectedPlatforms();
  if (!platforms.length) {
    setStatus('Cần chọn ít nhất một sàn để lấy dữ liệu công khai.', true);
    return;
  }
  setStatus(`Đang lấy dữ liệu công khai từ ${platforms.join(', ')}...`);
  setButtonLoading(fetchBtn, true, 'Đang lấy dữ liệu...');
  try {
    const result = await api('/api/fetch-marketplaces', {
      method: 'POST',
      body: { query: request.product_name, model: request.model, platforms },
    });
    (result.candidates || []).forEach((candidate) => addSupplierRow(candidate));
    showImportWarnings(result.warnings || []);
    setStatus(`Đã thêm ${(result.candidates || []).length} dòng dữ liệu công khai/cần kiểm tra.`);
  } catch (error) {
    setStatus(`Lấy dữ liệu công khai lỗi: ${error.message}`, true);
  } finally {
    setButtonLoading(fetchBtn, false);
  }
}

function selectedPlatforms() {
  return [...document.querySelectorAll('[data-platform]:checked')]
    .map((input) => input.dataset.platform)
    .filter(Boolean);
}

async function openSupplierLink(row) {
  const input = row?.querySelector('[data-field="product_url"]');
  const url = String(input?.value || '').trim();
  if (!url) {
    setStatus('Dòng này chưa có link mua hàng.', true);
    input?.focus();
    return;
  }
  await openPurchaseUrl(url, input);
}

async function openPurchaseUrl(url, focusTarget = null) {
  const cleanUrl = String(url || '').trim();
  if (!/^https?:\/\//i.test(cleanUrl)) {
    setStatus('Link mua hàng phải bắt đầu bằng http:// hoặc https://.', true);
    focusTarget?.focus();
    return;
  }
  setStatus('Đang chuyển tới link mua hàng...');
  try {
    await api('/api/open-external', { method: 'POST', body: { url: cleanUrl } });
    setStatus('Đã mở link mua hàng.');
  } catch {
    window.open(cleanUrl, '_blank', 'noopener,noreferrer');
    setStatus('Đã mở link mua hàng.');
  }
}

function setButtonLoading(button, isLoading, loadingText = '') {
  if (!button) return;
  const label = button.querySelector('.button-label');
  if (isLoading) {
    button.dataset.normalLabel = label?.textContent || button.textContent;
    if (label && loadingText) label.textContent = loadingText;
    button.classList.add('loading');
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
  } else {
    if (label && button.dataset.normalLabel) label.textContent = button.dataset.normalLabel;
    button.classList.remove('loading');
    button.disabled = false;
    button.removeAttribute('aria-busy');
  }
}

async function exportCurrent() {
  if (!state.currentId) {
    await saveCurrent();
  }
  if (!state.currentId) return;
  window.location.href = `/api/requests/${state.currentId}/export`;
}

async function loadHistory() {
  const data = await api('/api/requests');
  historyList.innerHTML = '';
  if (!data.requests.length) {
    historyList.innerHTML = '<p class="muted">Chưa có lịch sử.</p>';
    return;
  }
  data.requests.forEach((item) => {
    const div = document.createElement('div');
    div.className = 'history-item';
    div.innerHTML = `
      <strong>${escapeHtml(item.product_name)}</strong>
      <div class="row">
        <span>${item.supplier_count} NCC</span>
        <span>${item.best_score ? `${Number(item.best_score).toFixed(1)} điểm` : 'Chưa có điểm'}</span>
      </div>
      <div class="history-actions">
        <button type="button" data-load="${item.id}">Mở</button>
        <button type="button" data-export="${item.id}">Xuất</button>
        <button type="button" data-delete="${item.id}">Xóa</button>
      </div>
    `;
    div.querySelector('[data-load]').addEventListener('click', () => openRequest(item.id));
    div.querySelector('[data-export]').addEventListener('click', () => {
      window.location.href = `/api/requests/${item.id}/export`;
    });
    div.querySelector('[data-delete]').addEventListener('click', () => deleteRequest(item.id));
    historyList.appendChild(div);
  });
}

async function deleteRequest(id) {
  await api(`/api/requests/${id}`, { method: 'DELETE', body: {} });
  if (state.currentId === id) resetApp();
  await loadHistory();
  setStatus(`Đã xóa yêu cầu #${id}.`);
}

async function openRequest(id) {
  const data = await api(`/api/requests/${id}`);
  state.currentId = data.purchaseRequest.id;
  state.imageData = data.purchaseRequest.image_path || '';
  fillRequestForm(data.purchaseRequest);
  suppliersBody.innerHTML = '';
  data.suppliers.forEach((supplier) => addSupplierRow(supplier));
  updateCurrentId();
  renderImage();
  const scored = await api(`/api/requests/${id}/score`, { method: 'POST', body: {} });
  state.lastScore = scored;
  renderResults(scored);
  setStatus(`Đã mở yêu cầu #${id}.`);
}

function fillRequestForm(data) {
  requestForm.querySelectorAll('[name]').forEach((input) => {
    input.value = data[input.name] ?? '';
  });
}

function renderResults(result) {
  topFive.innerHTML = '';
  resultsBody.innerHTML = '';
  noticeBar.innerHTML = '';

  const notices = result.ranked
    .filter((row) => ['blocked', 'manual_required', 'missing_data'].includes(row.data_status))
    .slice(0, 3);
  notices.forEach((row) => {
    const notice = document.createElement('div');
    notice.className = 'notice';
    notice.textContent = `${row.source_platform || 'Nguồn'}: ${statusLabel(row.data_status)}, cần kiểm tra hoặc nhập bổ sung dữ liệu.`;
    noticeBar.appendChild(notice);
  });

  if (!result.top5.length) {
    topFive.innerHTML = '<p class="muted">Chưa có nhà cung cấp đủ dữ liệu giá để xếp hạng.</p>';
  } else {
  result.top5.forEach((row, index) => {
      const card = document.createElement('article');
      const score = Number(row.score.totalScore || 0);
      card.className = `supplier-card ${index === 0 ? 'best' : score < 55 ? 'risky' : ''}`;
      card.innerHTML = `
        <div class="card-head">
          <span>#${row.score.rank}</span>
          <span>${escapeHtml(row.score.decisionLabel || (index === 0 ? 'Ưu tiên' : 'Top 5'))}</span>
        </div>
        <h3>${escapeHtml(row.supplier_name || 'Chưa đặt tên')}</h3>
        <p>${escapeHtml(row.source_platform || 'Manual')}</p>
        <p><strong>${formatMoney(row.score.totalCost)}</strong> ${escapeHtml(row.currency || 'VND')}</p>
        <div class="decision-line">
          <span class="risk-pill ${riskClass(row.score.riskLevel)}">${riskLabel(row.score.riskLevel)}</span>
          <span>Trừ ${formatMetric(row.score.riskPenalty)} điểm rủi ro</span>
        </div>
        <div class="metric-grid">
          <div class="metric"><span>Giá</span><strong>${formatMetric(row.score.priceScore)}</strong></div>
          <div class="metric"><span>Chất lượng</span><strong>${formatMetric(row.score.qualityScore)}</strong></div>
          <div class="metric"><span>Uy tín</span><strong>${formatMetric(row.score.reputationScore)}</strong></div>
          <div class="metric"><span>MOQ</span><strong>${formatMetric(row.score.quantityScore)}</strong></div>
        </div>
        <p class="card-note">${escapeHtml(firstUsefulNote(row))}</p>
        <ul class="checklist">${checklistItems(row).map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
        ${row.product_url ? `<p><button type="button" class="source-link source-button" data-open-url="${escapeAttr(row.product_url)}">Mở link mua hàng</button></p>` : ''}
      `;
      topFive.appendChild(card);
    });
  }

  result.ranked.forEach((row) => {
    const tr = document.createElement('tr');
    const score = row.score || {};
    const totalScore = Number(score.totalScore || 0);
    tr.innerHTML = `
      <td class="rank-cell">${score.rank || '-'}</td>
      <td>
        <div class="supplier-main">
          <strong>${escapeHtml(row.supplier_name || '')}</strong>
          <span>${escapeHtml(row.product_name || requestPayload().product_name || '')}</span>
        </div>
      </td>
      <td>${escapeHtml(row.source_platform || 'Manual')}</td>
      <td><span class="score-badge ${scoreClass(totalScore)}">${score.rankable ? totalScore.toFixed(1) : '-'}</span></td>
      <td>${score.rankable ? formatMetric(score.baseScore) : '-'}</td>
      <td>${score.rankable ? formatMetric(score.riskPenalty) : '-'}</td>
      <td><span class="risk-pill ${riskClass(score.riskLevel)}">${riskLabel(score.riskLevel)}</span></td>
      <td>${escapeHtml(score.decisionLabel || 'Cần kiểm tra')}</td>
      <td>${score.totalCost === null || score.totalCost === undefined ? '-' : `${formatMoney(score.totalCost)} ${escapeHtml(row.currency || 'VND')}`}</td>
      <td>${scoreCell(score.priceScore, result.weights.price)}</td>
      <td>${scoreCell(score.qualityScore, result.weights.quality)}</td>
      <td>${scoreCell(score.reputationScore, result.weights.reputation)}</td>
      <td>${scoreCell(score.deliveryScore, result.weights.delivery)}</td>
      <td>${scoreCell(score.quantityScore, result.weights.quantity)}</td>
      <td>${scoreCell(score.warehouseDeliveryScore, result.weights.warehouseDelivery)}</td>
      <td>${scoreCell(score.warrantyScore, result.weights.warranty)}</td>
      <td>${formatDelivery(row.estimated_delivery_days)}</td>
      <td>${formatReputation(row)}</td>
      <td>${escapeHtml(row.warranty_policy || 'Cần nhập')}</td>
      <td><div class="risk-list">${escapeHtml((score.risks || []).slice(0, 3).join(' ')) || 'Không có rủi ro lớn'}</div></td>
      <td>${row.product_url ? `<button type="button" class="source-link source-button" data-open-url="${escapeAttr(row.product_url)}">Mở</button>` : '-'}</td>
    `;
    resultsBody.appendChild(tr);
  });
}

function importFile(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const preview = await api('/api/import-preview', {
        method: 'POST',
        body: {
          filename: file.name,
          contentBase64: bufferToBase64(reader.result),
        },
      });
      renderImportPreview(preview);
    } catch (error) {
      setStatus(`Import lỗi: ${error.message}`, true);
    } finally {
      event.target.value = '';
    }
  };
  reader.readAsArrayBuffer(file);
}

function renderImportPreview(preview) {
  state.pendingImportRows = preview.rows || [];
  importPreview.classList.remove('hidden');
  importPreviewBody.innerHTML = '';
  importPreviewStatus.textContent = `Tìm thấy ${state.pendingImportRows.length} dòng. Cột nhận diện: ${(preview.detectedColumns || []).join(', ') || 'không có'}.`;
  state.pendingImportRows.slice(0, 8).forEach((row) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(row.supplier_name || '')}</td>
      <td>${escapeHtml(row.unit_price ?? '')}</td>
      <td>${escapeHtml(row.shipping_fee ?? '')}</td>
      <td>${escapeHtml(row.estimated_delivery_days ?? '')}</td>
      <td>${escapeHtml(row.warranty_policy || '')}</td>
      <td>${escapeHtml(row.product_url || '')}</td>
    `;
    importPreviewBody.appendChild(tr);
  });
  const issues = (preview.warnings || []).flatMap((item) => item.issues.map((issue) => `Dòng ${item.row}: ${issue}`));
  showImportWarnings(issues, importWarnings);
  setStatus(`Đã tạo preview import ${state.pendingImportRows.length} dòng.${issues.length ? ` Có ${issues.length} cảnh báo.` : ''}`, Boolean(issues.length));
}

function confirmImportPreview() {
  state.pendingImportRows.forEach((row) => addSupplierRow(row));
  setStatus(`Đã nhập ${state.pendingImportRows.length} dòng từ preview.`);
  cancelImportPreview();
}

function cancelImportPreview() {
  state.pendingImportRows = [];
  importPreview.classList.add('hidden');
  importPreviewBody.innerHTML = '';
  importWarnings.innerHTML = '';
}

function showImportWarnings(issues, target = noticeBar) {
  target.innerHTML = '';
  issues.slice(0, 6).forEach((issue) => {
    const notice = document.createElement('div');
    notice.className = 'notice';
    notice.textContent = issue;
    target.appendChild(notice);
  });
}

function bufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function parseDelimited(text) {
  const lines = String(text).split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return [];
  const delimiter = lines[0].includes('\t') ? '\t' : ',';
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
      quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      values.push(current.trim().replace(/^"|"$/g, ''));
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current.trim().replace(/^"|"$/g, ''));
  return values;
}

function parseExcelXml(text) {
  const rows = [...String(text).matchAll(/<Row>([\s\S]*?)<\/Row>/g)]
    .map((match) => [...match[1].matchAll(/<Data[^>]*>([\s\S]*?)<\/Data>/g)].map((cell) => decodeXml(cell[1])));
  const headerIndex = rows.findIndex((row) => row.some((cell) => /nha cung cap|supplier/i.test(cell)));
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
  };
  const normalized = {};
  const entries = Object.entries(row).map(([key, value]) => [normalizeKey(key), value]);
  for (const [field, keys] of Object.entries(aliases)) {
    const found = entries.find(([key]) => keys.map(normalizeKey).includes(key));
    if (found) normalized[field] = found[1];
  }
  normalized.deliver_to_buyer_warehouse = truthy(normalized.deliver_to_buyer_warehouse);
  return normalized;
}

async function handleImage(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async () => {
    const base64 = bufferToBase64(reader.result);
    if (file.type.startsWith('image/')) {
      state.imageData = `data:${file.type};base64,${base64}`;
      requestForm.elements.image_path.value = state.imageData;
      renderImage();
    } else {
      state.imageData = '';
      requestForm.elements.image_path.value = '';
      renderSelectedDocument(file.name);
    }
    await extractProductInfoFromFile(file, base64);
  };
  reader.readAsArrayBuffer(file);
}

function renderImage() {
  const box = document.querySelector('#imagePreview');
  const clearButton = document.querySelector('#clearImageBtn');
  if (!state.imageData) {
    box.className = 'image-preview empty';
    box.textContent = 'Chưa có hình ảnh';
    clearButton.classList.add('hidden');
    return;
  }
  box.className = 'image-preview';
  box.innerHTML = `<img src="${escapeAttr(state.imageData)}" alt="Hình sản phẩm">`;
  clearButton.classList.remove('hidden');
}

function renderSelectedDocument(filename) {
  const box = document.querySelector('#imagePreview');
  const clearButton = document.querySelector('#clearImageBtn');
  box.className = 'image-preview empty';
  box.textContent = `Đã chọn file: ${filename}`;
  clearButton.classList.remove('hidden');
}

function clearProductImage() {
  state.imageData = '';
  requestForm.elements.image_path.value = '';
  document.querySelector('#imageInput').value = '';
  renderImage();
  productExtractStatus.textContent = 'Đã xóa ảnh/file. Có thể chọn lại ảnh sản phẩm khác.';
  productExtractStatus.style.color = 'var(--muted)';
}

async function extractProductInfoFromFile(file, contentBase64) {
  productExtractStatus.textContent = 'Đang lọc thông tin sản phẩm từ file...';
  productExtractStatus.style.color = 'var(--muted)';
  try {
    const result = await api('/api/extract-product-info', {
      method: 'POST',
      body: { filename: file.name, contentBase64 },
    });
    applyExtractedProductFields(result.fields || {});
    const filledCount = Object.keys(result.fields || {}).length;
    const warningText = (result.warnings || []).join(' ');
    productExtractStatus.textContent = filledCount
      ? `Đã tự điền ${filledCount} trường từ file.${warningText ? ` ${warningText}` : ''}`
      : warningText || 'Chưa lọc được thông tin rõ ràng từ file.';
    productExtractStatus.style.color = filledCount ? 'var(--muted)' : 'var(--amber)';
  } catch (error) {
    productExtractStatus.textContent = `Không đọc được file: ${error.message}`;
    productExtractStatus.style.color = 'var(--red)';
  }
}

function applyExtractedProductFields(fields) {
  const allowed = ['product_name', 'model', 'specifications', 'required_quantity', 'unit', 'delivery_warehouse', 'notes'];
  allowed.forEach((name) => {
    if (fields[name] === undefined || fields[name] === null || fields[name] === '') return;
    const control = requestForm.elements[name];
    if (control) control.value = fields[name];
  });
}

function resetApp() {
  state.currentId = null;
  state.imageData = '';
  state.lastScore = null;
  requestForm.reset();
  requestForm.elements.required_quantity.value = 1;
  requestForm.elements.usd_rate.value = 25500;
  requestForm.elements.cny_rate.value = 4000;
  requestForm.elements.extra_fee_percent.value = 0;
  requestForm.elements.extra_fee_vnd.value = 0;
  requestForm.elements.priority.value = 'balanced';
  suppliersBody.innerHTML = '';
  topFive.innerHTML = '';
  resultsBody.innerHTML = '';
  addSupplierRow();
  updateCurrentId();
  renderImage();
  productExtractStatus.textContent = 'Có thể tải ảnh chụp, PDF hoặc Excel để app tự điền thông tin.';
  productExtractStatus.style.color = 'var(--muted)';
  setStatus('Đã tạo yêu cầu mới.');
}

function initKeyboardNavigation() {
  requestForm.addEventListener('keydown', handleFormNavigation);
  suppliersBody.addEventListener('keydown', handleSupplierTableNavigation);
}

function handleFormNavigation(event) {
  const target = event.target;
  if (!target.matches('input, textarea, select')) return;
  const navigableNames = new Set(['product_name', 'model', 'specifications', 'required_quantity', 'unit', 'delivery_warehouse', 'usd_rate', 'cny_rate', 'extra_fee_percent', 'extra_fee_vnd', 'priority', 'notes']);
  if (!navigableNames.has(target.name)) return;
  if (event.key === 'Enter') {
    if (target.tagName === 'TEXTAREA' && event.shiftKey) return;
    event.preventDefault();
    focusNextFormControl(target, event.shiftKey ? -1 : 1);
  } else if (event.key === 'Tab') {
    event.preventDefault();
    focusNextFormControl(target, event.shiftKey ? -1 : 1);
  } else if (event.key === 'ArrowRight' && isCaretAtEdge(target, 'end')) {
    event.preventDefault();
    focusNextFormControl(target, 1);
  } else if (event.key === 'ArrowLeft' && isCaretAtEdge(target, 'start')) {
    event.preventDefault();
    focusNextFormControl(target, -1);
  }
}

function focusNextFormControl(current, direction) {
  const order = ['product_name', 'model', 'specifications', 'required_quantity', 'unit', 'delivery_warehouse', 'usd_rate', 'cny_rate', 'extra_fee_percent', 'extra_fee_vnd', 'priority', 'notes'];
  const controls = order.map((name) => requestForm.elements[name]).filter(Boolean);
  const index = controls.indexOf(current);
  if (index < 0) return;
  const next = controls[index + direction];
  if (next) {
    focusControl(next);
    return;
  }
  if (direction > 0) {
    if (!suppliersBody.querySelector('tr')) addSupplierRow();
    focusControl(firstSupplierInput());
  }
}

function handleSupplierTableNavigation(event) {
  const target = event.target;
  if (!target.matches('[data-field]')) return;
  const row = target.closest('tr');
  const controls = rowControls(row);
  const index = controls.indexOf(target);
  if (index < 0) return;

  if (event.key === 'Enter') {
    event.preventDefault();
    if (event.shiftKey) {
      focusControl(controls[index - 1] || previousRowControl(row, index));
      return;
    }
    if (index === controls.length - 1) {
      addSupplierRow();
      focusControl(suppliersBody.lastElementChild?.querySelector('[data-field]'));
    } else {
      focusControl(controls[index + 1]);
    }
  } else if (event.key === 'Tab') {
    event.preventDefault();
    focusControl(event.shiftKey ? (controls[index - 1] || previousRowControl(row, index)) : (controls[index + 1] || nextRowControl(row, index, true)));
  } else if (event.key === 'ArrowDown') {
    event.preventDefault();
    focusControl(nextRowControl(row, index, false));
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    focusControl(previousRowControl(row, index));
  } else if (event.key === 'ArrowRight' && isCaretAtEdge(target, 'end')) {
    event.preventDefault();
    focusControl(controls[index + 1] || nextRowControl(row, index, false));
  } else if (event.key === 'ArrowLeft' && isCaretAtEdge(target, 'start')) {
    event.preventDefault();
    focusControl(controls[index - 1] || previousRowControl(row, index));
  }
}

function rowControls(row) {
  return [...row.querySelectorAll('[data-field]')];
}

function nextRowControl(row, columnIndex, createIfMissing) {
  let nextRow = row.nextElementSibling;
  if (!nextRow && createIfMissing) {
    addSupplierRow();
    nextRow = suppliersBody.lastElementChild;
  }
  return nextRow ? rowControls(nextRow)[columnIndex] || rowControls(nextRow)[0] : null;
}

function previousRowControl(row, columnIndex) {
  const previousRow = row.previousElementSibling;
  return previousRow ? rowControls(previousRow)[columnIndex] || rowControls(previousRow).at(-1) : null;
}

function firstSupplierInput() {
  return suppliersBody.querySelector('tr [data-field]');
}

function focusControl(control) {
  if (!control) return;
  control.focus();
  if (control.select && control.type !== 'checkbox') control.select();
}

function isCaretAtEdge(control, edge) {
  if (control.type === 'checkbox' || control.tagName === 'SELECT') return true;
  let start;
  let end;
  try {
    start = control.selectionStart;
    end = control.selectionEnd;
  } catch {
    return true;
  }
  if (start === null || end === null) return false;
  return edge === 'start'
    ? start === 0 && end === 0
    : start === control.value.length && end === control.value.length;
}

function initSuggestions() {
  bindSuggestion(requestForm.elements.product_name, '/api/suggestions/products', 'productSuggestions');
  bindSuggestion(requestForm.elements.model, '/api/suggestions/models', 'modelSuggestions');
  bindSuggestion(requestForm.elements.delivery_warehouse, '/api/suggestions/warehouses', 'warehouseSuggestions');
  suppliersBody.addEventListener('input', (event) => {
    if (event.target.dataset.field === 'supplier_name') {
      scheduleSuggestion(event.target, '/api/suggestions/suppliers', 'supplierSuggestions');
    }
  });
}

function bindSuggestion(input, endpoint, datalistId) {
  if (!input) return;
  input.addEventListener('input', () => scheduleSuggestion(input, endpoint, datalistId));
  scheduleSuggestion(input, endpoint, datalistId);
}

function scheduleSuggestion(input, endpoint, datalistId) {
  const key = `${endpoint}:${datalistId}`;
  clearTimeout(suggestionTimers.get(key));
  suggestionTimers.set(key, setTimeout(() => loadSuggestions(input.value, endpoint, datalistId), 180));
}

async function loadSuggestions(query, endpoint, datalistId) {
  const datalist = document.querySelector(`#${datalistId}`);
  if (!datalist) return;
  const result = await api(`${endpoint}?q=${encodeURIComponent(query || '')}`).catch(() => ({ suggestions: [] }));
  datalist.innerHTML = '';
  (result.suggestions || []).forEach((item) => {
    const option = document.createElement('option');
    option.value = item.value;
    datalist.appendChild(option);
  });
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    method: options.method || 'GET',
    headers: { 'content-type': 'application/json' },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}

function updateCurrentId() {
  currentId.textContent = state.currentId ? `#${state.currentId}` : 'Chưa lưu';
}

function setStatus(message, isError = false) {
  statusText.textContent = message;
  statusText.style.color = isError ? 'var(--red)' : 'var(--muted)';
}

function statusLabel(value) {
  return {
    complete: 'Đầy đủ',
    missing_data: 'Thiếu dữ liệu',
    manual_required: 'Cần nhập tay',
    blocked: 'Bị chặn',
    manual: 'Nhập tay',
  }[value] || value || 'Nhập tay';
}

function formatMoney(value) {
  return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(Number(value || 0));
}

function formatMetric(value) {
  return Number(value || 0).toFixed(0);
}

function scoreCell(value, max) {
  return `${formatMetric(value)}/${formatMetric(max)}`;
}

function firstUsefulNote(row) {
  const strengths = row.score?.strengths || [];
  const risks = row.score?.risks || [];
  return row.score?.recommendationReason || strengths[0] || risks[0] || row.score?.explanation || '';
}

function scoreClass(value) {
  if (value >= 75) return '';
  if (value >= 55) return 'mid';
  return 'low';
}

function riskClass(value) {
  return {
    low: 'risk-low',
    medium: 'risk-medium',
    high: 'risk-high',
    blocked: 'risk-blocked',
  }[value] || 'risk-medium';
}

function riskLabel(value) {
  return {
    low: 'Rủi ro thấp',
    medium: 'Rủi ro vừa',
    high: 'Rủi ro cao',
    blocked: 'Không nên chọn',
  }[value] || 'Cần kiểm tra';
}

function checklistItems(row) {
  const items = [];
  items.push(row.product_url ? 'Mở link nguồn và đối chiếu thông tin' : 'Bổ sung link nguồn');
  items.push('Kiểm tra review xấu và lịch sử bán');
  items.push(row.warranty_policy ? 'Xác nhận bảo hành/đổi trả bằng tin nhắn' : 'Hỏi rõ bảo hành/đổi trả');
  items.push(row.shipping_fee !== null && row.shipping_fee !== undefined ? 'Xác nhận phí ship về kho' : 'Bổ sung phí ship về kho');
  items.push(row.available_quantity !== null && row.available_quantity !== undefined ? 'Xác nhận tồn kho/MOQ' : 'Hỏi tồn kho/MOQ');
  items.push('Hỏi hóa đơn/chứng từ nếu cần');
  if (row.score?.riskLevel !== 'low') items.push('Xin ảnh/video thật hoặc đặt mẫu trước');
  return items.slice(0, 7);
}

function formatDelivery(value) {
  const n = numberOrNull(value);
  if (n === null) return 'Cần nhập';
  return `${n} ngày`;
}

function formatReputation(row) {
  const reputation = numberOrNull(row.reputation_raw);
  const rating = numberOrNull(row.rating);
  if (rating !== null && rating <= 5) return `${rating.toFixed(1)} sao`;
  if (reputation !== null) return `${reputation.toFixed(0)}/100`;
  return 'Cần nhập';
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function numberOrBlank(value) {
  const n = numberOrNull(value);
  return n === null ? '' : n;
}

function normalizeKey(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
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

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]));
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, '&#96;');
}

async function boot() {
  resetApp();
  initKeyboardNavigation();
  initSuggestions();
  await loadSettings();
  await loadHistory();
}

boot().catch((error) => setStatus(error.message, true));
