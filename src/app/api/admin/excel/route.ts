// 엑셀 내려받기(GET) / 엑셀 올려서 상품·Q&A 바꾸기(POST)
import { isAdmin, unauthorized } from "@/lib/auth";
import { buildWorkbook, parseWorkbook } from "@/lib/excel";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";

export async function GET() {
  if (!(await isAdmin())) return unauthorized();
  const store = getStore();
  const [products, qa] = await Promise.all([store.getProducts(), store.getQA()]);
  const file = await buildWorkbook(products, qa);
  const name = `dchoi09_전집_${new Date().toISOString().slice(0, 10)}.xlsx`;
  return new Response(new Uint8Array(file), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
    },
  });
}

export async function POST(req: Request) {
  if (!(await isAdmin())) return unauthorized();
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return Response.json({ error: "엑셀 파일을 선택해 주세요." }, { status: 400 });
  try {
    const { products, qa } = await parseWorkbook(await file.arrayBuffer());
    const store = getStore();
    if (products?.length) await store.saveProducts(products);
    if (qa?.length) await store.saveQA(qa);
    return Response.json({ products: products?.length ?? 0, qa: qa?.length ?? 0 });
  } catch (e) {
    return Response.json({ error: `엑셀을 읽지 못했습니다: ${(e as Error).message}` }, { status: 400 });
  }
}
