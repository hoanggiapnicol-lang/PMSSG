# PLAN.md - App web local so sanh va xep hang Top 5 nha cung cap

## 1. Muc tieu

Xay dung app web local chay tren may tinh de nguoi mua hang so sanh gia, chat luong, uy tin, bao hanh, thoi gian giao hang, kha nang giao tan kho va kha nang cung ung so luong lon cua cac nha cung cap. Nguoi dung nhap thong tin san pham nhu hinh anh, model, thong so ky thuat, so luong, don vi tinh, kho nhan hang va bao gia cua cac nha cung cap. App ho tro nhap tay, import file, lay du lieu cong khai tu cac san nhu Shopee, Taobao, 1688, Alibaba, Tiki khi co the truy cap, sau do tinh diem, xep hang va de xuat Top 5 nha cung cap nen chon.

## 2. Hien trang da lam

App hien tai da co ban chay duoc:

- Backend Node.js local tai `server.js`.
- Giao dien web tai `public/index.html`, `public/app.js`, `public/styles.css`.
- Luu lich su bang SQLite qua `src/db.js`.
- Tinh diem va xep hang tai `src/scoring.js`.
- Xuat Excel-compatible `.xls` tai `src/exporter.js`.
- Connector lay du lieu cong khai so bo tai `src/connectors.js`.
- Test cong thuc diem tai `tests/scoring.test.js`.
- App dang chay o `http://127.0.0.1:5501`.

Nhung diem da dat:

- Tao yeu cau mua hang.
- Nhap nha cung cap thu cong.
- Upload hinh anh san pham.
- Tinh tong tien va tong diem.
- Hien Top 5 nha cung cap.
- Hien ly do xep hang.
- Luu va mo lai lich su.
- Xuat file Excel-compatible.
- Co test cho cac truong hop chinh cua cong thuc diem.

## 3. Loi va diem yeu can sua

### 3.1. Bao hanh nhap `12` chua duoc hieu la `12 thang`

Hien tai neu nguoi dung nhap `12`, app chi xem la chuoi thong tin bao hanh chung va cho diem mac dinh. Can sua de:

- `12` duoc hieu la `12 thang`.
- `6` duoc hieu la `6 thang`.
- `24` duoc hieu la `24 thang`.
- `khong bao hanh` hoac `không bảo hành` van bi tinh diem thap.

### 3.2. Bang ket qua chua hien du diem thanh phan

Hien tai bang ket qua moi hien tong diem va ly do ngan. Can them cac cot:

- Diem gia.
- Diem chat luong.
- Diem uy tin.
- Diem giao hang.
- Diem so luong.
- Diem giao tan kho.
- Diem bao hanh.

### 3.3. Chua co cau hinh trong so diem

Trong so hien dang co dinh:

| Tieu chi | Diem toi da |
| --- | ---: |
| Gia | 30 |
| Chat luong | 25 |
| Uy tin | 20 |
| Thoi gian giao hang | 10 |
| So luong cung ung | 5 |
| Giao tan kho | 5 |
| Bao hanh | 5 |

Can them man hinh cau hinh de nguoi dung co the dieu chinh trong so, nhung tong diem van phai bang 100.

### 3.4. Import Excel that `.xlsx` chua hoan thien

App hien tai ho tro CSV/TSV/JSON va file `.xls` dang XML do app xuat ra. Can nang cap de doc file `.xlsx` that vi day la dinh dang nguoi dung se dung nhieu nhat.

### 3.5. Connector san thuong mai moi o muc so bo

Connector hien tai chi lay du lieu cong khai theo kieu best-effort. Neu san chan crawler hoac trang render bang JavaScript, app tra ve trang thai can nhap tay. Can tach tung connector va hien ro do tin cay cua du lieu.

## 4. Cong thuc tinh diem can chot cho ban tiep theo

Tong diem toi da: 100.

| Tieu chi | Diem toi da | Quy tac |
| --- | ---: | --- |
| Gia | 30 | Tong tien cang thap diem cang cao |
| Chat luong | 25 | Nhap 0-100 hoac 1-5 sao, quy doi ve 0-100 |
| Uy tin | 20 | Nhap 0-100 hoac tinh tu rating/review neu co |
| Giao hang | 10 | So ngay giao cang it diem cang cao |
| So luong | 5 | Du so luong can mua duoc diem toi da |
| Giao tan kho | 5 | Co giao den kho ben mua duoc diem toi da |
| Bao hanh | 5 | Bao hanh ro rang va dai han duoc diem cao |

Cong thuc tong tien:
```
tong_tien = gia_san_pham * so_luong_can_mua + phi_van_chuyen
```

Cong thuc diem gia:
```
diem_gia = ((tong_tien_cao_nhat - tong_tien_nha_cung_cap) / (tong_tien_cao_nhat - tong_tien_thap_nhat)) * 30
```

## 5. Nang cap giao dien

### 5.1. Man hinh yeu cau mua hang

Can giu cac truong:

- Ten san pham.
- Hinh anh san pham.
- Model/ma hang.
- Thong so ky thuat.
- So luong can mua.
- Don vi tinh.
- Kho nhan hang.
- Ghi chu.

Can them:

- Ty gia VND/CNY/USD neu co du lieu tu san quoc te.
- Muc uu tien: uu tien gia re, uu tien uy tin, uu tien giao nhanh, can bang.

### 5.2. Bang nha cung cap

Co cac cot:

- Ten nha cung cap.
- San nguon.
- Gia san pham.
- Tien te.
- Phi van chuyen.
- Tong tien.
- Thoi gian giao hang.
- So luong cung ung.
- Giao tan kho.
- Chat luong.
- Uy tin.
- Bao hanh.
- Link mua hang/link bao gia.
- Trang thai du lieu.

### 5.3. Bang ket qua xep hang

Can hien:

- Hang.
- Ten nha cung cap.
- Tong tien.
- Tong diem.
- Diem tung tieu chi.
- Ly do xep hang.
- Rui ro can kiem tra.
- Link nguon.

### 5.4. Top 5 de xuat

Moi nha cung cap trong Top 5 can hien:

- Diem manh.
- Diem yeu.
- Ly do nen chon.
- Du lieu nao can kiem tra lai.
- Nut mo link nguon.

## 6. Nang cap import/export

### 6.1. Import

Co ho tro:

- CSV.
- TSV.
- JSON.
- XLS do app xuat ra.
- XLSX that.

Ten cot can tu dong map:

- `supplier_name`, `ten nha cung cap`, `nha cung cap`.
- `unit_price`, `gia`, `don gia`, `giá sản phẩm`.
- `shipping_fee`, `phi ship`, `phi van chuyen`.
- `estimated_delivery_days`, `ngay giao`, `thoi gian giao hang`.
- `available_quantity`, `so luong`, `so luong cung cap`.
- `deliver_to_buyer_warehouse`, `giao tan kho`, `giao kho ben mua`.
- `quality`, `chat luong`.
- `reputation`, `uy tin`.
- `warranty_policy`, `bao hanh`.
- `product_url`, `link`, `link san pham`, `link bao gia`.

Sau import, app phai hien canh bao neu thieu:

- Gia.
- Phi van chuyen.
- Thoi gian giao hang.
- Bao hanh.
- Link nguon.
- Ten nha cung cap.

### 6.2. Export

File xuat can co cac sheet:

- Thong tin yeu cau mua hang.
- Toan bo nha cung cap.
- Diem chi tiet.
- Top 5 de xuat.
- Du lieu thieu/can kiem tra.
- Cong thuc tinh diem.

## 7. Nang cap lay du lieu cong khai tu san

### 7.1. Cải tiến connector cho từng sàn (Shopee, Tiki, Alibaba, Taobao, 1688)
- **Headless browser** (Puppeteer/Playwright) được tích hợp để render các trang có JavaScript động, cho phép truy cập tới nội dung được tạo bằng AJAX.
- **Xác định URL sản phẩm**: Khi người dùng nhập URL của một sản phẩm trên Shopee, connector sẽ tự động điều hướng tới trang chi tiết của nhà cung cấp (seller shop) và thu thập giá bán của từng nhà cung cấp nếu có (ví dụ: “Shop này bán X VND”).
- **Crawl sâu tới các nhà cung cấp**: Nếu trang danh sách sản phẩm chỉ hiển thị giá tổng hợp, connector sẽ thực hiện các bước:
  1. Lấy danh sách các nhà cung cấp (seller IDs) từ API nội bộ hoặc từ phần HTML/JSON trong trang.
  2. Đối với mỗi seller, mở trang chi tiết (có thể là `https://shopee.vn/product/.../seller/...`).
  3. Trích xuất giá, phí vận chuyển, thời gian giao hàng, đánh giá, bảo hành.
- **Xử lý anti‑scraping**: Sử dụng random user‑agent, chờ thời gian ngẫu nhiên, và rotate proxies khi cần. Khi gặp CAPTCHA hoặc block, connector sẽ ghi lại trạng thái `manual_required` và thông báo cho người dùng nhập tay.
- **Cache kết quả**: Kết quả được lưu vào SQLite (`src/cache.js`) để tránh gọi lại quá thường xuyên và giảm tải lên các nền tảng.
- **Fallback API**: Đối với Shopee và Tiki, nếu có API công khai (không yêu cầu authentication), ưu tiên sử dụng API để lấy dữ liệu nhanh hơn và giảm nguy cơ block.
- **Chuẩn hoá dữ liệu**: Kết quả luôn trả về cùng cấu trúc JSON:
```json
{
  "source_platform": "shopee",
  "product_name": "...",
  "supplier_name": "...",
  "unit_price": 123456,
  "currency": "VND",
  "shipping_fee": 15000,
  "estimated_delivery_days": 3,
  "warranty_policy": "12 thang",
  "fetch_status": "complete",
  "raw_data": { ... }
}
```
- **Log chi tiết**: Mỗi lần thực hiện connector sẽ ghi log (thành công, lỗi, thời gian) vào `src/connectors.log` để hỗ trợ debug.

### 7.2. Kiểm tra và báo cáo
- Khi connector trả về `complete`, hệ thống tính điểm và cập nhật bảng kết quả.
- Khi trả về `missing_data` hoặc `manual_required`, UI sẽ hiển thị thông báo màu vàng và cho phép người dùng nhập dữ liệu còn thiếu.
- Khi trả về `blocked`, UI sẽ hiển thị thông báo đỏ kèm nút “Mở link nguồn” để người dùng tự kiểm tra.

## 8. Ke hoach trien khai tiep theo

### Buoc 1: Sua logic tinh diem
- Sua bao hanh `12` thanh `12 thang`.
- Hien diem thanh phan trong bang ket qua.
- Lam tron diem nhat quan.
- Them canh bao khi thieu du lieu quan trong.

### Buoc 2: Nang cap giao dien ket qua
- Them cot diem thanh phan.
- Them cot rui ro/canh bao.
- Lam Top 5 de doc hon.
- Hien ro nha cung cap nao re nhat, uy tin nhat, giao nhanh nhat.

### Buoc 3: Them cau hinh trong so
- Tao khu vuc cau hinh diem.
- Cho nguoi dung sua trong so.
- Kiem tra tong trong so phai bang 100.
- Luu cau hinh vao SQLite.

### Buoc 4: Nang cap import Excel
- Them doc file `.xlsx`.
- Map cot tieng Viet va tieng Anh.
- Hien preview truoc khi import vao bang.
- Bao loi theo tung dong.

### Buoc 5: Nang cap lich su
- Xoa yeu cau mua hang.
- Nhan ban yeu cau mua hang.
- Sua yeu cau cu va tinh diem lai.
- Tim kiem trong lich su.

### Buoc 6: Nang cap connector san
- Tach tung connector thanh file rieng.
- Them timeout/retry.
- Ghi lai log loi.
- Hien trang thai lay du lieu cho tung san.

### Buoc 7: Dong goi app
- Tao lenh chay don gian.
- Tao file huong dan su dung.
- Neu can, dong goi thanh app Windows sau.

## 9. Test nghiem thu

Can test cac truong hop sau:

- Nhap 10 nha cung cap va tra ve dung Top 5.
- Nha cung cap re nhat nhung uy tin thap khong mac dinh dung dau.
- Nha cung cap thieu gia khong duoc xep hang.
- Nha cung cap giao nhanh nhung gia cao duoc tinh diem can bang.
- Bao hanh `12`, `12 thang`, `24 thang`, `khong bao hanh` duoc tinh dung.
- Phi van chuyen anh huong dung den tong tien.
- Import CSV dung.
- Import XLSX dung sau khi nang cap.
- Export file mo duoc bang Excel.
- Luu lich su, mo lai, sua va tinh diem lai khong mat du lieu.
- San bi chan thi app khong crash va hien `manual_required` hoac `blocked`.

## 10. Ket qua mong muon cua phien ban tiep theo

Nguoi dung co the:

- Nhap thong tin san pham va nhu cau mua hang.
- Nhap tay hoac import bao gia nha cung cap.
- Lay them du lieu cong khai tu cac san khi co the.
- Nhin thay tong tien, tong diem va diem tung tieu chi.
- Hieu vi sao nha cung cap duoc xep hang cao/thap.
- Xem Top 5 nha cung cấp nen chon.
- Mo link nguon de kiem tra lai.
- Luu lich su va xuat Excel gui cho nguoi khac.

Uu tien gan nhat: sua tinh diem bao hanh, hien diem thanh phan, nang cap import XLSX va lam bang ket qua ro rang hon.
