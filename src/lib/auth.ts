// 로그인 정보를 쿠키에 안전하게(서명해서) 저장하는 도구
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { ConfigError } from "./errors";

const USER_COOKIE = "dchoi_user";
const ADMIN_COOKIE = "dchoi_admin";

function secret(): string {
  const s = process.env.SESSION_SECRET || process.env.ADMIN_PASSWORD;
  if (!s) throw new ConfigError("SESSION_SECRET 환경변수가 없어요. Vercel → Settings → Environment Variables 에 넣고 Redeploy 해 주세요.");
  return s;
}

function sign(payload: object): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

function verify<T>(token: string | undefined): T | null {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = crypto.createHmac("sha256", secret()).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    return JSON.parse(Buffer.from(body, "base64url").toString()) as T;
  } catch {
    return null;
  }
}

const cookieOptions = (maxAgeDays: number) => ({
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: maxAgeDays * 24 * 60 * 60,
});

export async function setUserSession(email: string) {
  (await cookies()).set(USER_COOKIE, sign({ email }), cookieOptions(30));
}

export async function getUserEmail(): Promise<string | null> {
  return verify<{ email: string }>((await cookies()).get(USER_COOKIE)?.value)?.email ?? null;
}

export async function clearUserSession() {
  (await cookies()).delete(USER_COOKIE);
}

export function checkAdminPassword(password: string): boolean {
  const real = process.env.ADMIN_PASSWORD;
  if (!real) return false;
  const a = crypto.createHash("sha256").update(password).digest();
  const b = crypto.createHash("sha256").update(real).digest();
  return crypto.timingSafeEqual(a, b);
}

export async function setAdminSession() {
  (await cookies()).set(ADMIN_COOKIE, sign({ admin: true, at: Date.now() }), cookieOptions(7));
}

export async function clearAdminSession() {
  (await cookies()).delete(ADMIN_COOKIE);
}

export async function isAdmin(): Promise<boolean> {
  return !!verify<{ admin: boolean }>((await cookies()).get(ADMIN_COOKIE)?.value)?.admin;
}

export const unauthorized = () => Response.json({ error: "관리자 로그인이 필요합니다." }, { status: 401 });
