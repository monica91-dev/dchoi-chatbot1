// 챗봇 답변의 **강조**, [글자](링크), 맨 주소를 보기 좋게 바꿔 줍니다. (HTML 은 쓰지 않아 안전)
import { Fragment } from "react";

const TOKEN = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|\*\*([^*]+)\*\*|(https?:\/\/[^\s)]+)/g;

export function RichText({ text }: { text: string }) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(TOKEN)) {
    if (m.index! > last) parts.push(<Fragment key={i++}>{text.slice(last, m.index)}</Fragment>);
    if (m[1]) {
      parts.push(
        <a key={i++} href={m[2]} target="_blank" rel="noreferrer">
          {m[1]}
        </a>,
      );
    } else if (m[3]) {
      parts.push(
        <span key={i++} className="em">
          {m[3]}
        </span>,
      );
    } else if (m[4]) {
      parts.push(
        <a key={i++} href={m[4]} target="_blank" rel="noreferrer">
          {shortUrl(m[4])}
        </a>,
      );
    }
    last = m.index! + m[0].length;
  }
  if (last < text.length) parts.push(<Fragment key={i++}>{text.slice(last)}</Fragment>);
  return <>{parts}</>;
}

// 한글이 %EB%82... 로 길게 바뀐 주소를 사람이 읽을 수 있게 줄이기
function shortUrl(url: string): string {
  try {
    const u = new URL(url);
    const path = decodeURIComponent(u.pathname);
    const s = `${u.hostname.replace(/^www\./, "")}${path}`;
    return s.length > 48 ? `${s.slice(0, 46)}…` : s;
  } catch {
    return url;
  }
}
