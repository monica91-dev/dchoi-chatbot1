// Claude(Sonnet 5.5) 와 이야기하는 부분
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { buildKnowledge } from "./knowledge";
import type { ChatMessage, ChatUser, Mood, ModAction, Product, QAItem, Risk, Rules } from "./types";

export const MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-5-5";
const EFFORT = (process.env.CLAUDE_EFFORT || "low") as "low" | "medium" | "high";
// 안전 필터가 답변을 거절하면 서버에서 다른 모델로 자동 재시도 (Claude API 전용 기능)
const FALLBACK_BETA = "server-side-fallback-2026-07-01";
const HISTORY_LIMIT = 30; // 챗봇에게 보여줄 최근 대화 수

const client = new Anthropic(); // ANTHROPIC_API_KEY 환경변수를 자동으로 읽습니다

const toParams = (history: ChatMessage[]): Anthropic.Beta.BetaMessageParam[] =>
  history.slice(-HISTORY_LIMIT).map((m) => ({ role: m.role, content: m.content }));

// ─── 1단계: 기분 파악 + 이상 사용자 판별 ─────────────────────────────

const ModerationSchema = z.object({
  mood: z.enum(["긍정", "중립", "궁금", "불안", "불만", "화남"]),
  risk: z.enum(["정상", "의심", "이상"]),
  action: z.enum(["none", "warn", "block"]),
  reason: z.string(),
});

export interface Moderation {
  mood: Mood;
  risk: Risk;
  action: ModAction;
  reason: string;
}

export async function moderate(rules: Rules, user: ChatUser, history: ChatMessage[], message: string): Promise<Moderation> {
  const recent = history
    .slice(-6)
    .map((m) => `${m.role === "user" ? "사용자" : "챗봇"}: ${m.content.slice(0, 500)}`)
    .join("\n");
  try {
    const res = await client.beta.messages.parse({
      model: MODEL,
      max_tokens: 2000,
      betas: [FALLBACK_BETA],
      fallbacks: "default",
      output_config: { effort: "low", format: zodOutputFormat(ModerationSchema) },
      system: `당신은 쇼핑몰 상담 챗봇의 대화 검토 담당자입니다. 아래 규칙에 따라 사용자의 "새 메시지"를 판정하세요.
reason 에는 판단 이유를 한국어 한 문장으로 적으세요. 상품에 대한 평범한 질문은 risk "정상", action "none" 입니다.

<기분_파악_규칙>
${rules.mood}
</기분_파악_규칙>

<이상_사용자_판별_및_경고_규칙>
${rules.abuse}
</이상_사용자_판별_및_경고_규칙>

<차단_규칙>
${rules.block}
</차단_규칙>

이 사용자의 현재 경고 횟수: ${user.warnings}회 (자동 차단 기준: ${rules.warnLimit}회)`,
      messages: [
        {
          role: "user",
          content: `<최근_대화>\n${recent || "(없음)"}\n</최근_대화>\n\n<새_메시지>\n${message}\n</새_메시지>`,
        },
      ],
    });
    if (res.stop_reason === "refusal" || !res.parsed_output) {
      return { mood: "중립", risk: "의심", action: "none", reason: "자동 검토가 이 메시지를 판정하지 못했습니다." };
    }
    return res.parsed_output;
  } catch (e) {
    console.error("moderation failed", e);
    // 검토가 실패해도 상담은 계속되도록 기본값 사용
    return { mood: "중립", risk: "정상", action: "none", reason: "검토 실패 (기본값)" };
  }
}

// ─── 2단계: 실제 답변 (글자가 실시간으로 흘러나오도록 스트리밍) ─────────

export function streamReply(opts: {
  rules: Rules;
  products: Product[];
  qa: QAItem[];
  user: ChatUser;
  history: ChatMessage[];
  moderation: Moderation;
  warned: boolean;
}) {
  const { rules, products, qa, user, history, moderation, warned } = opts;

  // 자주 바뀌지 않는 부분(규칙+상품지식)은 캐시해서 비용과 속도를 아낍니다
  const stable = `<응대_규칙>\n${rules.response}\n</응대_규칙>\n\n<기분별_응대_방법>\n${rules.mood}\n</기분별_응대_방법>\n\n${buildKnowledge(products, qa)}`;

  const dynamic = [
    `지금 대화 중인 고객 이름: ${user.name}`,
    `검토 담당자가 판단한 고객의 현재 기분: ${moderation.mood} (${moderation.reason})`,
    warned
      ? `이 고객은 방금 이상 행동으로 경고를 받았습니다(누적 ${user.warnings}/${rules.warnLimit}회). 이유: ${moderation.reason}\n아래 경고 규칙에 맞게 정중하지만 분명하게 경고한 뒤, 정상적인 질문에는 계속 도와드리겠다고 말하세요.\n<경고_규칙>\n${rules.abuse}\n</경고_규칙>`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  return client.beta.messages.stream({
    model: MODEL,
    max_tokens: 8000,
    betas: [FALLBACK_BETA],
    fallbacks: "default",
    output_config: { effort: EFFORT },
    system: [
      { type: "text", text: stable, cache_control: { type: "ephemeral" } },
      { type: "text", text: dynamic },
    ],
    messages: toParams(history),
  });
}

export { Anthropic };
