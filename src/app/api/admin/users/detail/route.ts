// 사용자 한 명의 대화기록 보기 / 상태 바꾸기(차단·해제) / 삭제
import { isAdmin, unauthorized } from "@/lib/auth";
import { getStore } from "@/lib/store";
import type { UserStatus } from "@/lib/types";

const emailOf = (req: Request) => (new URL(req.url).searchParams.get("email") ?? "").toLowerCase();

export async function GET(req: Request) {
  if (!(await isAdmin())) return unauthorized();
  const store = getStore();
  const email = emailOf(req);
  const [user, messages] = await Promise.all([store.getUser(email), store.getMessages(email)]);
  if (!user) return Response.json({ error: "사용자를 찾을 수 없습니다." }, { status: 404 });
  return Response.json({ user, messages });
}

export async function PATCH(req: Request) {
  if (!(await isAdmin())) return unauthorized();
  const store = getStore();
  const user = await store.getUser(emailOf(req));
  if (!user) return Response.json({ error: "사용자를 찾을 수 없습니다." }, { status: 404 });
  const { status } = (await req.json()) as { status: UserStatus };
  if (!["active", "warned", "blocked"].includes(status)) return Response.json({ error: "잘못된 상태" }, { status: 400 });
  user.status = status;
  if (status === "active") {
    user.warnings = 0;
    user.blockedReason = "";
  }
  if (status === "blocked" && !user.blockedReason) user.blockedReason = "관리자가 직접 차단";
  await store.saveUser(user);
  return Response.json({ user });
}

export async function DELETE(req: Request) {
  if (!(await isAdmin())) return unauthorized();
  await getStore().deleteUser(emailOf(req));
  return Response.json({ ok: true });
}
