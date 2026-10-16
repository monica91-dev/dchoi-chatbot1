// dchoi09.com 의 "전집" 카테고리 상품을 상세페이지 내용까지 모아서 data/products.json 으로 저장합니다.
// 실행: npm run crawl
import fs from "node:fs";
import type { Product } from "../src/lib/types";

const SITE = "https://dchoi09.com";
const CATEGORY = "series-books-all"; // 전집 전체
const AGE_COLLECTIONS: Record<string, string> = {
  "0-1세": "전집-0-1-세",
  "1-2세": "전집-1-2-세",
  "2-3세": "전집-2-3세",
  "3-4세": "전집-3-4세",
  "5세 이상": "전집-5세-이상",
};

interface ShopifyVariant {
  title: string;
  price: string;
  compare_at_price: string | null;
  available: boolean;
}
interface ShopifyProduct {
  id: number;
  title: string;
  handle: string;
  body_html: string | null;
  vendor: string;
  product_type: string;
  tags: string[];
  updated_at: string;
  variants: ShopifyVariant[];
  images: { src: string }[];
}

const nfc = (s: string) => s.normalize("NFC");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
}

function htmlToText(html: string): string {
  const text = html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/(p|div|li|h\d|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  return nfc(decodeEntities(text))
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter((l) => l && !/^view product details?\.?$/i.test(l))
    .join("\n");
}

const absUrl = (u: string) => (u.startsWith("//") ? `https:${u}` : u);

async function fetchCollection(handle: string): Promise<ShopifyProduct[]> {
  const all: ShopifyProduct[] = [];
  for (let page = 1; page < 20; page++) {
    const url = `${SITE}/collections/${encodeURIComponent(handle)}/products.json?limit=250&page=${page}`;
    let res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 dchoi-chatbot" } });
    // 너무 빨리 요청하면 사이트가 429(잠깐 기다려 주세요)를 돌려주므로 쉬었다가 다시 시도
    for (let retry = 1; res.status === 429 && retry <= 5; retry++) {
      console.log(`  요청이 많아 ${retry * 5}초 기다립니다...`);
      await sleep(retry * 5000);
      res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 dchoi-chatbot" } });
    }
    if (!res.ok) throw new Error(`${url} -> ${res.status}`);
    await sleep(1500);
    const { products } = (await res.json()) as { products: ShopifyProduct[] };
    all.push(...products);
    if (products.length < 250) break;
  }
  return all;
}

const toNum = (v: string | null | undefined) => (v ? Number(v) : null);

async function main() {
  console.log("전집 카테고리 불러오는 중...");
  const products = await fetchCollection(CATEGORY);
  console.log(`  상품 ${products.length}개`);

  const ages = new Map<number, string[]>();
  for (const [label, handle] of Object.entries(AGE_COLLECTIONS)) {
    const list = await fetchCollection(handle);
    for (const p of list) ages.set(p.id, [...(ages.get(p.id) ?? []), label]);
    console.log(`  ${label}: ${list.length}개`);
  }

  // 이전에 enrich 로 만든 요약은 유지
  const previous = new Map<string, Product>();
  if (fs.existsSync("data/products.json")) {
    for (const p of JSON.parse(fs.readFileSync("data/products.json", "utf8")) as Product[]) previous.set(p.id, p);
  }

  const result: Product[] = products.map((p) => {
    const html = p.body_html ?? "";
    const id = String(p.id);
    return {
      id,
      handle: nfc(p.handle),
      title: nfc(p.title).trim(),
      vendor: nfc(p.vendor),
      productType: nfc(p.product_type),
      tags: p.tags.map(nfc),
      ageGroups: ages.get(p.id) ?? [],
      variants: p.variants.map((v) => ({
        name: nfc(v.title) === "Default Title" ? "기본" : nfc(v.title),
        price: Number(v.price),
        compareAt: toNum(v.compare_at_price),
        available: v.available,
      })),
      available: p.variants.some((v) => v.available),
      url: `${SITE}/products/${encodeURIComponent(nfc(p.handle))}`,
      image: p.images[0]?.src ?? null,
      description: htmlToText(html),
      detailImages: [...html.matchAll(/<img[^>]+src="([^"]+)"/gi)].map((m) => absUrl(decodeEntities(m[1]))),
      externalLinks: [
        ...new Set([...html.matchAll(/href="(https?:[^"]+)"/gi)].map((m) => decodeEntities(m[1]))),
      ],
      detailSummary: previous.get(id)?.detailSummary ?? "",
      updatedAt: p.updated_at,
    };
  });

  fs.mkdirSync("data", { recursive: true });
  fs.writeFileSync("data/products.json", JSON.stringify(result, null, 2));
  console.log(`완료: data/products.json (${result.length}개 상품)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
