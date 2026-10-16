// 사용자가 이름+이메일을 남기고 상담을 시작하는 곳
import { clearUserSession, getUserEmail, setUserSession } from "@/lib/auth";
import { errorResponse } from "@/lib/errors";
import { getStore } from "@/lib/store";
import type { ChatUser } from "@/lib/types";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function GET() {
  try {
    return await currentSession();
  } catch (e) {
    return errorResponse(e);
  }
}

async function currentSession() {
  const email = await getUserEmail();
  if (!email) return Response.json({ user: null });
  const store = getStore();
  const user = await store.getUser(email);
  if (!user) return Response.json({ user: null });
  const [messages, rules] = await Promise.all([store.getMessages(email), store.getRules()]);
  return Response.json({
    user: { name: user.name, email: user.email, status: user.status },
    messages: messages.map(({ role, content, at }) => ({ role, content, at })),
    blockMessage: user.status === "blocked" ? rules.blockMessage : null,
  });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { name?: string; email?: string };
  const name = (body.name ?? "").trim().slice(0, 40);
  const email = (body.email ?? "").trim().toLowerCase().slice(0, 120);
  if (!name) return Response.json({ error: "이름을 입력해 주세요." }, { status: 400 });
  if (!EMAIL_RE.test(email)) return Response.json({ error: "이메일 주소를 확인해 주세요." }, { status: 400 });

  try {
    return await startSession(name, email);
  } catch (e) {
    return errorResponse(e);
  }
}

async function startSession(name: string, email: string) {
  const store = getStore();
  const now = new Date().toISOString();
  const existing = await store.getUser(email);
  const user: ChatUser = existing
    ? { ...existing, name, lastSeenAt: now }
    : {
        email,
        name,
        createdAt: now,
        lastSeenAt: now,
        status: "active",
        warnings: 0,
        lastMood: "",
        messageCount: 0,
        blockedReason: "",
      };
  await store.saveUser(user);
  await setUserSession(email);
  return Response.json({ ok: true });
}

export async function DELETE() {
  await clearUserSession();
  return Response.json({ ok: true });
}
