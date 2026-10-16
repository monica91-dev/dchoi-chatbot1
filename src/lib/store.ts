// 데이터 저장소
// - 버셀(인터넷)에서는 Upstash Redis 에 저장합니다. (환경변수 KV_REST_API_URL / KV_REST_API_TOKEN)
// - 내 컴퓨터에서 Redis 설정이 없으면 .data/db.json 파일에 저장합니다.
import fs from "node:fs";
import path from "node:path";
import { Redis } from "@upstash/redis";
import seedProducts from "../../data/products.json";
import seedQA from "../../data/qa.json";
import { DEFAULT_RULES } from "./defaults";
import type { ChatMessage, ChatUser, Product, QAItem, Rules } from "./types";

export interface Store {
  getUser(email: string): Promise<ChatUser | null>;
  saveUser(user: ChatUser): Promise<void>;
  listUsers(): Promise<ChatUser[]>;
  deleteUser(email: string): Promise<void>;
  getMessages(email: string): Promise<ChatMessage[]>;
  appendMessages(email: string, msgs: ChatMessage[]): Promise<void>;
  getQA(): Promise<QAItem[]>;
  saveQA(qa: QAItem[]): Promise<void>;
  getRules(): Promise<Rules>;
  saveRules(rules: Rules): Promise<void>;
  getProducts(): Promise<Product[]>;
  saveProducts(products: Product[]): Promise<void>;
  kind: "redis" | "file";
}

const K = {
  users: "dchoi:users",
  user: (e: string) => `dchoi:user:${e}`,
  msgs: (e: string) => `dchoi:msgs:${e}`,
  qa: "dchoi:qa",
  rules: "dchoi:rules",
  products: "dchoi:products",
};

function redisStore(redis: Redis): Store {
  return {
    kind: "redis",
    getUser: (e) => redis.get<ChatUser>(K.user(e)),
    async saveUser(u) {
      await Promise.all([redis.set(K.user(u.email), u), redis.sadd(K.users, u.email)]);
    },
    async listUsers() {
      const emails = await redis.smembers(K.users);
      if (!emails.length) return [];
      const users = await redis.mget<(ChatUser | null)[]>(...emails.map(K.user));
      return users.filter((u): u is ChatUser => !!u);
    },
    async deleteUser(e) {
      await Promise.all([redis.del(K.user(e), K.msgs(e)), redis.srem(K.users, e)]);
    },
    getMessages: (e) => redis.lrange<ChatMessage>(K.msgs(e), 0, -1),
    async appendMessages(e, msgs) {
      if (msgs.length) await redis.rpush(K.msgs(e), ...msgs);
    },
    async getQA() {
      return (await redis.get<QAItem[]>(K.qa)) ?? (seedQA as QAItem[]);
    },
    async saveQA(qa) {
      await redis.set(K.qa, qa);
    },
    async getRules() {
      return { ...DEFAULT_RULES, ...((await redis.get<Rules>(K.rules)) ?? {}) };
    },
    async saveRules(r) {
      await redis.set(K.rules, r);
    },
    async getProducts() {
      return (await redis.get<Product[]>(K.products)) ?? (seedProducts as Product[]);
    },
    async saveProducts(p) {
      await redis.set(K.products, p);
    },
  };
}

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
  const write = (db: FileDB) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(db, null, 2));
  };
  const update = async (fn: (db: FileDB) => void) => {
    const db = read();
    fn(db);
    write(db);
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
    appendMessages: (e, msgs) => update((db) => void (db.msgs[e] = [...(db.msgs[e] ?? []), ...msgs])),
    getQA: async () => read().qa ?? (seedQA as QAItem[]),
    saveQA: (qa) => update((db) => void (db.qa = qa)),
    getRules: async () => ({ ...DEFAULT_RULES, ...(read().rules ?? {}) }),
    saveRules: (r) => update((db) => void (db.rules = r)),
    getProducts: async () => read().products ?? (seedProducts as Product[]),
    saveProducts: (p) => update((db) => void (db.products = p)),
  };
}

let cached: Store | null = null;

export function getStore(): Store {
  if (cached) return cached;
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  cached = url && token ? redisStore(new Redis({ url, token })) : fileStore();
  return cached;
}
