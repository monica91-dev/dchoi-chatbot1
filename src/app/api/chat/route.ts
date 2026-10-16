// 챗봇 대화: 1) 기분·이상행동 검토 → 2) 경고/차단 처리 → 3) 답변을 실시간으로 보내기
// 브라우저로는 한 줄에 하나씩 JSON 을 보냅니다: {"type":"text","text":"..."} / {"type":"done"} / {"type":"blocked"} ...
import { getUserEmail } from "@/lib/auth";
import { Anthropic, moderate, streamReply } from "@/lib/claude";
import { ConfigError, errorResponse } from "@/lib/errors";
import { getStore } from "@/lib/store";
import type { ChatMessage } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60; // 버셀에서 최대 60초까지 답변 허용

const MAX_LEN = 2000;

export async function POST(req: Request) {
  try {
    return await chat(req);
  } catch (e) {
    return errorResponse(e);
  }
}

async function chat(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: "챗봇 API 키(ANTHROPIC_API_KEY)가 아직 설정되지 않았어요." }, { status: 500 });
  }
  const email = await getUserEmail();
  if (!email) return Response.json({ error: "먼저 이름과 이메일을 입력해 주세요." }, { status: 401 });

  const { message: raw } = (await req.json().catch(() => ({}))) as { message?: string };
  const message = (raw ?? "").trim().slice(0, MAX_LEN);
  if (!message) return Response.json({ error: "메시지를 입력해 주세요." }, { status: 400 });

  const store = getStore();
  const [user, rules, history] = await Promise.all([store.getUser(email), store.getRules(), store.getMessages(email)]);
  if (!user) return Response.json({ error: "사용자 정보를 찾을 수 없습니다." }, { status: 401 });
  if (user.status === "blocked") return Response.json({ blocked: true, message: rules.blockMessage }, { status: 403 });

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: object) => controller.enqueue(enc.encode(JSON.stringify(obj) + "\n"));
      const now = () => new Date().toISOString();

      try {
        // 1) 검토
        const mod = await moderate(rules, user, history, message);
        const userMsg: ChatMessage = { role: "user", content: message, at: now(), ...mod };

        // 2) 경고 / 차단
        let warned = false;
        if (mod.action === "warn") {
          user.warnings += 1;
          warned = true;
        }
        const autoBlock = user.warnings >= rules.warnLimit;
        if (mod.action === "block" || autoBlock) {
          user.status = "blocked";
          user.blockedReason = mod.action === "block" ? mod.reason : `경고 ${user.warnings}회 누적: ${mod.reason}`;
          user.lastMood = mod.mood;
          user.messageCount += 1;
          user.lastSeenAt = now();
          const botMsg: ChatMessage = { role: "assistant", content: rules.blockMessage, at: now() };
          await Promise.all([store.saveUser(user), store.appendMessages(email, [userMsg, botMsg])]);
          send({ type: "blocked", text: rules.blockMessage });
          controller.close();
          return;
        }
        if (warned) user.status = "warned";

        // 3) 답변
        const [products, qa] = await Promise.all([store.getProducts(), store.getQA()]);
        const replyStream = streamReply({
          rules,
          products,
          qa,
          user,
          history: [...history, userMsg],
          moderation: mod,
          warned,
        });
        if (warned) send({ type: "warning", count: user.warnings, limit: rules.warnLimit });

        let text = "";
        for await (const event of replyStream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            text += event.delta.text;
            send({ type: "text", text: event.delta.text });
          }
        }
        const final = await replyStream.finalMessage();
        if (final.stop_reason === "refusal") {
          // 안전 필터가 답변을 멈춘 경우: 중간까지 나온 글은 버리고 안내문으로 바꿈
          text = "죄송해요, 이 질문에는 답변을 드리기 어려워요. 전집 관련해서 궁금한 점을 다시 물어봐 주세요.";
          send({ type: "replace", text });
        } else if (final.stop_reason === "max_tokens") {
          text += "\n\n(답변이 길어 여기까지만 보여드려요. 이어서 궁금한 점을 물어봐 주세요.)";
        }

        user.lastMood = mod.mood;
        user.messageCount += 1;
        user.lastSeenAt = now();
        await Promise.all([
          store.saveUser(user),
          store.appendMessages(email, [userMsg, { role: "assistant", content: text, at: now() }]),
        ]);
        send({ type: "done" });
      } catch (e) {
        console.error("chat failed", e);
        let msg = "잠시 문제가 생겼어요. 조금 뒤에 다시 시도해 주세요.";
        if (e instanceof ConfigError) msg = e.message;
        else if (e instanceof Anthropic.AuthenticationError) msg = "챗봇 API 키 설정에 문제가 있어요. 관리자에게 알려 주세요.";
        else if (e instanceof Anthropic.RateLimitError) msg = "지금 문의가 많아요. 잠시 뒤에 다시 시도해 주세요.";
        send({ type: "error", text: msg });
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}
