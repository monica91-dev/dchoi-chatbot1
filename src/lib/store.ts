// 데이터 저장소 (따로 데이터베이스를 쓰지 않습니다)
// - 상품·기본 Q&A·기본 규칙: GitHub 에 올린 코드 안의 data/ 파일과 defaults.ts 에서 바로 읽습니다.
// - 대화기록·사용자·관리자가 고친 Q&A/규칙:
//     · 버셀(인터넷): GitHub 저장소의 데이터 전용 브랜치에 저장 (환경변수 GITHUB_TOKEN 필요)
//     · 내 컴퓨터: GITHUB_TOKEN 이 없으면 .data/db.json 파일에 저장
import fs from "node:fs";
import path from "node:path";
import seedProducts from "../../data/products.json";
import seedQA from "../../data/qa.json";
import { DEFAULT_RULES } from "./defaults";
import { ConfigError, STORAGE_MISSING } from "./errors";
import { emailKey, GitHubFiles } from "./github-store";
import type { ChatMessage, ChatUser, Product, QAItem, Rules } from "./types";

export interface Store {
  getUser(email: string): Promise<ChatUser | null>;
  saveUser(user: ChatUser): Promise<void>;
  listUsers(): Promise<ChatUser[]>;
  deleteUser(email: string): Promise<void>;
  getMessages(email: string): Promise<ChatMessage[]>;
  /** 대화 한 번(사용자 정보 + 새 메시지들)을 한꺼번에 저장 */
  saveTurn(user: ChatUser, msgs: ChatMessage[]): Promise<void>;
  getQA(): Promise<QAItem[]>;
  saveQA(qa: QAItem[]): Promise<void>;
  getRules(): Promise<Rules>;
  saveRules(rules: Rules): Promise<void>;
  getProducts(): Promise<Product[]>;
  saveProducts(products: Product[]): Promise<void>;
  kind: "github" | "file";
}

const withDefaults = (r: Rules | null): Rules => ({ ...DEFAULT_RULES, ...(r ?? {}) });

// ─── GitHub 저장소 ───────────────────────────────────────

const F = {
  users: "data/users.json",
  chat: (email: string) => `data/chats/${emailKey(email)}.json`,
  qa: "data/qa.json",
  rules: "data/rules.json",
  products: "data/products.json",
};

type Users = Record<string, ChatUser>;

function githubStore(gh: GitHubFiles): Store {
  // Q&A·규칙·상품은 대화마다 읽으므로 잠깐(20초) 기억해서 GitHub 호출을 줄입니다
  const memo = new Map<string, { at: number; value: unknown }>();
  const cachedRead = async <T>(file: string): Promise<T | null> => {
    const hit = memo.get(file);
    if (hit && Date.now() - hit.at < 20_000) return hit.value as T | null;
    const value = await gh.read<T>(file);
    memo.set(file, { at: Date.now(), value });
    return value;
  };
  const saveShared = async (file: string, value: unknown, message: string) => {
    await gh.commit(message, async () => ({ [file]: value }));
    memo.set(file, { at: Date.now(), value });
  };

  return {
    kind: "github",
    async getUser(e) {
      return (await gh.read<Users>(F.users))?.[e] ?? null;
    },
    saveUser: (u) =>
      gh.commit(`사용자 저장: ${u.name}`, async (read) => ({ [F.users]: { ...((await read<Users>(F.users)) ?? {}), [u.email]: u } })),
    async listUsers() {
      return Object.values((await gh.read<Users>(F.users)) ?? {});
    },
    deleteUser: (e) =>
      gh.commit("사용자 삭제", async (read) => {
        const users = (await read<Users>(F.users)) ?? {};
        delete users[e];
        return { [F.users]: users, [F.chat(e)]: null };
      }),
    async getMessages(e) {
      return (await gh.read<ChatMessage[]>(F.chat(e))) ?? [];
    },
    saveTurn: (u, msgs) =>
      gh.commit(`대화 저장: ${u.name}`, async (read) => ({
        [F.users]: { ...((await read<Users>(F.users)) ?? {}), [u.email]: u },
        [F.chat(u.email)]: [...((await read<ChatMessage[]>(F.chat(u.email))) ?? []), ...msgs],
      })),
    getQA: async () => (await cachedRead<QAItem[]>(F.qa)) ?? (seedQA as QAItem[]),
    saveQA: (qa) => saveShared(F.qa, qa, `Q&A 수정 (${qa.length}개)`),
    getRules: async () => withDefaults(await cachedRead<Rules>(F.rules)),
    saveRules: (r) => saveShared(F.rules, r, "챗봇 규칙 수정"),
    getProducts: async () => (await cachedRead<Product[]>(F.products)) ?? (seedProducts as Product[]),
    saveProducts: (p) => saveShared(F.products, p, `상품목록 엑셀 올리기 (${p.length}개)`),
  };
}

// ─── 내 컴퓨터용 파일 저장소 ─────────────────────────────

interface FileDB {
  users: Record<string, ChatUser>;
  msgs: Record<string, ChatMessage[]>;
  qa?: QAItem[];
  rules?: Rules;
  products?: Product[];
}

function fileStore(): Store {
  const file = path.join(process.cwd(), ".data", "db.json");
  const read = (): FileDB =>
    fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : { users: {}, msgs: {} };
  const update = async (fn: (db: FileDB) => void) => {
    // 버셀은 파일 저장이 막혀 있어서 GITHUB_TOKEN 이 꼭 필요합니다
    if (process.env.VERCEL) throw new ConfigError(STORAGE_MISSING);
    const db = read();
    fn(db);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(db, null, 2));
  };
  return {
    kind: "file",
    getUser: async (e) => read().users[e] ?? null,
    saveUser: (u) => update((db) => void (db.users[u.email] = u)),
    listUsers: async () => Object.values(read().users),
    deleteUser: (e) =>
      update((db) => {
        delete db.users[e];
        delete db.msgs[e];
      }),
    getMessages: async (e) => read().msgs[e] ?? [],
    saveTurn: (u, msgs) =>
      update((db) => {
        db.users[u.email] = u;
        db.msgs[u.email] = [...(db.msgs[u.email] ?? []), ...msgs];
      }),
    getQA: async () => read().qa ?? (seedQA as QAItem[]),
    saveQA: (qa) => update((db) => void (db.qa = qa)),
    getRules: async () => withDefaults(read().rules ?? null),
    saveRules: (r) => update((db) => void (db.rules = r)),
    getProducts: async () => read().products ?? (seedProducts as Product[]),
    saveProducts: (p) => update((db) => void (db.products = p)),
  };
}

let cached: Store | null = null;

export function getStore(): Store {
  if (cached) return cached;
  const token = process.env.GITHUB_TOKEN;
  cached = token
    ? githubStore(
        new GitHubFiles({
          token,
          repo: process.env.GITHUB_DATA_REPO || "monica91-dev/dchoi-chatbot1",
          branch: process.env.GITHUB_DATA_BRANCH || "chatbot-data",
        }),
      )
    : fileStore();
  return cached;
}
