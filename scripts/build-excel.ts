// data/products.json 으로 엑셀 파일(data/dchoi09_전집.xlsx)과 기본 Q&A(data/qa.json)를 만듭니다.
// 실행: npm run excel
import fs from "node:fs";
import { buildWorkbook } from "../src/lib/excel";
import { generateSeedQA } from "../src/lib/knowledge";
import type { Product, QAItem } from "../src/lib/types";

async function main() {
  const products = JSON.parse(fs.readFileSync("data/products.json", "utf8")) as Product[];

  // 이미 qa.json 이 있으면 그대로 쓰고, 없을 때만 새로 만듭니다. (새로 만들려면 --new-qa)
  let qa: QAItem[];
  if (fs.existsSync("data/qa.json") && !process.argv.includes("--new-qa")) {
    qa = JSON.parse(fs.readFileSync("data/qa.json", "utf8"));
  } else {
    qa = generateSeedQA(products);
    fs.writeFileSync("data/qa.json", JSON.stringify(qa, null, 2));
  }

  const file = "data/dchoi09_전집.xlsx";
  fs.writeFileSync(file, await buildWorkbook(products, qa));
  console.log(`완료: ${file} (상품 ${products.length}개, Q&A ${qa.length}개)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
