// 엑셀 파일 만들기 / 읽기
import ExcelJS from "exceljs";
import type { Product, QAItem } from "./types";

const PRODUCT_COLUMNS: { header: string; key: string; width: number }[] = [
  { header: "상품ID", key: "id", width: 16 },
  { header: "상품명", key: "title", width: 40 },
  { header: "출판사/브랜드", key: "vendor", width: 14 },
  { header: "추천연령", key: "ageGroups", width: 18 },
  { header: "분류태그", key: "tags", width: 30 },
  { header: "가격옵션", key: "variants", width: 50 },
  { header: "판매상태", key: "available", width: 10 },
  { header: "상품URL", key: "url", width: 40 },
  { header: "대표이미지", key: "image", width: 30 },
  { header: "상세페이지텍스트", key: "description", width: 60 },
  { header: "상세이미지요약", key: "detailSummary", width: 60 },
  { header: "상세이미지URL", key: "detailImages", width: 40 },
  { header: "외부소개링크", key: "externalLinks", width: 40 },
  { header: "수정일", key: "updatedAt", width: 22 },
];

const QA_COLUMNS = [
  { header: "ID", key: "id", width: 10 },
  { header: "분류", key: "category", width: 12 },
  { header: "관련상품", key: "product", width: 36 },
  { header: "질문", key: "question", width: 50 },
  { header: "답변", key: "answer", width: 80 },
  { header: "수정일", key: "updatedAt", width: 22 },
];

// 엑셀 칸 하나에 넣을 수 있는 글자 수 한도
const cell = (s: string) => (s.length > 32000 ? s.slice(0, 32000) : s);

function styleHeader(ws: ExcelJS.Worksheet) {
  const row = ws.getRow(1);
  row.font = { bold: true, color: { argb: "FFFFFFFF" } };
  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF000000" } };
  ws.views = [{ state: "frozen", ySplit: 1 }];
}

export async function buildWorkbook(products: Product[], qa: QAItem[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "dchoi chatbot";

  const ws = wb.addWorksheet("상품목록");
  ws.columns = PRODUCT_COLUMNS;
  for (const p of products) {
    ws.addRow({
      ...p,
      ageGroups: p.ageGroups.join(", "),
      tags: p.tags.join(", "),
      variants: p.variants
        .map((v) => `${v.name} | ${v.price} | ${v.compareAt ?? ""} | ${v.available ? "Y" : "N"}`)
        .join("\n"),
      available: p.available ? "판매중" : "품절",
      image: p.image ?? "",
      description: cell(p.description),
      detailSummary: cell(p.detailSummary),
      detailImages: cell(p.detailImages.join("\n")),
      externalLinks: p.externalLinks.join("\n"),
    });
  }
  styleHeader(ws);

  const qs = wb.addWorksheet("Q&A");
  qs.columns = QA_COLUMNS;
  for (const q of qa) qs.addRow(q);
  styleHeader(qs);
  qs.getColumn("answer").alignment = { wrapText: true, vertical: "top" };

  const guide = wb.addWorksheet("안내");
  guide.addRows([
    ["dchoi09.com 전집 카테고리 챗봇 학습 데이터"],
    [`만든 날짜: ${new Date().toISOString()}`],
    [`상품 수: ${products.length}, Q&A 수: ${qa.length}`],
    [""],
    ["가격옵션 칸 형식: 옵션이름 | 가격 | 정가 | 구매가능(Y/N)  (한 줄에 옵션 하나)"],
    ["관리자 페이지에서 이 엑셀을 다시 올리면 상품목록과 Q&A가 통째로 바뀝니다."],
  ]);
  guide.getColumn(1).width = 90;

  return Buffer.from(await wb.xlsx.writeBuffer());
}

const str = (v: ExcelJS.CellValue): string => {
  if (v == null) return "";
  if (typeof v === "object") {
    if ("richText" in v) return v.richText.map((t) => t.text).join("");
    if ("text" in v) return String(v.text);
    if ("result" in v) return String(v.result ?? "");
    if (v instanceof Date) return v.toISOString();
  }
  return String(v);
};

function sheetRows(ws: ExcelJS.Worksheet | undefined): Record<string, string>[] {
  if (!ws) return [];
  const headers: string[] = [];
  ws.getRow(1).eachCell((c, i) => (headers[i] = str(c.value).trim()));
  const rows: Record<string, string>[] = [];
  ws.eachRow((row, i) => {
    if (i === 1) return;
    const r: Record<string, string> = {};
    headers.forEach((h, col) => h && (r[h] = str(row.getCell(col).value).trim()));
    if (Object.values(r).some(Boolean)) rows.push(r);
  });
  return rows;
}

const list = (s: string, sep: RegExp) =>
  s
    .split(sep)
    .map((x) => x.trim())
    .filter(Boolean);

export async function parseWorkbook(data: ArrayBuffer): Promise<{ products: Product[] | null; qa: QAItem[] | null }> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(data);
  const now = new Date().toISOString();

  const pSheet = wb.getWorksheet("상품목록");
  const products = pSheet
    ? sheetRows(pSheet)
        .filter((r) => r["상품명"])
        .map((r, i): Product => ({
          id: r["상품ID"] || `row-${i + 1}`,
          handle: "",
          title: r["상품명"],
          vendor: r["출판사/브랜드"] ?? "",
          productType: "전집",
          tags: list(r["분류태그"] ?? "", /,/),
          ageGroups: list(r["추천연령"] ?? "", /,/),
          variants: list(r["가격옵션"] ?? "", /\n/).map((line) => {
            const [name, price, compareAt, avail] = line.split("|").map((x) => x.trim());
            return {
              name: name || "기본",
              price: Number(price) || 0,
              compareAt: compareAt ? Number(compareAt) : null,
              available: avail !== "N",
            };
          }),
          available: r["판매상태"] !== "품절",
          url: r["상품URL"] ?? "",
          image: r["대표이미지"] || null,
          description: r["상세페이지텍스트"] ?? "",
          detailSummary: r["상세이미지요약"] ?? "",
          detailImages: list(r["상세이미지URL"] ?? "", /\n/),
          externalLinks: list(r["외부소개링크"] ?? "", /\n/),
          updatedAt: r["수정일"] || now,
        }))
    : null;

  const qSheet = wb.getWorksheet("Q&A");
  const qa = qSheet
    ? sheetRows(qSheet)
        .filter((r) => r["질문"] && r["답변"])
        .map((r, i): QAItem => ({
          id: r["ID"] || `qa-${Date.now()}-${i}`,
          category: r["분류"] ?? "",
          product: r["관련상품"] ?? "",
          question: r["질문"],
          answer: r["답변"],
          updatedAt: r["수정일"] || now,
        }))
    : null;

  return { products, qa };
}
