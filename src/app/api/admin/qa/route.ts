// 질의응답(Q&A) 목록 보기 / 추가 / 수정 / 삭제
import { isAdmin, unauthorized } from "@/lib/auth";
import { getStore } from "@/lib/store";
import type { QAItem } from "@/lib/types";

const clean = (b: Partial<QAItem>) => ({
  category: (b.category ?? "").trim(),
  product: (b.product ?? "").trim(),
  question: (b.question ?? "").trim(),
  answer: (b.answer ?? "").trim(),
});

export async function GET() {
  if (!(await isAdmin())) return unauthorized();
  return Response.json({ qa: await getStore().getQA() });
}

export async function POST(req: Request) {
  if (!(await isAdmin())) return unauthorized();
  const item = clean(await req.json());
  if (!item.question || !item.answer) return Response.json({ error: "질문과 답변을 모두 입력해 주세요." }, { status: 400 });
  const store = getStore();
  const qa = await store.getQA();
  const added: QAItem = { id: `qa-${Date.now()}`, ...item, updatedAt: new Date().toISOString() };
  await store.saveQA([added, ...qa]);
  return Response.json({ item: added });
}

export async function PUT(req: Request) {
  if (!(await isAdmin())) return unauthorized();
  const body = (await req.json()) as QAItem;
  const item = clean(body);
  if (!item.question || !item.answer) return Response.json({ error: "질문과 답변을 모두 입력해 주세요." }, { status: 400 });
  const store = getStore();
  const qa = await store.getQA();
  const i = qa.findIndex((q) => q.id === body.id);
  if (i < 0) return Response.json({ error: "항목을 찾을 수 없습니다." }, { status: 404 });
  qa[i] = { ...qa[i], ...item, updatedAt: new Date().toISOString() };
  await store.saveQA(qa);
  return Response.json({ item: qa[i] });
}

export async function DELETE(req: Request) {
  if (!(await isAdmin())) return unauthorized();
  const id = new URL(req.url).searchParams.get("id");
  const store = getStore();
  await store.saveQA((await store.getQA()).filter((q) => q.id !== id));
  return Response.json({ ok: true });
}
