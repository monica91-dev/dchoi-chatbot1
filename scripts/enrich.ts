// (선택) 상세페이지가 대부분 "이미지"라서 글자를 그대로 가져올 수 없습니다.
// 이 스크립트는 Claude 가 상세 이미지를 직접 보고 내용을 글로 정리해 data/products.json 에 넣어 줍니다.
// .env.local 에 ANTHROPIC_API_KEY 를 넣은 뒤 실행: npm run enrich
// 이미 요약이 있는 상품은 건너뜁니다. 전부 다시 하려면: npm run enrich -- --force
import fs from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import sharp from "sharp";
import type { Product } from "../src/lib/types";

process.loadEnvFile?.(".env.local");

const MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-5-5";
const MAX_IMAGES = 12; // 상품 하나당 볼 원본 이미지 수 (많을수록 비용 증가)
const MAX_TILES = 40; // 잘라낸 조각을 합쳐 최대 몇 장까지 보낼지
const TILE_WIDTH = 1000; // 글자가 잘 읽히는 너비
const TILE_HEIGHT = 1600; // 세로로 긴 상세 이미지를 이 높이로 잘라서 보냅니다
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

// 상세 이미지는 세로로 아주 길어서(8000px 넘음) 그대로 보내면 거절됩니다.
// 직접 내려받아 너비를 줄이고 세로로 잘라 여러 장으로 보냅니다.
async function imageTiles(url: string): Promise<Anthropic.ImageBlockParam[]> {
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 dchoi-chatbot" } });
  if (!res.ok) throw new Error(`${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const resized = await sharp(buf, { limitInputPixels: false }) // GIF 는 첫 장면만
    .flatten({ background: "#ffffff" })
    .resize({ width: TILE_WIDTH, withoutEnlargement: true })
    .toBuffer({ resolveWithObject: true });
  const { width, height } = resized.info;
  const tiles: Anthropic.ImageBlockParam[] = [];
  for (let top = 0; top < height; top += TILE_HEIGHT) {
    const h = Math.min(TILE_HEIGHT, height - top);
    if (h < 40) break; // 너무 얇은 자투리는 건너뜀
    const tile = await sharp(resized.data).extract({ left: 0, top, width, height: h }).jpeg({ quality: 80 }).toBuffer();
    tiles.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: tile.toString("base64") } });
  }
  return tiles;
}

async function summarize(p: Product): Promise<string> {
  const urls = p.detailImages.filter((u) => !/logo|icon|btn|button/i.test(u)).slice(0, MAX_IMAGES);
  const images: Anthropic.ImageBlockParam[] = [];
  for (const url of urls) {
    if (images.length >= MAX_TILES) break;
    try {
      images.push(...(await imageTiles(url)));
    } catch (e) {
      console.warn(`  [이미지 건너뜀] ${p.title}: ${url.slice(0, 80)} (${(e as Error).message.slice(0, 60)})`);
    }
  }
  if (!images.length && p.description.length < 50) return "";

  const content: Anthropic.ContentBlockParam[] = [
    ...images.slice(0, MAX_TILES),
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
  const limitArg = process.argv.indexOf("--limit"); // 시험용: npm run enrich -- --limit 2
  const limit = limitArg > 0 ? Number(process.argv[limitArg + 1]) : Infinity;
  // 특정 상품만 다시: npm run enrich -- --titles 목록파일.txt (한 줄에 상품명 하나)
  const titlesArg = process.argv.indexOf("--titles");
  const only = titlesArg > 0 ? new Set(fs.readFileSync(process.argv[titlesArg + 1], "utf8").split("\n").map((t) => t.trim()).filter(Boolean)) : null;
  const todo = products.filter((p) => (only ? only.has(p.title) : force || !p.detailSummary)).slice(0, limit);
  console.log(`상세 이미지 요약 대상: ${todo.length}개 (모델: ${MODEL})`);

  let done = 0;
  const worker = async () => {
    for (let p = todo.shift(); p; p = todo.shift()) {
      try {
        p.detailSummary = await summarize(p);
      } catch (e) {
        // 요청이 거절된 경우: 이미지 없이 텍스트로만 다시 시도
        console.warn(`  [다시 시도] ${p.title}: ${(e as Error).message.slice(0, 300)}`);
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
