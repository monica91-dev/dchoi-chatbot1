"use client";
// 운영자 페이지: 대화기록 / Q&A / 학습 상품 / 챗봇 규칙
import { useCallback, useEffect, useMemo, useState } from "react";
import { RichText } from "../RichText";
import type { ChatMessage, ChatUser, Product, QAItem, Rules } from "@/lib/types";

type Tab = "users" | "qa" | "products" | "rules";

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.error ?? `오류 ${res.status}`);
  return d as T;
}
const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
const fmt = (iso: string) => (iso ? new Date(iso).toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "short" }) : "-");
const STATUS_LABEL = { active: "정상", warned: "경고", blocked: "차단" } as const;

export default function AdminPage() {
  const [state, setState] = useState<{ admin: boolean; storageWarning: boolean } | null>(null);
  const [tab, setTab] = useState<Tab>("users");

  const refresh = useCallback(() => api<{ admin: boolean; storageWarning: boolean }>("/api/admin/login").then(setState), []);
  useEffect(() => {
    refresh();
  }, [refresh]);

  if (!state) return null;
  if (!state.admin) return <Login onDone={refresh} />;

  const logout = async () => {
    await fetch("/api/admin/login", { method: "DELETE" });
    refresh();
  };

  return (
    <>
      <nav className="top-nav">
        <span className="nav-link">ADMIN</span>
        <a className="wordmark" href="/">
          DCHOI09
        </a>
        <button className="nav-link right" onClick={logout}>
          로그아웃
        </button>
      </nav>
      <main className="admin">
        <p className="caption">OPERATIONS</p>
        <h1 className="display-md" style={{ marginTop: 8 }}>
          Concierge Console
        </h1>
        {state.storageWarning && (
          <div className="banner">
            ⚠ GitHub 저장 설정(GITHUB_TOKEN)이 없습니다. 지금은 대화기록·수정 내용이 저장되지 않아요. 안내서 6단계를 확인해 주세요.
          </div>
        )}
        <div className="tabs">
          {(
            [
              ["users", "대화기록"],
              ["qa", "Q&A 관리"],
              ["products", "학습 상품"],
              ["rules", "챗봇 규칙"],
            ] as [Tab, string][]
          ).map(([k, label]) => (
            <button key={k} className={`tab ${tab === k ? "on" : ""}`} onClick={() => setTab(k)}>
              {label}
            </button>
          ))}
        </div>
        {tab === "users" && <UsersTab />}
        {tab === "qa" && <QATab />}
        {tab === "products" && <ProductsTab />}
        {tab === "rules" && <RulesTab />}
      </main>
    </>
  );
}

function Login({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api("/api/admin/login", json("POST", { password }));
      onDone();
    } catch (err) {
      setError((err as Error).message);
    }
  };
  return (
    <main className="hero">
      <span className="wordmark">DCHOI09</span>
      <h1 className="display-md">Admin</h1>
      <form onSubmit={submit}>
        <label className="field">
          <span className="caption">관리자 비밀번호</span>
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
        </label>
        {error && <p className="error">{error}</p>}
        <div className="actions">
          <button className="btn">로그인</button>
        </div>
      </form>
    </main>
  );
}

// ─── 대화기록 ───────────────────────────────────────────

function UsersTab() {
  const [users, setUsers] = useState<ChatUser[]>([]);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ user: ChatUser; messages: ChatMessage[] } | null>(null);

  const load = useCallback(() => api<{ users: ChatUser[] }>("/api/admin/users").then((d) => setUsers(d.users)), []);
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    if (!selected) return setDetail(null);
    api<{ user: ChatUser; messages: ChatMessage[] }>(`/api/admin/users/detail?email=${encodeURIComponent(selected)}`).then(setDetail);
  }, [selected]);

  const filtered = users.filter((u) => `${u.name} ${u.email}`.toLowerCase().includes(q.toLowerCase()));
  const count = (s: ChatUser["status"]) => users.filter((u) => u.status === s).length;

  const setStatus = async (status: ChatUser["status"]) => {
    if (!detail) return;
    const { user } = await api<{ user: ChatUser }>(`/api/admin/users/detail?email=${encodeURIComponent(detail.user.email)}`, json("PATCH", { status }));
    setDetail({ ...detail, user });
    load();
  };
  const remove = async () => {
    if (!detail || !confirm(`${detail.user.email} 의 사용자 정보와 대화기록을 모두 지울까요? 되돌릴 수 없어요.`)) return;
    await api(`/api/admin/users/detail?email=${encodeURIComponent(detail.user.email)}`, { method: "DELETE" });
    setSelected(null);
    load();
  };

  return (
    <>
      <div className="stat-row" style={{ marginBottom: 40 }}>
        {[
          ["전체 사용자", users.length],
          ["정상", count("active")],
          ["경고", count("warned")],
          ["차단", count("blocked")],
        ].map(([label, n]) => (
          <div className="stat" key={label}>
            <div className="display-sm">{n}</div>
            <div className="caption">{label}</div>
          </div>
        ))}
      </div>
      <div className="split">
        <div>
          <div className="toolbar">
            <input className="input" placeholder="이름 또는 이메일 검색" value={q} onChange={(e) => setQ(e.target.value)} />
            <button className="btn btn-sm btn-ghost" onClick={load}>
              새로고침
            </button>
          </div>
          <div className="list">
            {filtered.map((u) => (
              <button key={u.email} className={`row ${selected === u.email ? "on" : ""}`} onClick={() => setSelected(u.email)}>
                <div className="top">
                  <span className="title-sm">{u.name}</span>
                  <span className={`tag ${u.status}`}>{STATUS_LABEL[u.status]}</span>
                </div>
                <span className="small muted">{u.email}</span>
                <span className="caption">
                  메시지 {u.messageCount} · 기분 {u.lastMood || "-"} · {fmt(u.lastSeenAt)}
                </span>
              </button>
            ))}
            {!filtered.length && <p className="muted small">아직 대화한 사용자가 없어요.</p>}
          </div>
        </div>
        <div>
          {!detail ? (
            <p className="muted">왼쪽에서 사용자를 선택하면 대화기록이 보여요.</p>
          ) : (
            <>
              <div className="toolbar" style={{ justifyContent: "space-between" }}>
                <div>
                  <h2 className="title-md">
                    {detail.user.name} <span className="muted small">{detail.user.email}</span>
                  </h2>
                  <div className="meta-line caption">
                    <span className={`tag ${detail.user.status}`}>{STATUS_LABEL[detail.user.status]}</span>
                    <span>경고 {detail.user.warnings}회</span>
                    <span>가입 {fmt(detail.user.createdAt)}</span>
                  </div>
                  {detail.user.blockedReason && <p className="small" style={{ color: "#e8a0a0" }}>차단 사유: {detail.user.blockedReason}</p>}
                </div>
                <div className="toolbar" style={{ margin: 0 }}>
                  {detail.user.status !== "active" && (
                    <button className="btn btn-sm" onClick={() => setStatus("active")}>
                      정상으로 (경고 초기화)
                    </button>
                  )}
                  {detail.user.status !== "blocked" && (
                    <button className="btn btn-sm btn-danger" onClick={() => setStatus("blocked")}>
                      차단
                    </button>
                  )}
                  <button className="btn btn-sm btn-ghost" onClick={remove}>
                    삭제
                  </button>
                </div>
              </div>
              <hr className="hairline" />
              <div className="chat-log" style={{ padding: "24px 0", maxHeight: "65vh" }}>
                {detail.messages.map((m, i) => (
                  <div key={i} className={`msg ${m.role}`}>
                    <div className="caption who">
                      {m.role === "user" ? "USER" : "BOT"} · {fmt(m.at)}
                    </div>
                    <div className="bubble">
                      <RichText text={m.content} />
                    </div>
                    {m.role === "user" && m.mood && (
                      <div className="caption" style={{ marginTop: 4, color: m.action === "none" ? undefined : "var(--warning)" }}>
                        기분 {m.mood} · 판별 {m.risk}
                        {m.action !== "none" ? ` · ${m.action === "warn" ? "경고" : "차단"}` : ""} — {m.reason}
                      </div>
                    )}
                  </div>
                ))}
                {!detail.messages.length && <p className="muted">대화 내용이 없어요.</p>}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

// ─── Q&A ──────────────────────────────────────────────

const EMPTY_QA: QAItem = { id: "", category: "", product: "", question: "", answer: "", updatedAt: "" };

function QATab() {
  const [qa, setQA] = useState<QAItem[]>([]);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [editing, setEditing] = useState<QAItem | null>(null);
  const [msg, setMsg] = useState("");

  const load = useCallback(() => api<{ qa: QAItem[] }>("/api/admin/qa").then((d) => setQA(d.qa)), []);
  useEffect(() => {
    load();
  }, [load]);

  const cats = useMemo(() => [...new Set(qa.map((x) => x.category).filter(Boolean))], [qa]);
  const filtered = qa.filter(
    (x) => (!cat || x.category === cat) && `${x.question} ${x.answer} ${x.product}`.toLowerCase().includes(q.toLowerCase()),
  );

  const save = async () => {
    if (!editing) return;
    try {
      await api("/api/admin/qa", json(editing.id ? "PUT" : "POST", editing));
      setEditing(null);
      setMsg("저장했어요. 다음 대화부터 챗봇에 반영돼요 (인터넷 버전은 최대 20초).");
      load();
    } catch (e) {
      alert((e as Error).message);
    }
  };
  const remove = async (item: QAItem) => {
    if (!confirm(`이 Q&A를 지울까요?\n\n${item.question}`)) return;
    await api(`/api/admin/qa?id=${encodeURIComponent(item.id)}`, { method: "DELETE" });
    load();
  };

  return (
    <>
      <ExcelBar onImported={load} />
      <div className="toolbar">
        <input className="input" placeholder="질문·답변 검색" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="select" style={{ maxWidth: 180 }} value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="">전체 분류</option>
          {cats.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <button className="btn btn-sm" onClick={() => setEditing({ ...EMPTY_QA })}>
          + 새 Q&A
        </button>
        <span className="caption">
          {filtered.length} / {qa.length}개
        </span>
      </div>
      {msg && <p className="small" style={{ color: "var(--success)" }}>{msg}</p>}
      <table className="table">
        <thead>
          <tr>
            <th style={{ width: 120 }}>분류</th>
            <th style={{ width: "30%" }}>질문</th>
            <th>답변</th>
            <th style={{ width: 150 }}></th>
          </tr>
        </thead>
        <tbody>
          {filtered.slice(0, 300).map((x) => (
            <tr key={x.id}>
              <td className="caption" style={{ whiteSpace: "nowrap" }}>{x.category}</td>
              <td>{x.question}</td>
              <td className="muted">{x.answer}</td>
              <td style={{ whiteSpace: "nowrap" }}>
                <button className="btn btn-sm btn-ghost" onClick={() => setEditing({ ...x })}>
                  수정
                </button>{" "}
                <button className="btn btn-sm btn-danger" onClick={() => remove(x)}>
                  삭제
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {filtered.length > 300 && <p className="caption">처음 300개만 보여요. 검색으로 좁혀 주세요.</p>}

      {editing && (
        <div className="modal-bg" onClick={() => setEditing(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="display-sm">{editing.id ? "Q&A 수정" : "새 Q&A"}</h2>
            {(
              [
                ["category", "분류 (예: 가격, 연령, 주문/결제)"],
                ["product", "관련 상품명 (없으면 비워두기)"],
              ] as const
            ).map(([k, label]) => (
              <label className="field" key={k}>
                <span className="caption">{label}</span>
                <input className="input" value={editing[k]} onChange={(e) => setEditing({ ...editing, [k]: e.target.value })} />
              </label>
            ))}
            <label className="field">
              <span className="caption">질문</span>
              <textarea className="textarea boxed" rows={2} value={editing.question} onChange={(e) => setEditing({ ...editing, question: e.target.value })} />
            </label>
            <label className="field">
              <span className="caption">답변</span>
              <textarea className="textarea boxed" rows={6} value={editing.answer} onChange={(e) => setEditing({ ...editing, answer: e.target.value })} />
            </label>
            <div className="toolbar" style={{ margin: 0, justifyContent: "flex-end" }}>
              <button className="btn btn-ghost" onClick={() => setEditing(null)}>
                취소
              </button>
              <button className="btn" onClick={save}>
                저장
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ExcelBar({ onImported }: { onImported: () => void }) {
  const [busy, setBusy] = useState(false);
  const upload = async (file: File | undefined) => {
    if (!file) return;
    if (!confirm("엑셀의 '상품목록'과 'Q&A' 시트로 지금 내용을 통째로 바꿀까요?")) return;
    setBusy(true);
    const fd = new FormData();
    fd.append("file", file);
    try {
      const d = await api<{ products: number; qa: number }>("/api/admin/excel", { method: "POST", body: fd });
      alert(`완료! 상품 ${d.products}개, Q&A ${d.qa}개를 불러왔어요.`);
      onImported();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="toolbar card">
      <span className="caption" style={{ marginRight: "auto" }}>
        학습 엑셀 파일
      </span>
      <a className="btn btn-sm btn-ghost" href="/api/admin/excel" style={{ textDecoration: "none" }}>
        엑셀 내려받기
      </a>
      <label className="btn btn-sm" style={{ opacity: busy ? 0.4 : 1 }}>
        {busy ? "올리는 중" : "엑셀 올리기"}
        <input type="file" accept=".xlsx" hidden disabled={busy} onChange={(e) => upload(e.target.files?.[0])} />
      </label>
    </div>
  );
}

// ─── 학습 상품 ──────────────────────────────────────────

function ProductsTab() {
  const [products, setProducts] = useState<Product[]>([]);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<Product | null>(null);
  const load = useCallback(() => api<{ products: Product[] }>("/api/admin/products").then((d) => setProducts(d.products)), []);
  useEffect(() => {
    load();
  }, [load]);
  const filtered = products.filter((p) => `${p.title} ${p.vendor} ${p.tags.join(" ")}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <>
      <ExcelBar onImported={load} />
      <div className="toolbar">
        <input className="input" placeholder="상품명·출판사·태그 검색" value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="caption">
          {filtered.length} / {products.length}개
        </span>
      </div>
      <table className="table">
        <thead>
          <tr>
            <th>상품명</th>
            <th>출판사</th>
            <th>연령</th>
            <th>가격</th>
            <th>상태</th>
            <th>상세 요약</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((p) => (
            <tr key={p.id} style={{ cursor: "pointer" }} onClick={() => setOpen(p)}>
              <td>{p.title}</td>
              <td className="muted">{p.vendor}</td>
              <td className="caption">{p.ageGroups.join(", ") || "-"}</td>
              <td className="small">{p.variants.map((v) => `$${v.price}`).join(" / ")}</td>
              <td className={`tag ${p.available ? "active" : "blocked"}`}>{p.available ? "판매중" : "품절"}</td>
              <td className="caption">{p.detailSummary ? "있음" : "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {open && (
        <div className="modal-bg" onClick={() => setOpen(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="display-sm">{open.title}</h2>
            <p className="caption">
              {open.vendor} · {open.ageGroups.join(", ")} · {open.tags.join(", ")}
            </p>
            <p className="small">
              {open.variants.map((v) => `${v.name}: $${v.price}${v.available ? "" : " (품절)"}`).join("\n")}
            </p>
            <a href={open.url} target="_blank" rel="noreferrer">
              상품 페이지 열기
            </a>
            {open.detailSummary && (
              <>
                <span className="caption">상세 이미지 요약</span>
                <p className="small" style={{ whiteSpace: "pre-wrap", margin: 0 }}>
                  {open.detailSummary}
                </p>
              </>
            )}
            <span className="caption">상세페이지 텍스트</span>
            <p className="small muted" style={{ whiteSpace: "pre-wrap", margin: 0 }}>
              {open.description || "(상세페이지가 이미지로만 되어 있어요)"}
            </p>
            <button className="btn" onClick={() => setOpen(null)}>
              닫기
            </button>
          </div>
        </div>
      )}
    </>
  );
}

// ─── 챗봇 규칙 ──────────────────────────────────────────

const RULE_FIELDS: { key: "response" | "mood" | "abuse" | "block"; title: string; help: string }[] = [
  { key: "response", title: "응대 규칙", help: "챗봇의 말투, 답변 방식, 지켜야 할 원칙" },
  { key: "mood", title: "사용자 기분 파악 규칙", help: "기분을 어떻게 판단하고, 기분별로 어떻게 응대할지" },
  { key: "abuse", title: "이상 사용자 판별 및 경고 규칙", help: "어떤 행동을 이상하다고 보고 경고할지" },
  { key: "block", title: "차단 규칙", help: "어떤 경우 바로 차단할지" },
];

function RulesTab() {
  const [rules, setRules] = useState<Rules | null>(null);
  const [defaults, setDefaults] = useState<Rules | null>(null);
  const [saved, setSaved] = useState("");

  useEffect(() => {
    api<{ rules: Rules; defaults: Rules }>("/api/admin/rules").then((d) => {
      setRules(d.rules);
      setDefaults(d.defaults);
    });
  }, []);
  if (!rules || !defaults) return null;

  const save = async () => {
    const d = await api<{ rules: Rules }>("/api/admin/rules", json("PUT", rules));
    setRules(d.rules);
    setSaved(`저장했어요 (${new Date().toLocaleTimeString("ko-KR")}). 다음 메시지부터 적용돼요.`);
  };

  return (
    <div className="rules">
      {RULE_FIELDS.map((f) => (
        <label className="field" key={f.key}>
          <div className="toolbar" style={{ margin: 0, justifyContent: "space-between" }}>
            <div>
              <h3 className="title-md">{f.title}</h3>
              <span className="muted small">{f.help}</span>
            </div>
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={() => confirm("처음 값으로 되돌릴까요? (저장을 눌러야 적용돼요)") && setRules({ ...rules, [f.key]: defaults[f.key] })}
            >
              처음 값으로
            </button>
          </div>
          <textarea className="textarea boxed" rows={10} value={rules[f.key]} onChange={(e) => setRules({ ...rules, [f.key]: e.target.value })} />
        </label>
      ))}
      <div className="split" style={{ gridTemplateColumns: "240px 1fr" }}>
        <label className="field">
          <span className="caption">자동 차단 경고 횟수</span>
          <input className="input" type="number" min={1} max={20} value={rules.warnLimit} onChange={(e) => setRules({ ...rules, warnLimit: Number(e.target.value) })} />
        </label>
        <label className="field">
          <span className="caption">차단된 사용자에게 보여줄 문구</span>
          <input className="input" value={rules.blockMessage} onChange={(e) => setRules({ ...rules, blockMessage: e.target.value })} />
        </label>
      </div>
      <div className="toolbar">
        <button className="btn" onClick={save}>
          규칙 저장
        </button>
        {saved && <span className="small" style={{ color: "var(--success)" }}>{saved}</span>}
      </div>
    </div>
  );
}
