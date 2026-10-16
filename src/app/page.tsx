"use client";
// 사용자 페이지: 이름+이메일 입력 → 챗봇과 대화
import { useEffect, useRef, useState } from "react";
import { RichText } from "./RichText";

interface Msg {
  role: "user" | "assistant" | "notice";
  content: string;
}

const SUGGESTIONS = ["3살 아이에게 맞는 전집 추천해 주세요", "수학/과학 전집 뭐가 있어요?", "픽업은 어디서 할 수 있나요?", "Zelle 결제 할인이 있나요?"];

export default function Home() {
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [user, setUser] = useState<{ name: string; email: string } | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [blocked, setBlocked] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/session")
      .then((r) => r.json())
      .catch(() => ({}))
      .then((d) => {
        if (d.user) {
          setUser(d.user);
          setMessages(d.messages ?? []);
          setBlocked(d.blockMessage);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const logout = async () => {
    await fetch("/api/session", { method: "DELETE" });
    setUser(null);
    setMessages([]);
    setBlocked(null);
  };

  return (
    <>
      <nav className="top-nav">
        <span className="nav-link">{user ? `${user.name} 님` : "BOOK CONCIERGE"}</span>
        <a className="wordmark" href="https://dchoi09.com" target="_blank" rel="noreferrer">
          DCHOI09
        </a>
        {user ? (
          <button className="nav-link right" onClick={logout}>
            나가기
          </button>
        ) : (
          <a className="nav-link right" href="https://dchoi09.com/collections/series-books-all" target="_blank" rel="noreferrer">
            STORE
          </a>
        )}
      </nav>
      {loading ? null : user ? (
        <Chat initial={messages} blockedInitially={blocked} userName={user.name} />
      ) : (
        <Welcome name={name} setName={setName} />
      )}
    </>
  );
}

function Welcome({ name, setName }: { name: string; setName: (s: string) => void }) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) return setError(d.error ?? `서버 오류가 생겼어요 (${res.status}). 잠시 뒤 다시 시도해 주세요.`);
    } catch {
      return setError("인터넷 연결을 확인하고 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
    // 예전에 대화한 적이 있으면 기록을 불러오기 위해 새로고침
    window.location.reload();
  };

  return (
    <main className="hero">
      <p className="caption">DCHOI09 · SERIES BOOKS</p>
      <h1 className="display-xl">Book Concierge</h1>
      <p className="intro lead">
        우리 아이에게 꼭 맞는 전집을 찾아 드립니다. 연령, 구성, 가격, 픽업까지 무엇이든 물어보세요.
      </p>
      <form onSubmit={submit}>
        <label className="field">
          <span className="caption">이름</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="홍길동" autoComplete="name" required />
        </label>
        <label className="field">
          <span className="caption">이메일</span>
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" required />
        </label>
        <p className="muted small" style={{ margin: 0 }}>
          상담 품질 향상을 위해 이름, 이메일, 대화 내용이 저장됩니다.
        </p>
        {error && <p className="error">{error}</p>}
        <div className="actions">
          <button className="btn" disabled={busy}>
            {busy ? "잠시만요" : "상담 시작하기"}
          </button>
        </div>
      </form>
    </main>
  );
}

function Chat({ initial, blockedInitially, userName }: { initial: Msg[]; blockedInitially: string | null; userName: string }) {
  const [messages, setMessages] = useState<Msg[]>(
    initial.length
      ? initial
      : [{ role: "assistant", content: `안녕하세요, ${userName} 님! dchoi09 전집 컨시어지입니다. 아이 나이나 관심 분야를 알려주시면 딱 맞는 전집을 찾아드릴게요.` }],
  );
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState<string | null>(blockedInitially);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const updateLast = (fn: (m: Msg) => Msg) =>
    setMessages((ms) => {
      const copy = [...ms];
      copy[copy.length - 1] = fn(copy[copy.length - 1]);
      return copy;
    });

  const send = async (text: string) => {
    const message = text.trim();
    if (!message || busy || blocked) return;
    setInput("");
    setBusy(true);
    setMessages((ms) => [...ms, { role: "user", content: message }, { role: "assistant", content: "" }]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      if (!res.ok || !res.body) {
        const d = await res.json().catch(() => ({}));
        if (d.blocked) setBlocked(d.message);
        updateLast(() => ({ role: "notice", content: d.message ?? d.error ?? "문제가 생겼어요." }));
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const ev = JSON.parse(line);
          if (ev.type === "text") updateLast((m) => ({ ...m, content: m.content + ev.text }));
          else if (ev.type === "replace") updateLast((m) => ({ ...m, content: ev.text }));
          else if (ev.type === "blocked") {
            setBlocked(ev.text);
            updateLast(() => ({ role: "notice", content: ev.text }));
          } else if (ev.type === "error") updateLast(() => ({ role: "notice", content: ev.text }));
        }
      }
    } catch {
      updateLast(() => ({ role: "notice", content: "연결이 끊겼어요. 다시 시도해 주세요." }));
    } finally {
      setBusy(false);
    }
  };

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send(input);
    }
  };

  return (
    <main className="chat">
      <div className="chat-log" ref={logRef}>
        {messages.map((m, i) => {
          const streaming = busy && i === messages.length - 1 && m.role === "assistant";
          return (
            <div key={i} className={`msg ${m.role}`}>
              <div className="caption who">{m.role === "user" ? "YOU" : m.role === "notice" ? "NOTICE" : "CONCIERGE"}</div>
              <div className={`bubble ${streaming ? "typing" : ""}`}>
                <RichText text={m.content} />
              </div>
            </div>
          );
        })}
        {messages.length <= 1 && !blocked && (
          <div className="suggest">
            {SUGGESTIONS.map((s) => (
              <button key={s} className="btn btn-sm btn-ghost" onClick={() => send(s)}>
                {s}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="chat-input">
        <textarea
          className="textarea"
          rows={1}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKey}
          placeholder={blocked ? "상담이 제한되었습니다." : "궁금한 점을 입력하세요 (Enter 전송, Shift+Enter 줄바꿈)"}
          disabled={!!blocked}
          maxLength={2000}
        />
        <button className="btn" onClick={() => send(input)} disabled={busy || !!blocked || !input.trim()}>
          보내기
        </button>
      </div>
    </main>
  );
}
