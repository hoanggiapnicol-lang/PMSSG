function buildExcelXml(purchaseRequest, rankedRows, settings = {}) {
  const top5 = rankedRows.filter((row) => row.score?.rankable).slice(0, 5);
  const missing = rankedRows.filter((row) => !row.score?.rankable || row.score?.missingFields?.length);
  return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
${workbookStyles()}
${worksheet('Yeu cau mua hang', [
    ['Truong', 'Gia tri'],
    ['Ten san pham', purchaseRequest.product_name],
    ['Model', purchaseRequest.model],
    ['Thong so', purchaseRequest.specifications],
    ['So luong', purchaseRequest.required_quantity],
    ['Don vi', purchaseRequest.unit],
    ['Kho nhan hang', purchaseRequest.delivery_warehouse],
    ['Ty gia USD', purchaseRequest.usd_rate],
    ['Ty gia CNY', purchaseRequest.cny_rate],
    ['Phu phi %', purchaseRequest.extra_fee_percent],
    ['Phu phi VND', purchaseRequest.extra_fee_vnd],
    ['Muc uu tien', purchaseRequest.priority],
    ['Ghi chu', purchaseRequest.notes],
  ])}
${worksheet('Nha cung cap', supplierRows(rankedRows))}
${worksheet('Diem chi tiet', scoreRows(rankedRows))}
${worksheet('Top 5 de xuat', supplierRows(top5))}
${worksheet('Du lieu can kiem tra', supplierRows(missing))}
${worksheet('Checklist kiem chung', checklistRows(rankedRows))}
${worksheet('Cong thuc tinh diem', formulaRows(settings.weights || {}))}
</Workbook>`;
}

function supplierRows(rows) {
  return [
    ['Hang', 'Nha cung cap', 'San nguon', 'Ten san pham', 'Gia goc', 'Tien te', 'Ty gia', 'Don gia VND', 'Phi van chuyen VND', 'Tong tien VND', 'So luong', 'Ngay giao', 'Giao tan kho', 'Chat luong', 'Uy tin', 'Bao hanh', 'Diem nen', 'Tru rui ro', 'Tong diem', 'Muc rui ro', 'Quyet dinh', 'Trang thai', 'Xac minh', 'Rui ro', 'Link'],
    ...rows.map((row) => [
      row.score?.rank || '',
      row.supplier_name || '',
      row.source_platform || '',
      row.product_name || '',
      row.unit_price ?? '',
      row.currency || '',
      row.score?.exchangeRate ?? '',
      row.score?.convertedUnitPrice ?? '',
      row.score?.convertedShippingFee ?? '',
      row.total_cost ?? row.score?.totalCost ?? '',
      row.available_quantity ?? '',
      row.estimated_delivery_days ?? '',
      row.deliver_to_buyer_warehouse ? 'Co' : 'Khong',
      row.quality_raw ?? '',
      row.reputation_raw ?? '',
      row.warranty_policy || '',
      row.score?.baseScore ?? '',
      row.score?.riskPenalty ?? '',
      row.score?.totalScore ?? '',
      row.score?.riskLevel || '',
      row.score?.decisionLabel || '',
      row.data_status || '',
      row.verification_status || '',
      row.score?.risks?.join('; ') || '',
      row.product_url || '',
    ]),
  ];
}

function scoreRows(rows) {
  return [
    ['Hang', 'Nha cung cap', 'Diem gia', 'Diem chat luong', 'Diem uy tin', 'Diem giao hang', 'Diem so luong', 'Diem giao tan kho', 'Diem bao hanh', 'Diem nen', 'Tru rui ro', 'Tong diem', 'Muc rui ro', 'Quyet dinh', 'Ly do'],
    ...rows.map((row) => [
      row.score?.rank || '',
      row.supplier_name || '',
      row.score?.priceScore ?? '',
      row.score?.qualityScore ?? '',
      row.score?.reputationScore ?? '',
      row.score?.deliveryScore ?? '',
      row.score?.quantityScore ?? '',
      row.score?.warehouseDeliveryScore ?? '',
      row.score?.warrantyScore ?? '',
      row.score?.baseScore ?? '',
      row.score?.riskPenalty ?? '',
      row.score?.totalScore ?? '',
      row.score?.riskLevel || '',
      row.score?.decisionLabel || '',
      row.score?.explanation || '',
    ]),
  ];
}

function checklistRows(rows) {
  return [
    ['Hang', 'Nha cung cap', 'Mo link nguon', 'Kiem review xau', 'Hoi bao hanh doi tra', 'Xac nhan phi ship ve kho', 'Xac nhan ton kho MOQ', 'Hoi hoa don chung tu', 'Anh video that hoac dat mau', 'Ghi chu'],
    ...rows.map((row) => [
      row.score?.rank || '',
      row.supplier_name || '',
      row.product_url ? 'Can lam' : 'Thieu link',
      'Can lam',
      row.warranty_policy ? 'Can xac nhan' : 'Thieu bao hanh',
      row.shipping_fee !== null && row.shipping_fee !== undefined ? 'Can xac nhan' : 'Thieu phi ship',
      row.available_quantity !== null && row.available_quantity !== undefined ? 'Can xac nhan' : 'Thieu so luong',
      'Can lam',
      row.score?.riskLevel === 'low' ? 'Neu don gia tri cao' : 'Nen lam truoc khi mua',
      row.verification_notes || row.score?.recommendationReason || '',
    ]),
  ];
}

function formulaRows(weights) {
  return [
    ['Noi dung', 'Gia tri'],
    ['Tong diem toi da', 100],
    ['Diem gia', weights.price ?? 30],
    ['Diem chat luong', weights.quality ?? 25],
    ['Diem uy tin', weights.reputation ?? 20],
    ['Diem giao hang', weights.delivery ?? 10],
    ['Diem so luong', weights.quantity ?? 5],
    ['Diem giao tan kho', weights.warehouseDelivery ?? 5],
    ['Diem bao hanh', weights.warranty ?? 5],
    ['Diem nen', 'Tong diem theo trong so truoc khi tru rui ro.'],
    ['Tru rui ro', 'Diem tru vi thieu du lieu, uy tin yeu, gia thap bat thuong hoac nguon chua xac minh.'],
    ['Tong diem cuoi', 'Diem nen - diem tru rui ro, dung de xep hang.'],
    ['Tong tien', 'don_gia * so_luong_can_mua + phi_van_chuyen + phu_phi'],
    ['Diem gia', 'Nha cung cap co tong tien thap nhat duoc diem gia cao nhat; cao nhat duoc diem thap nhat.'],
    ['Khong co gia', 'Khong duoc xep hang va chuyen vao nhom du lieu can kiem tra.'],
  ];
}

function worksheet(name, rows) {
  const maxCols = Math.max(...rows.map((row) => row.length), 1);
  return `<Worksheet ss:Name="${escapeXml(name)}">
<Table ss:DefaultRowHeight="18">
${Array.from({ length: maxCols }, (_, index) => column(index)).join('\n')}
${rows.map((row, rowIndex) => `<Row ss:Height="${rowIndex === 0 ? 23 : 18}">${row.map((value) => cell(value, rowIndex === 0 ? 'Header' : 'Data')).join('')}</Row>`).join('\n')}
</Table>
<WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">
<FreezePanes/><FrozenNoSplit/><SplitHorizontal>1</SplitHorizontal><TopRowBottomPane>1</TopRowBottomPane><ActivePane>2</ActivePane>
</WorksheetOptions>
</Worksheet>`;
}

function workbookStyles() {
  return `<Styles>
<Style ss:ID="Default" ss:Name="Normal">
<Font ss:FontName="Times New Roman" ss:Size="11"/>
<Alignment ss:Vertical="Center" ss:WrapText="1"/>
</Style>
<Style ss:ID="Data">
<Font ss:FontName="Times New Roman" ss:Size="11"/>
<Alignment ss:Vertical="Center" ss:WrapText="1"/>
<Borders>${borderXml()}</Borders>
</Style>
<Style ss:ID="Header">
<Font ss:FontName="Times New Roman" ss:Size="12" ss:Bold="1" ss:Color="#FFFFFF"/>
<Interior ss:Color="#1F3F52" ss:Pattern="Solid"/>
<Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="1"/>
<Borders>${borderXml('#9FB3C5')}</Borders>
</Style>
</Styles>`;
}

function borderXml(color = '#D8E0E7') {
  return `<Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="${color}"/>
<Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="${color}"/>
<Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="${color}"/>
<Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="${color}"/>`;
}

function column(index) {
  const width = index === 0 ? 90 : index === 1 ? 170 : index > 16 ? 150 : 125;
  return `<Column ss:AutoFitWidth="0" ss:Width="${width}"/>`;
}

function cell(value, styleId = 'Data') {
  const numeric = typeof value === 'number' && Number.isFinite(value);
  return `<Cell ss:StyleID="${styleId}"><Data ss:Type="${numeric ? 'Number' : 'String'}">${escapeXml(value ?? '')}</Data></Cell>`;
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

module.exports = {
  buildExcelXml,
};
