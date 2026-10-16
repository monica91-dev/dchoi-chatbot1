// 앱 전체에서 함께 쓰는 데이터 모양(타입) 정의

export interface Product {
  id: string;
  handle: string;
  title: string;
  vendor: string; // 출판사/브랜드
  productType: string;
  tags: string[];
  ageGroups: string[]; // 예: "0-1세", "3-4세"
  variants: { name: string; price: number; compareAt: number | null; available: boolean }[]; // 수령방법/옵션별 가격 (USD)
  available: boolean;
  url: string;
  image: string | null;
  description: string; // 상세페이지의 텍스트
  detailImages: string[]; // 상세페이지 이미지 주소
  externalLinks: string[]; // 상세페이지 안의 외부 소개 링크
  detailSummary: string; // 상세 이미지를 AI가 읽고 정리한 요약 (npm run enrich, 긴 이미지는 잘라서 읽음)
  updatedAt: string;
}

export interface QAItem {
  id: string;
  category: string;
  product: string; // 관련 상품명 (없으면 빈칸)
  question: string;
  answer: string;
  updatedAt: string;
}

export interface Rules {
  response: string; // 응대 규칙
  mood: string; // 사용자 기분 파악 규칙
  abuse: string; // 이상 사용자 판별 및 경고 규칙
  block: string; // 차단 규칙
  warnLimit: number; // 경고 몇 번이면 자동 차단할지
  blockMessage: string; // 차단된 사용자에게 보여줄 문구
}

export type UserStatus = "active" | "warned" | "blocked";

export interface ChatUser {
  email: string;
  name: string;
  createdAt: string;
  lastSeenAt: string;
  status: UserStatus;
  warnings: number;
  lastMood: string;
  messageCount: number;
  blockedReason: string;
}

export type Mood = "긍정" | "중립" | "궁금" | "불안" | "불만" | "화남";
export type Risk = "정상" | "의심" | "이상";
export type ModAction = "none" | "warn" | "block";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  at: string;
  mood?: Mood;
  risk?: Risk;
  action?: ModAction;
  reason?: string;
}
