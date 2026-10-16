// 상품 정보와 Q&A 를 챗봇이 읽을 수 있는 글로 바꾸는 곳
import type { Product, QAItem } from "./types";

export const usd = (n: number | null | undefined) => (n == null ? "-" : `$${n.toFixed(2)}`);

export function variantsText(p: Product): string {
  return p.variants
    .map((v) => {
      const sale = v.compareAt && v.compareAt > v.price ? ` (정가 ${usd(v.compareAt)})` : "";
      return `${v.name}: ${usd(v.price)}${sale}${v.available ? "" : " [품절]"}`;
    })
    .join(" / ");
}

export function productToText(p: Product): string {
  const lines = [
    `### ${p.title}`,
    `- 출판사/브랜드: ${p.vendor}`,
    `- 추천 연령: ${p.ageGroups.join(", ") || "정보 없음"}`,
    `- 분류 태그: ${p.tags.join(", ")}`,
    `- 가격(수령방법별): ${variantsText(p)}`,
    `- 판매 상태: ${p.available ? "구매 가능" : "품절"}`,
    `- 상품 페이지: ${p.url}`,
  ];
  if (p.description) lines.push(`- 상세페이지 내용:\n${indent(truncate(p.description, 2500))}`);
  if (p.detailSummary) lines.push(`- 상세 이미지 요약:\n${indent(p.detailSummary)}`);
  if (p.externalLinks.length) lines.push(`- 출판사 소개 링크: ${p.externalLinks.slice(0, 3).join(" , ")}`);
  return lines.join("\n");
}

const indent = (s: string) =>
  s
    .split("\n")
    .map((l) => `    ${l}`)
    .join("\n");
const truncate = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);

export function buildKnowledge(products: Product[], qa: QAItem[]): string {
  const qaText = qa
    .map((q) => `Q: ${q.question}\nA: ${q.answer}${q.product ? `\n(관련 상품: ${q.product})` : ""}`)
    .join("\n\n");
  return [
    `<qa_list>\n운영자가 직접 작성한 질의응답입니다. 상품 정보와 다르면 이 답변을 우선하세요.\n\n${qaText}\n</qa_list>`,
    `<products count="${products.length}">\ndchoi09.com 전집 카테고리 상품 목록입니다. 가격은 미국 달러(USD)입니다.\n\n${products
      .map(productToText)
      .join("\n\n")}\n</products>`,
  ].join("\n\n");
}

// 엑셀을 처음 만들 때 넣어 둘 기본 Q&A
export function generateSeedQA(products: Product[]): QAItem[] {
  const now = new Date().toISOString();
  let n = 0;
  const item = (category: string, product: string, question: string, answer: string): QAItem => ({
    id: `qa-${String(++n).padStart(4, "0")}`,
    category,
    product,
    question,
    answer,
    updatedAt: now,
  });

  const general: QAItem[] = [
    item("주문/결제", "", "Zelle로 결제하면 할인이 되나요?", "네, Zelle로 결제하시면 추가 3% 할인을 받으실 수 있어요. 결제 단계에서 ZELLE 코드를 확인해 주세요."),
    item("주문/결제", "", "주문하려면 회원가입을 해야 하나요?", "네, 주문 시 신규 회원가입이 필수입니다."),
    item("주문/결제", "", "배송 상품과 픽업 상품을 한 번에 결제해도 되나요?", "수령 방법이 같은 상품끼리 결제해 주세요. 예를 들어 픽업할 상품만 골라서 따로 결제하시면 됩니다."),
    item("픽업/배송", "", "픽업 주문 전에 확인할 것이 있나요?", "픽업 주문 전에는 꼭 재고를 확인해 주세요. 홈페이지 메뉴의 '재고 조회 & 픽업 예약'에서 확인하실 수 있어요. 로컬 배송이나 픽업 주문은 주문 완료 후 카카오톡 지역방에 입장해 주세요."),
    item("픽업/배송", "", "픽업은 어느 지역에서 할 수 있나요?", "상품마다 다릅니다. SoCal, NJ/NY, DMV 등 상품 상세페이지의 수령 방법 옵션에 표시된 지역에서만 픽업이 가능해요. 원하시는 상품명을 알려주시면 확인해 드릴게요."),
    item("문의", "", "사람 상담원과 이야기하고 싶어요.", "홈페이지의 채널톡 1:1 문의 또는 이메일 david@dchoiglobal.com 으로 연락해 주시면 담당자가 도와드립니다."),
    item("주문/결제", "", "주문 전에 꼭 읽어야 할 것이 있나요?", "상품 상세 페이지 안의 주의사항을 꼭 확인한 뒤 주문해 주세요."),
  ];

  const perProduct = products.flatMap((p) => [
    item("가격", p.title, `${p.title} 가격이 얼마예요?`, `${p.title}의 가격은 ${variantsText(p)} 입니다. (USD 기준, 변동될 수 있어요)`),
    item(
      "연령",
      p.title,
      `${p.title}는 몇 살 아이에게 맞나요?`,
      p.ageGroups.length
        ? `${p.title}는 ${p.ageGroups.join(", ")} 아이에게 추천드려요.`
        : `${p.title}의 추천 연령 정보는 상세페이지에서 확인해 주세요: ${p.url}`,
    ),
  ]);

  return [...general, ...perProduct];
}
