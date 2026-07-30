# YouTube 스튜디오 지표 연동 설정 ('26.7.29)

모니터링 탭 → 채널명 클릭 → **채널 성과 대시보드**에서
시청시간·구독자 증감·월별 조회수 추이를 보려면 1회 설정이 필요합니다.

---

## 무엇이 되고, 무엇이 안 되나

| 지표 | API 제공 | 비고 |
|---|---|---|
| 조회수 (월별·기간) | O | 스튜디오와 동일 값 |
| 시청시간 (추정) | O | |
| 구독자 증감 (가입·해지) | O | |
| 평균 시청 지속시간 / 비율 | O | |
| 좋아요·댓글·공유 | O | |
| 영상별 조회수·시청시간 | O | 상위 10편 |
| 트래픽 소스 (검색·추천·외부) | O | 지금은 미수집, 필요하면 추가 |
| 시청자 지역·연령·성별 | O | 지금은 미수집, 필요하면 추가 |
| **노출수 · 노출 클릭률(CTR)** | **X** | **API에 지표 자체가 없음. 스튜디오에서 직접 확인** |
| **수익 (예상 수익)** | **△** | 수익화 채널만. `yt-analytics-monetary.readonly` 스코프 추가 필요 |
| 최근 2~3일 지표 | △ | 확정 전이라 값이 흔들림. 대시보드는 월 단위라 영향 적음 |

> GA4와 달리 **유튜브는 서비스 계정을 지원하지 않습니다.**
> 채널 소유(관리자) 구글 계정이 1회 동의하고, 그때 발급되는 **refresh token**을
> 시크릿으로 저장해 쓰는 방식입니다. 이후에는 사람 개입 없이 자동 수집됩니다.

---

## 설정 절차

### 1. Google Cloud에서 OAuth 클라이언트 만들기
1. https://console.cloud.google.com → 기존 GA4 연동에 쓰는 프로젝트 선택
2. **API 및 서비스 → 라이브러리** → `YouTube Analytics API` 검색 → **사용 설정**
3. 같은 방법으로 `YouTube Data API v3`도 **사용 설정** (영상 제목 조회용)
4. **API 및 서비스 → OAuth 동의 화면** → 사용자 유형 **외부** → 앱 이름 아무거나 →
   테스트 사용자에 **채널 관리 구글 계정** 추가
5. ⚠ **여기서 반드시 "앱 게시" 를 눌러 게시 상태를 `프로덕션`으로 바꿉니다.**
   테스트 상태로 두면 **refresh token이 7일 후 만료**되어 다음 주부터 수집이 멈춥니다.
   (외부 앱이지만 우리 계정만 쓰므로 구글 심사 대상이 아닙니다. 게시 후 "확인되지 않은 앱"
   경고가 떠도 고급 → 계속을 누르면 됩니다)
6. **API 및 서비스 → 사용자 인증 정보 → 사용자 인증 정보 만들기 → OAuth 클라이언트 ID**
   - 유형: **데스크톱 앱**
   - 생성 후 **클라이언트 ID / 클라이언트 보안 비밀번호** 복사

### 2. refresh token 발급 (1회, 채널 관리 계정으로)
브라우저에서 아래 주소를 열고 동의합니다. `CLIENT_ID` 자리에 1번에서 받은 값을 넣으세요.

```
https://accounts.google.com/o/oauth2/v2/auth
  ?client_id=CLIENT_ID
  &redirect_uri=urn:ietf:wg:oauth:2.0:oob
  &response_type=code
  &access_type=offline
  &prompt=consent
  &scope=https://www.googleapis.com/auth/yt-analytics.readonly%20https://www.googleapis.com/auth/youtube.readonly
```

동의하면 화면에 **인증 코드**가 나옵니다. 그 코드를 아래처럼 교환합니다(터미널 1회 실행).

```bash
curl -s https://oauth2.googleapis.com/token \
  -d client_id=CLIENT_ID \
  -d client_secret=CLIENT_SECRET \
  -d code=붙여넣은_인증코드 \
  -d grant_type=authorization_code \
  -d redirect_uri=urn:ietf:wg:oauth:2.0:oob
```

응답의 **`refresh_token`** 값을 복사합니다 (한 번만 나오니 주의).

### 3. 채널 ID 채우기
스튜디오 → **설정 → 채널 → 고급 설정**에서 `UC…` 형식의 채널 ID를 복사해
`scripts/sns/accounts.mjs`의 `YT_CHANNELS[].channelId`에 채웁니다 (채널 4개 각각).

> 관리 권한이 있는 채널만 조회됩니다. 권한이 없으면 그 채널만 조용히 건너뜁니다.

### 4. GitHub 시크릿 등록
저장소 → Settings → Secrets and variables → Actions → New repository secret

| 이름 | 값 |
|---|---|
| `YT_OAUTH_CLIENT_ID` | 1번의 클라이언트 ID |
| `YT_OAUTH_CLIENT_SECRET` | 1번의 클라이언트 보안 비밀번호 |
| `YT_OAUTH_REFRESH_TOKEN` | 2번의 refresh_token |

### 5. 실행
- 수동: Actions → **SNS 데이터 수집** → Run workflow (주간 수집에 포함됨)
- 로컬 확인: `node scripts/sns/yt-analytics.mjs --dry-run`

정상 실행되면 `src/data/sns/ytAnalytics.js`가 갱신되고,
모니터링 탭의 채널 대시보드에 **스튜디오 지표** 섹션이 자동으로 나타납니다.

---

## 주의

- refresh token은 **비밀번호와 동급**입니다. 절대 코드·문서에 붙여넣지 마세요 (.env는 gitignore).
- 계정 비밀번호를 바꾸거나 앱 권한을 해제하면 토큰이 만료됩니다 → 2번만 다시 하면 됩니다.
- **토큰이 6개월 이상 한 번도 쓰이지 않으면** 만료됩니다. 주간 수집이 돌고 있으면 해당 없습니다.
- 수집이 조용히 멈춘 것 같으면 Actions 로그에서 `토큰 교환 실패 400`을 확인하세요.
  이 오류면 2번(refresh token 발급)만 다시 하면 복구됩니다.
- 공개 저장소라 Actions 로그에는 **채널 수만** 출력하고 실적 수치는 남기지 않습니다.
- 노출수·CTR이 꼭 필요하면 스튜디오에서 CSV를 내려 어드민에 수기 입력하는 방식을 추가할 수 있습니다.
