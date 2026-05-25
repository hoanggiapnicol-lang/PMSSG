const { fetchMarketplaceCandidates } = require('./connectors');

async function crawlMarketplaces({ query = '', model = '', platforms = null, maxItems = 5 } = {}) {
  try {
    const candidates = await fetchMarketplaceCandidates(query, model);
    const allowed = Array.isArray(platforms) && platforms.length
      ? new Set(platforms.map((item) => String(item).toLowerCase()))
      : null;
    const filtered = candidates
      .filter((candidate) => !allowed || allowed.has(String(candidate.source_platform || '').toLowerCase()))
      .slice(0, Math.max(1, Number(maxItems) || 5))
      .map((candidate) => ({
        ...candidate,
        data_status: candidate.data_status || (candidate.unit_price ? 'missing_data' : 'manual_required'),
        raw_data: {
          ...(candidate.raw_data || {}),
          crawl_mode: 'safe_wrapper',
          note: 'Dữ liệu marketplace chỉ là tham khảo. Cần mở link nguồn và kiểm chứng trước khi mua.',
        },
      }));
    return {
      candidates: filtered,
      warnings: [
        'Đang dùng crawler an toàn dạng best-effort; dữ liệu có thể thiếu và luôn cần kiểm chứng thủ công.',
      ],
    };
  } catch (error) {
    return {
      candidates: [],
      warnings: [`Không lấy được dữ liệu công khai: ${error.message}`],
      status: 'manual_required',
    };
  }
}

module.exports = {
  crawlMarketplaces,
};
