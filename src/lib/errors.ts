// 설정이 빠져서 생기는 오류: 사용자에게 무엇을 해야 하는지 그대로 보여줍니다
export class ConfigError extends Error {}

export const STORAGE_MISSING =
  "저장소가 아직 연결되지 않았어요. 관리자는 Vercel → Storage 에서 Upstash Redis 를 연결한 뒤 Redeploy 해 주세요. (안내서 6단계)";

export function errorResponse(e: unknown) {
  console.error(e);
  const message = e instanceof ConfigError ? e.message : "잠시 문제가 생겼어요. 조금 뒤에 다시 시도해 주세요.";
  return Response.json({ error: message }, { status: 500 });
}
