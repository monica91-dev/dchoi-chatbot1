// 관리자 로그인 / 로그아웃 / 로그인 상태 확인
import { checkAdminPassword, clearAdminSession, isAdmin, setAdminSession } from "@/lib/auth";
import { getStore } from "@/lib/store";

export async function GET() {
  return Response.json({
    admin: await isAdmin(),
    storage: getStore().kind,
    // 버셀에서 GITHUB_TOKEN 을 넣지 않으면 대화기록이 저장되지 않으므로 경고를 띄웁니다
    storageWarning: !!process.env.VERCEL && getStore().kind === "file",
  });
}

export async function POST(req: Request) {
  const { password } = (await req.json().catch(() => ({}))) as { password?: string };
  if (!process.env.ADMIN_PASSWORD) {
    return Response.json({ error: "ADMIN_PASSWORD 환경변수가 설정되지 않았습니다." }, { status: 500 });
  }
  if (!password || !checkAdminPassword(password)) {
    await new Promise((r) => setTimeout(r, 800)); // 비밀번호 마구 넣어보기 방지
    return Response.json({ error: "비밀번호가 맞지 않습니다." }, { status: 401 });
  }
  await setAdminSession();
  return Response.json({ ok: true });
}

export async function DELETE() {
  await clearAdminSession();
  return Response.json({ ok: true });
}
