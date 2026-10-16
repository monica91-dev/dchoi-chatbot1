// 챗봇이 학습한 상품 목록
import { isAdmin, unauthorized } from "@/lib/auth";
import { getStore } from "@/lib/store";

export async function GET() {
  if (!(await isAdmin())) return unauthorized();
  return Response.json({ products: await getStore().getProducts() });
}
