# 팀즈(Teams) 알림 연동 — 워크플로 웹훅 만들기

'26.7 · 목적: RMN/촬영/신규 일정 알림을 팀즈 채널로 자동 발송. 받는 사람은 팀즈만
있으면 되고(신규 설치 없음), 우리 쪽은 **웹훅 URL 하나**만 있으면 됩니다.

> 과거의 "Incoming Webhook 커넥터"는 MS가 폐지 중이라, 지금은 **Power Automate 워크플로**로
> 만듭니다. 아래 순서대로 5분이면 됩니다.

---

> **UI가 영어인 경우** — 아래 버튼명은 화면에 보이는 영어 그대로 표기했습니다.

## A. 팀즈 채널에서 바로 만들기 (권장) — English UI

1. 알림 받을 **team / channel** 열기 (없으면 team 만들고 "Alerts" 채널 생성)
2. 채널 이름 옆 **"•••" (More options)** 클릭
3. **"Workflows"** 클릭
4. 검색창에 **`webhook`** 입력 → 템플릿
   **"Post to a channel when a webhook request is received"** 선택
5. **"Next"** 클릭 → 연결(Connection) 확인 = 본인 회사 계정 (필요하면 "Sign in")
6. **"Microsoft Teams Team"** 과 **"Channel"** 선택 → **"Add workflow"** 클릭
7. 성공 화면에 뜨는 **URL 을 "Copy"** → 안전한 곳에 보관
   (형태: `https://prod-XX.westus.logic.azure.com:443/workflows/...`) → **"Done"**
8. **이 URL만 저에게 주시면** GitHub Secret에 넣고 발송을 붙입니다. (테스트 메시지를
   해당 채널로 실제로 한 번 쏴서 보이는지 같이 확인하겠습니다)

> 📌 URL은 "이 채널에 글을 쓸 수 있는 열쇠"입니다. 노출되면 워크플로 삭제 후
> 4~7단계 반복으로 새로 만들면 되니 부담 없이 관리하세요.

**영어 UI 요약 (클릭 순서만):**
`channel ••• → Workflows → search "webhook" → "Post to a channel when a webhook
request is received" → Next → Add workflow → Copy URL → Done`

---

## B. A가 안 될 때 — Power Automate에서 직접 (English UI)

채널 ••• 메뉴에 **"Workflows"** 가 없거나 4번 템플릿이 안 뜨면:

1. 브라우저에서 **make.powerautomate.com** 접속 (회사 계정 로그인)
2. 좌측 **"Create"** → **"Instant cloud flow"**
3. Flow 이름 입력 → 트리거 검색창에 **`Teams webhook`**
   → **"When a Teams webhook request is received"** 선택 → **"Create"**
4. **"+ New step"** → 검색 **`Post message`**
   → **"Post message in a chat or channel"** (Microsoft Teams)
   → **Post as** = *Flow bot*, **Post in** = *Channel*, **Team/Channel** 선택,
   **Message** 는 아무거나(나중에 제가 채움)
5. **"Save"** → 다시 **트리거 카드(맨 위, "When a Teams webhook request is received")**
   를 클릭해 펼치면 **"HTTP POST URL"** 이 보입니다 → 복사

---

## C. 막혔는지 판단 + 차선

- **A·B 둘 다 "Workflows"/Power Automate 접근 불가** → 회사 IT가 잠근 것. 담당자에게
  "Power Automate 워크플로(수신 웹훅) 사용 가능 여부"를 문의하거나, 아래 차선으로:
  - **사내 이메일** — 무설치·무심의·거의 무료. 매일 아침 요약에 적합. (받을 주소만 주시면 됨)
  - **SMS(문자)** — 휴대폰 직도달. 발신번호 사전등록(통신사 심의 며칠) + 건당 ~9–20원.
- 세 채널은 발송 로직이 같아 **나중에 병행**도 가능(팀즈+이메일 동시 등).

---

## D. 웹훅 확보 후 — GitHub Secret 등록 (1회)

발송 자동화는 구현 완료: `scripts/notify/daily-brief.mjs` + `.github/workflows/notify.yml`
(매일 08:00 KST — 오늘 촬영 · RMN 세금계산서/가부킹 전환 · 신규 등록 일정. 없으면 발송 생략).
남은 건 시크릿 등록뿐:

1. 브라우저에서 **github.com/resetmodes/mideacontent_cal** 접속
2. 상단 **Settings** 탭 → 좌측 **Secrets and variables** → **Actions**
3. **"New repository secret"** 클릭
   - Name: `TEAMS_WEBHOOK_URL` / Secret: 복사해둔 웹훅 URL 전체 → **Add secret**
4. (권장) 하나 더 — RMN 섹션 포함용:
   - supabase.com 대시보드 → 프로젝트 → **Settings → API** → **service_role** 키 복사
   - 같은 방법으로 Name: `SUPABASE_SERVICE_KEY` 로 등록
   - 없으면 브리핑은 발송되지만 RMN 섹션만 빠짐 (rmn_bookings는 내부 전용 RLS)
5. 테스트: 리포 **Actions** 탭 → 좌측 **"팀즈 아침 브리핑"** → **Run workflow** →
   1분 내 팀즈 채널에 카드 확인 (알릴 내용이 없으면 "발송 생략" 로그만 남음)
