// 챗봇 규칙 보기 / 저장 / 처음 값으로 되돌리기
import { isAdmin, unauthorized } from "@/lib/auth";
import { DEFAULT_RULES } from "@/lib/defaults";
import { getStore } from "@/lib/store";
import type { Rules } from "@/lib/types";

export async function GET() {
  if (!(await isAdmin())) return unauthorized();
  return Response.json({ rules: await getStore().getRules(), defaults: DEFAULT_RULES });
}

export async function PUT(req: Request) {
  if (!(await isAdmin())) return unauthorized();
  const b = (await req.json()) as Partial<Rules>;
  const rules: Rules = {
    response: String(b.response ?? DEFAULT_RULES.response),
    mood: String(b.mood ?? DEFAULT_RULES.mood),
    abuse: String(b.abuse ?? DEFAULT_RULES.abuse),
    block: String(b.block ?? DEFAULT_RULES.block),
    warnLimit: Math.max(1, Math.min(20, Number(b.warnLimit) || DEFAULT_RULES.warnLimit)),
    blockMessage: String(b.blockMessage ?? DEFAULT_RULES.blockMessage),
  };
  await getStore().saveRules(rules);
  return Response.json({ rules });
}
