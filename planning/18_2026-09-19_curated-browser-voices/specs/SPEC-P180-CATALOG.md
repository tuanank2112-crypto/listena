# SPEC-P180 — Catalog giọng Anh miễn phí + công thức xếp hạng

## 1. Vấn đề

Plan14 xếp hạng giọng theo **tier** suy ra từ chuỗi tên (`natural|neural|premium|enhanced|siri`). Trên một máy Windows có Edge, tier NEURAL có thể gồm 10+ giọng Microsoft Natural; giọng được chọn cuối cùng là giọng **đứng đầu bảng chữ cái** (`Andrew` trước `Ava`, `Aria` trước `Emma`). Không ai thẩm định giọng đó có dễ nghe cho người mới học hay không. Đó chính là thứ user mô tả: "chưa thanh thoát, chưa dễ nghe".

## 2. Giải pháp

Một catalog tĩnh các giọng **đã thẩm định**, khớp theo tên chuẩn hoá, cộng điểm `listenability` (0..99) **trong phạm vi tier**.

```
quality = TIER_RANK[tier] * 100 + (curated?.listenability ?? 0)
TIER_RANK = { NEURAL: 4, PREMIUM: 3, SYSTEM: 2, REMOTE: 1 }
```

Thứ tự sắp xếp cuối cùng trong `rankEnglishVoices`:

1. `accentScore` giảm dần (2 = đúng accent, 1 = tiếng Anh accent khác) — **không đổi so với Plan14**
2. `quality` giảm dần — **mới**
3. `voice.default` (true trước) — không đổi
4. `voice.localService` (true trước) — không đổi
5. `name.localeCompare` — không đổi

**BẮT BUỘC:** điểm catalog tối đa 99 ⇒ không bao giờ vượt một bậc tier. **CẤM** đổi hằng 100 thành số nhỏ hơn 100.

## 3. Chuẩn hoá tên (`normaliseVoiceName`)

Web Speech trả tên rất khác nhau: `Microsoft Ava Online (Natural) - English (United States)` (Edge), `Ava (Premium)` (macOS), `Google UK English Female` (Chrome), `Microsoft Zira Desktop - English (United States)` (SAPI cũ).

Thuật toán, theo đúng thứ tự:

1. `trim()`; nếu có `" - "` thì **cắt bỏ từ đó về sau** (đuôi locale).
2. `toLowerCase()`.
3. Xoá ngoặc đơn chứa từ chất lượng hoặc chứa `english`: `/\((?:enhanced|premium|natural|online|compact|legacy)\)/g` và `/\([^)]*english[^)]*\)/g`.
4. Xoá nhãn hãng **trừ `google`**: `/\b(?:microsoft|apple)\b/g`. Giữ `google` vì tên giọng Google không có phần định danh nào khác (`Google UK English Female`).
5. Xoá từ chất lượng rời: `/\b(?:online|natural|enhanced|premium|compact|desktop|mobile|multilingual|voice)\b/g`.
6. Xoá ký tự không phải `[a-z0-9 ]`, gộp khoảng trắng, `trim()`.

Ví dụ bắt buộc đúng (ghim bằng test):

| Tên thô | Khoá |
|---|---|
| `Microsoft Ava Online (Natural) - English (United States)` | `ava` |
| `Microsoft Ava (Natural) - English (United States)` | `ava` |
| `Ava (Premium)` | `ava` |
| `Microsoft Sonia Online (Natural) - English (United Kingdom)` | `sonia` |
| `Google UK English Female` | `google uk english female` |
| `Microsoft Zira Desktop - English (United States)` | `zira` |
| `Siri Voice 1 (American English)` | `siri 1` |
| `` (rỗng) | `` |

## 4. Catalog (BẮT BUỘC đủ các mục này)

### en-US

| key | label | platform | gender | listenability |
|---|---|---|---|---|
| `ava` | Ava | Microsoft Natural | female | 96 |
| `emma` | Emma | Microsoft Natural | female | 93 |
| `andrew` | Andrew | Microsoft Natural | male | 92 |
| `brian` | Brian | Microsoft Natural | male | 90 |
| `jenny` | Jenny | Microsoft Natural | female | 86 |
| `aria` | Aria | Microsoft Natural | female | 84 |
| `michelle` | Michelle | Microsoft Natural | female | 82 |
| `guy` | Guy | Microsoft Natural | male | 78 |
| `roger` | Roger | Microsoft Natural | male | 74 |
| `steffan` | Steffan | Microsoft Natural | male | 72 |
| `christopher` | Christopher | Microsoft Natural | male | 84 |
| `eric` | Eric | Microsoft Natural | male | 80 |
| `ana` | Ana | Microsoft Natural | female | 50 |
| `siri 1` (alias `siri 2`,`siri 3`,`siri 4`,`siri`) | Siri | Apple | female | 88 |
| `alex` | Alex | Apple | male | 86 |
| `nicky` | Nicky | Apple | female | 84 |
| `aaron` | Aaron | Apple | male | 82 |
| `allison` | Allison | Apple | female | 84 |
| `zoe` | Zoe | Apple | female | 84 |
| `samantha` | Samantha | Apple | female | 82 |
| `joelle` | Joelle | Apple | female | 78 |
| `evan` | Evan | Apple | male | 76 |
| `noelle` | Noelle | Apple | female | 76 |
| `nathan` | Nathan | Apple | male | 74 |
| `tom` | Tom | Apple | male | 72 |
| `susan` | Susan | Apple | female | 70 |
| `google us english` | Google US English | Google | female | 60 |
| `zira` | Zira | Microsoft (cũ) | female | 34 |
| `david` | David | Microsoft (cũ) | male | 32 |
| `mark` | Mark | Microsoft (cũ) | male | 30 |

### en-GB

| key | label | platform | gender | listenability |
|---|---|---|---|---|
| `sonia` | Sonia | Microsoft Natural | female | 94 |
| `ryan` | Ryan | Microsoft Natural | male | 90 |
| `libby` | Libby | Microsoft Natural | female | 86 |
| `thomas` | Thomas | Microsoft Natural | male | 78 |
| `serena` | Serena | Apple | female | 86 |
| `daniel` | Daniel | Apple | male | 84 |
| `kate` | Kate | Apple | female | 82 |
| `stephanie` | Stephanie | Apple | female | 80 |
| `arthur` | Arthur | Apple | male | 80 |
| `oliver` | Oliver | Apple | male | 76 |
| `jamie` | Jamie | Apple | male | 74 |
| `martha` | Martha | Apple | female | 72 |
| `google uk english female` | Google UK English Female | Google | female | 62 |
| `google uk english male` | Google UK English Male | Google | male | 58 |
| `maisie` | Maisie | Microsoft Natural | female | 55 |
| `hazel` | Hazel | Microsoft (cũ) | female | 34 |
| `george` | George | Microsoft (cũ) | male | 32 |

**Ghi chú bắt buộc ghi trong `note` của `maisie`:** đây là giọng trẻ em — điểm thấp có chủ ý, không dùng làm mẫu phát âm cho người lớn trừ khi học viên tự chọn.

**Ghi chú bắt buộc tương tự cho `ana`** (Microsoft Natural en-US): cũng là giọng trẻ em, điểm 50 có chủ ý dù nằm trong tier NEURAL.

**Bổ sung 2026-09-19 (theo yêu cầu user "thêm giọng được rating best"):** `christopher`, `eric`, `ana` (Microsoft Natural en-US mà Edge có nhưng đợt đầu bỏ sót), `alex`, `nicky`, `aaron` (Apple en-US; Alex là giọng macOS cổ điển được đánh giá rất cao, Nicky/Aaron thuộc họ giọng Siri), `arthur` (Apple en-GB). Tổng catalog 47 mục. Không mục nào phá luật C1–C7.

## 5. Luật

| # | BẮT BUỘC / CẤM | Lý do |
|---|---|---|
| C1 | Catalog **chỉ cộng điểm**, KHÔNG lọc. Giọng ngoài catalog vẫn được xếp hạng bằng tier. | Bất biến A4. |
| C2 | CẤM để `listenability ≥ 100`. | Giữ bất biến A1. |
| C3 | CẤM ghi `voiceURI` vào catalog. | Bất biến A3. |
| C4 | Một `key` chỉ xuất hiện một lần; alias không được trùng key hay alias khác. Ghim bằng test. | Tra cứu phải xác định. |
| C5 | Giọng trong `EXCLUDED_VOICE_NAMES` (novelty) CẤM đưa vào catalog. | Bất biến A2. |
| C6 | `accent` trong catalog chỉ để **hiển thị và gợi ý cài**; thứ hạng theo accent vẫn đọc từ `voice.lang`. | Máy có thể gắn locale khác. |
| C7 | Thêm giọng mới ⇒ sửa **bảng ở mục 4 trước**, rồi sửa mã, rồi thêm case test. | Chống việc agent sau tự ý nhét tên giọng. |

## 6. Nghiệm thu

- `normaliseVoiceName` đúng cả 8 ví dụ mục 3.
- Trên tập giọng giả lập của một máy Windows/Edge (Ava, Andrew, Aria, Emma + Zira + Google US English), `chooseEnglishVoice(…, "en-US")` trả **Ava**; trước plan này trả `Andrew` (ghim cả hai bằng test để thấy khác biệt thật).
- Bất biến Plan14 còn nguyên: Google luôn xếp sau mọi giọng local cùng accent; giọng đúng accent luôn trước giọng accent khác dù điểm cao hơn; giọng novelty bị loại.
