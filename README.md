# DCHOI09 전집 컨시어지 챗봇

dchoi09.com **전집** 상품(153개)을 공부한 상담 챗봇이에요. Claude **Sonnet 5.5** 모델로 움직여요.

| 주소 | 누가 쓰나요 | 하는 일 |
|---|---|---|
| `/` | 손님 | 이름과 이메일을 넣고 챗봇과 대화해요 |
| `/admin` | 운영자 | 사람별 대화기록 보기, Q&A 추가·수정·삭제, 엑셀 내려받기·올리기, 챗봇 규칙 4가지 고치기, 차단과 차단 풀기 |

---

## 🧸 먼저, 이게 어떻게 움직이나요?

```
내 컴퓨터 (코드)  ──올리기──▶  GitHub (코드 보관함)  ──자동──▶  Vercel (인터넷에 공개)
                                                                 │
                                         Anthropic (Claude 두뇌) ◀┤
                                         Upstash Redis (기억 상자) ◀┘
```

- **GitHub**: 코드를 넣어 두는 보관함이에요.
- **Vercel**: 보관함 속 코드를 꺼내서 누구나 들어올 수 있는 웹사이트로 만들어 줘요. GitHub에 새 코드가 올라가면 **알아서 다시 만들어요.**
- **Anthropic API 키**: 챗봇 두뇌(Claude)를 쓰는 열쇠예요.
- **Upstash Redis**: 대화기록, 고친 Q&A, 고친 규칙을 기억하는 상자예요. 이게 없으면 인터넷에서 기록이 남지 않아요.

---

## ✅ 내가 할 일 (순서대로)

### 1단계. API 키 넣기 (내 컴퓨터)
1. https://platform.claude.com 에 로그인하고 **API Keys** 메뉴에서 **Create Key**를 눌러요. `sk-ant-`로 시작하는 키가 나와요.
2. 이 폴더의 **`.env.local`** 파일을 열어요. (Finder에서 안 보이면 `Cmd + Shift + .` 을 눌러요.)
3. `ANTHROPIC_API_KEY=` 바로 뒤에 키를 붙여넣고 저장해요. 띄어쓰기와 따옴표는 넣지 마세요.
4. 같은 파일의 `ADMIN_PASSWORD=` 뒤에 있는 글자가 관리자 비밀번호예요. 원하면 바꿔도 돼요.

> ⚠️ API 키는 비밀번호와 같아요. 카톡이나 메일로 보내지 마세요. `.env.local` 파일은 GitHub에 올라가지 않게 막아 두었어요.

### 2단계. 내 컴퓨터에서 켜 보기
터미널에서 이 폴더로 와서 아래를 입력해요.
```bash
npm run dev
```
- 손님 화면: http://localhost:3000
- 관리자 화면: http://localhost:3000/admin (1단계의 비밀번호로 들어가요)

끄려면 터미널에서 `Ctrl + C` 를 눌러요.

### 3단계. (선택) 상세페이지 이미지까지 읽히기
dchoi09.com 상세페이지는 대부분 **그림(이미지)**이라서 글자를 그대로 가져올 수 없어요. 아래 명령을 실행하면 Claude가 이미지를 직접 보고 내용을 정리해 줘요.
```bash
npm run enrich
```
```bash
npm run excel
```
- 시간은 10~20분쯤 걸리고, API 사용료가 몇 달러 정도 나와요.
- 끝나면 `data/products.json` 과 엑셀 파일 `data/dchoi09_전집.xlsx` 의 "상세이미지요약" 칸이 채워져요.
- 사이트 상품이 바뀌면 `npm run data` 로 다시 모아요. (기존 요약은 그대로 남아요)

### 4단계. GitHub에 올리기
코드를 처음 올릴 때와 고칠 때 모두 아래 3줄이면 돼요. (Claude에게 "깃허브에 올려줘"라고 해도 돼요.)
```bash
git add -A
```
```bash
git commit -m "챗봇 업데이트"
```
```bash
git push
```
저장소 주소: https://github.com/monica91-dev/dchoi-chatbot1

### 5단계. Vercel에 연결하기 (한 번만 하면 돼요)
1. https://vercel.com 에서 **Continue with GitHub**로 로그인해요.
2. **Add New… → Project**를 누르고 `dchoi-chatbot1` 옆의 **Import**를 눌러요.
   (목록에 없으면 **Adjust GitHub App Permissions**를 눌러서 이 저장소를 허용해요.)
3. **Environment Variables**를 펼치고 아래 4개를 하나씩 넣어요. (Key 칸에 이름, Value 칸에 값)

   | Key | Value |
   |---|---|
   | `ANTHROPIC_API_KEY` | 1단계의 API 키 |
   | `ADMIN_PASSWORD` | 관리자 비밀번호 |
   | `SESSION_SECRET` | `.env.local` 에 있는 긴 글자를 그대로 복사 |
   | `CLAUDE_MODEL` | `claude-sonnet-5-5` |

4. **Deploy**를 누르고 1~2분 기다리면 `https://dchoi-chatbot1-xxxx.vercel.app` 같은 주소가 생겨요. 🎉

### 6단계. 기억 상자(Upstash Redis) 연결하기 (한 번만, 꼭 해야 해요)
이걸 안 하면 인터넷 버전에서 **대화기록이 저장되지 않아요.** 관리자 화면에 노란 경고도 떠요.
1. Vercel에서 내 프로젝트를 열고 위쪽의 **Storage** 탭을 눌러요.
2. **Create Database** (또는 Browse Marketplace)에서 **Upstash → Upstash for Redis**를 골라요.
3. 무료 요금제(Free)와 가까운 지역(예: US East)을 고르고 **Create**를 눌러요.
4. **Connect Project**에서 `dchoi-chatbot1`를 골라 연결해요. 그러면 `KV_REST_API_URL`, `KV_REST_API_TOKEN` 이 자동으로 들어가요.
5. **Deployments** 탭에서 맨 위 항목의 **⋯ → Redeploy**를 눌러 다시 배포해요.

### 7단계. 이제부터는?
- 코드를 고치면 **4단계(git push)만** 하면 돼요. Vercel이 자동으로 새 버전을 올려요.
- Q&A와 규칙은 코드를 고칠 필요 없이 **/admin** 에서 바로 바꾸면 돼요. 다음 대화부터 바로 적용돼요.

---

## 🛠 관리자 화면 사용법

- **대화기록**: 사람을 누르면 대화가 보여요. 손님 메시지 아래에는 *기분 · 판별 결과 · 이유*가 작게 나와요. 버튼으로 차단하거나, 정상으로 되돌리거나(경고 0회로 초기화), 삭제할 수 있어요.
- **Q&A 관리**: 검색, 분류 고르기, **+ 새 Q&A**, 수정, 삭제를 할 수 있어요. 챗봇은 상품 정보보다 Q&A 답변을 **먼저** 믿어요.
- **엑셀 내려받기 / 올리기**: 지금 학습된 상품목록과 Q&A를 엑셀로 받아요. 엑셀에서 고친 뒤 올리면 통째로 바뀌어요. 시트 이름(상품목록, Q&A)과 첫 줄 제목은 바꾸지 마세요.
- **챗봇 규칙**: 응대 규칙, 기분 파악 규칙, 이상 사용자 판별·경고 규칙, 차단 규칙, 자동 차단 경고 횟수(처음 값 3회), 차단 안내 문구를 고칠 수 있어요.

## 🤖 챗봇이 한 번 대답할 때 일어나는 일
1. **검토**: 손님 메시지를 보고 기분(긍정·중립·궁금·불안·불만·화남)과 이상 여부(정상·의심·이상)를 판단해요. 그리고 경고할지, 차단할지 정해요.
2. **경고/차단**: 경고가 정해진 횟수에 닿거나 차단 규칙에 걸리면 그 이메일은 더 이상 대화할 수 없어요.
3. **답변**: 응대 규칙, Q&A, 상품 153개 정보를 보고 손님 기분에 맞춰 대답해요. 글자가 실시간으로 흘러나와요.

## 📁 폴더 안내 (몰라도 괜찮아요)
```
data/                 상품 정보(products.json), 기본 Q&A(qa.json), 엑셀 파일
scripts/crawl.ts      dchoi09.com 전집 상품 모으기   → npm run crawl
scripts/enrich.ts     상세 이미지 읽기 (API 키 필요) → npm run enrich
scripts/build-excel.ts 엑셀 만들기                   → npm run excel
src/app/page.tsx      손님 화면
src/app/admin/        관리자 화면
src/app/api/          서버 기능 (대화, 관리자 기능)
src/lib/claude.ts     Claude 와 대화하는 부분
src/lib/defaults.ts   규칙 처음 값
```

## ❓ 문제가 생겼어요
| 증상 | 해결 |
|---|---|
| "API 키가 아직 설정되지 않았어요" | `.env.local` 또는 Vercel Environment Variables의 `ANTHROPIC_API_KEY` 확인 → Vercel은 Redeploy |
| 관리자 화면에 노란 경고 | 6단계(Upstash Redis)를 해 주세요 |
| 상담 시작 시 "저장소가 아직 연결되지 않았어요" | 6단계(Upstash Redis) 연결 → Redeploy |
| 상세 이미지 요약이 비어 있는 상품 | dchoi09 상세페이지에 이미지가 없고 출판사 사이트 링크만 있는 상품이에요 (26개). Q&A로 보충해 주세요 |
| "챗봇 API 키 설정에 문제가 있어요" | 키가 틀렸거나 지워졌어요. 새 키를 만들어 넣어요 |
| Vercel 배포가 빨간색(Error) | Deployments에서 그 항목을 눌러 빨간 글씨를 복사해 Claude에게 보여주세요 |
