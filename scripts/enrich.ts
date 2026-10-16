// (선택) 상세페이지가 대부분 "이미지"라서 글자를 그대로 가져올 수 없습니다.
// 이 스크립트는 Claude 가 상세 이미지를 직접 보고 내용을 글로 정리해 data/products.json 에 넣어 줍니다.
// .env.local 에 ANTHROPIC_API_KEY 를 넣은 뒤 실행: npm run enrich
// 이미 요약이 있는 상품은 건너뜁니다. 전부 다시 하려면: npm run enrich -- --force
import fs from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import type { Product } from "../src/lib/types";

process.loadEnvFile?.(".env.local");

const MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-5-5";
const MAX_IMAGES = 12; // 상품 하나당 볼 이미지 수 (많을수록 비용 증가)
const client = new Anthropic();

const PROMPT = `당신은 한국 유아 전집 상세페이지를 정리하는 담당자입니다.
첨부된 상세페이지 이미지와 텍스트를 읽고, 고객 상담에 필요한 사실만 한국어로 정리하세요.
다음 항목을 짧은 줄글/목록으로 작성하세요(이미지에 없는 내용은 쓰지 마세요):
- 한 줄 소개
- 대상 연령
- 구성 (권수, 부속품, 세이펜/음원 지원 여부 등)
- 주요 특징과 학습 효과 (3~6개)
- 주의사항/수령 일정 등 안내 문구
확실하지 않은 내용은 "확인 필요"라고 적으세요. 제목이나 머리말 없이 바로 내용만 출력하세요.`;

async function summarize(p: Product): Promise<string> {
  const images = p.detailImages.filter((u) => !/logo|icon|btn|button/i.test(u)).slice(0, MAX_IMAGES);
  if (!images.length && p.description.length < 50) return "";

  const content: Anthropic.ContentBlockParam[] = [
    ...images.map((url): Anthropic.ImageBlockParam => ({ type: "image", source: { type: "url", url } })),
    { type: "text", text: `상품명: ${p.title}\n출판사: ${p.vendor}\n상세 텍스트:\n${p.description.slice(0, 4000)}\n\n${PROMPT}` },
  ];

  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 4000,
    output_config: { effort: "low" },
    messages: [{ role: "user", content }],
  });
  if (res.stop_reason === "refusal") return "";
  return res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

async function main() {
  const file = "data/products.json";
  const products = JSON.parse(fs.readFileSync(file, "utf8")) as Product[];
  const force = process.argv.includes("--force");
  const todo = products.filter((p) => force || !p.detailSummary);
  console.log(`상세 이미지 요약 대상: ${todo.length}개 (모델: ${MODEL})`);

  let done = 0;
  const worker = async () => {
    for (let p = todo.shift(); p; p = todo.shift()) {
      try {
        p.detailSummary = await summarize(p);
      } catch (e) {
        // 이미지 주소가 깨졌거나 너무 큰 경우: 이미지 없이 텍스트로만 다시 시도
        console.warn(`  [다시 시도] ${p.title}: ${(e as Error).message.slice(0, 120)}`);
        try {
          p.detailSummary = await summarize({ ...p, detailImages: [] });
        } catch {
          p.detailSummary = "";
        }
      }
      done++;
      console.log(`  (${done}) ${p.title} ${p.detailSummary ? "✓" : "-"}`);
      fs.writeFileSync(file, JSON.stringify(products, null, 2)); // 중간에 멈춰도 저장되도록
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  console.log("완료! 이제 npm run excel 로 엑셀을 다시 만드세요.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
