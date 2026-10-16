// GitHub 저장소를 데이터베이스처럼 쓰는 저장소
// - 대화기록·사용자·수정한 Q&A·규칙을 GitHub 저장소의 "데이터 전용 브랜치"에 JSON 파일로 저장합니다.
// - 코드가 있는 main 브랜치와 따로 두어서, 저장할 때마다 버셀이 다시 배포되지 않습니다 (vercel.json 참고).
// - 저장할 때마다 GitHub 에 커밋이 하나씩 생깁니다. 그래서 내역이 모두 남고 되돌릴 수도 있어요.
import crypto from "node:crypto";
import { ConfigError } from "./errors";

const API = "https://api.github.com";

export interface GitHubConfig {
  token: string;
  repo: string; // "owner/name"
  branch: string;
}

export class GitHubFiles {
  constructor(private cfg: GitHubConfig) {}

  private async call<T>(path: string, init: RequestInit = {}): Promise<{ status: number; body: T }> {
    const res = await fetch(`${API}/repos/${this.cfg.repo}${path}`, {
      ...init,
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${this.cfg.token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
      },
    });
    const body = res.status === 204 ? null : await res.json().catch(() => null);
    if (res.status === 401 || res.status === 403) {
      throw new ConfigError(`GitHub 접근이 거절됐어요 (${res.status}). GITHUB_TOKEN 의 권한(Contents: Read and write)을 확인해 주세요.`);
    }
    return { status: res.status, body: body as T };
  }

  /** 데이터 브랜치의 최신 커밋 주소. 브랜치가 없으면 새로 만듭니다. */
  private async head(): Promise<string> {
    const r = await this.call<{ object: { sha: string } }>(`/git/ref/heads/${this.cfg.branch}`);
    if (r.status === 200) return r.body.object.sha;
    if (r.status !== 404) throw new ConfigError(`GitHub 저장소(${this.cfg.repo})를 찾을 수 없거나 접근할 수 없어요 (${r.status}).`);
    // 처음 한 번: 코드와 섞이지 않는 빈 데이터 브랜치 만들기
    const tree = await this.call<{ sha: string }>(`/git/trees`, {
      method: "POST",
      body: JSON.stringify({
        tree: [{ path: "README.md", mode: "100644", type: "blob", content: "# 챗봇 데이터\n\n이 브랜치는 챗봇이 자동으로 저장하는 곳입니다. 직접 고치지 마세요.\n" }],
      }),
    });
    const commit = await this.call<{ sha: string }>(`/git/commits`, {
      method: "POST",
      body: JSON.stringify({ message: "챗봇 데이터 브랜치 만들기", tree: tree.body.sha, parents: [] }),
    });
    const created = await this.call(`/git/refs`, {
      method: "POST",
      body: JSON.stringify({ ref: `refs/heads/${this.cfg.branch}`, sha: commit.body.sha }),
    });
    if (created.status !== 201 && created.status !== 422) throw new Error(`데이터 브랜치를 만들지 못했어요 (${created.status})`);
    return created.status === 201 ? commit.body.sha : this.head();
  }

  /** 파일 하나 읽기 (없으면 null). ref 를 주면 그 시점의 내용을 읽습니다. */
  async read<T>(path: string, ref?: string): Promise<T | null> {
    // 브랜치 이름으로 읽으면 GitHub 가 잠깐 옛날 내용을 줄 때가 있어서, 최신 커밋 주소로 읽습니다
    const at = ref ?? (await this.head());
    const r = await this.call<{ content?: string; encoding?: string; sha: string; size: number }>(
      `/contents/${encodePath(path)}?ref=${encodeURIComponent(at)}`,
    );
    if (r.status === 404) return null;
    if (r.status !== 200) throw new Error(`GitHub 파일 읽기 실패 ${path} (${r.status})`);
    let text: string;
    if (r.body.content && r.body.encoding === "base64") {
      text = Buffer.from(r.body.content, "base64").toString("utf8");
    } else {
      // 1MB 가 넘는 파일은 blob 으로 따로 받아야 합니다
      const blob = await this.call<{ content: string }>(`/git/blobs/${r.body.sha}`);
      text = Buffer.from(blob.body.content, "base64").toString("utf8");
    }
    return JSON.parse(text) as T;
  }

  /**
   * 여러 파일을 한 번의 커밋으로 저장합니다.
   * change 함수는 최신 내용을 읽어서 바꿀 파일들을 돌려줍니다 (null 이면 삭제).
   * 동시에 다른 사람이 저장해서 충돌하면 최신 내용으로 다시 시도합니다.
   */
  async commit(message: string, change: (read: <T>(path: string) => Promise<T | null>) => Promise<Record<string, unknown | null>>) {
    for (let attempt = 1; attempt <= 5; attempt++) {
      const headSha = await this.head();
      const files = await change((path) => this.read(path, headSha));
      const entries = Object.entries(files);
      if (!entries.length) return;

      const commitInfo = await this.call<{ tree: { sha: string } }>(`/git/commits/${headSha}`);
      const tree = await this.call<{ sha: string }>(`/git/trees`, {
        method: "POST",
        body: JSON.stringify({
          base_tree: commitInfo.body.tree.sha,
          tree: entries.map(([path, value]) =>
            value === null
              ? { path, mode: "100644", type: "blob", sha: null }
              : { path, mode: "100644", type: "blob", content: JSON.stringify(value, null, 2) },
          ),
        }),
      });
      if (tree.status !== 201) throw new Error(`GitHub 저장 실패 (tree ${tree.status})`);
      const commit = await this.call<{ sha: string }>(`/git/commits`, {
        method: "POST",
        body: JSON.stringify({ message, tree: tree.body.sha, parents: [headSha] }),
      });
      if (commit.status !== 201) throw new Error(`GitHub 저장 실패 (commit ${commit.status})`);
      const moved = await this.call(`/git/refs/heads/${this.cfg.branch}`, {
        method: "PATCH",
        body: JSON.stringify({ sha: commit.body.sha, force: false }),
      });
      if (moved.status === 200) return;
      if (moved.status !== 422 && moved.status !== 409) throw new Error(`GitHub 저장 실패 (ref ${moved.status})`);
      await new Promise((r) => setTimeout(r, 200 * attempt + Math.random() * 300)); // 충돌: 잠깐 쉬고 다시
    }
    throw new Error("다른 저장과 계속 겹쳐서 저장하지 못했어요. 잠시 뒤 다시 시도해 주세요.");
  }
}

const encodePath = (p: string) => p.split("/").map(encodeURIComponent).join("/");

// 이메일을 파일 이름으로 그대로 쓰지 않도록 짧은 코드로 바꿉니다
export const emailKey = (email: string) => crypto.createHash("sha256").update(email).digest("hex").slice(0, 16);
