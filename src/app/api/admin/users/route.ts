// 대화한 사용자 목록
import { isAdmin, unauthorized } from "@/lib/auth";
import { getStore } from "@/lib/store";

export async function GET() {
  if (!(await isAdmin())) return unauthorized();
  const users = await getStore().listUsers();
  users.sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt));
  return Response.json({ users });
}
