# 월간 집행 리포트 — 데이터 계약 ('26.7 선행 설계·구현)

> 상태: **데이터 계층 구현 완료** (`src/lib/report.js` + `scripts/test-report.mjs`).
> **UI·출력물은 미착수** — 규빈의 별도 양식을 받으면 이 계약 위에 매핑만 하면 된다 ('26.7 합의).
> 양식 매핑·렌더는 고가 모델 세션 권장 (PLAYBOOK 8장).

## 데이터 소스

| 데이터 | 원천 | 비고 |
|---|---|---|
| 일정·캠페인·실적 확정 | Supabase `media_events` (store.listEvents) | perfUrl = 담당자 확정분만 |
| SNS 팔로워·구독 증감 | `src/data/sns/trend.js` 스냅샷 | 격주 수집 — 한 달 2개 전제 |

## 귀속·집계 규칙 (합의된 정의 — 바꾸려면 이 문서부터 수정)

1. **월 귀속 = 시작일 기준.** 기간 일정이 월을 걸쳐도 시작월에 1건 (중복 계상 없음)
2. **집행 건수 = 촬영(kind='촬영') 제외** 전 일정. 촬영은 `shootTotal`로 별도
3. **실적은 확정분만** 리포트에 실음 (후보 매칭은 운영 화면 전용 — 보고서에 근사값 금지)
4. 캠페인 미지정 일정은 `noCampaign` 건수로만 (캠페인 상세에는 미포함)
5. 예산 필드는 아직 없음 — 도입 시 천 원 단위 규칙 (CLAUDE.md 도메인 지식)

## buildMonthlyReport(events, year, month) 반환 구조

```js
{
  year, month,
  total,            // 집행 건수 (촬영 제외)
  shootTotal,       // 촬영 건수
  confirmedTotal,   // 실적 확정 건수
  byChannel,        // { 인스타: 4, 유튜브: 2, ... }
  noCampaign,       // 캠페인 미지정 건수
  campaigns: [{     // 시작일순
    name, count,
    channels,                       // 관여 매체 배열
    period: { start, end },         // 첫 시작일 ~ 마지막 종료일
    confirmed: [{ date, title, url }],   // 확정 실적 링크
    events: [{ date, endDate, channel, sub, title, owner, perfUrl }],
  }],
}
```

## snsMonthlyDelta(trend, year, month)

해당 월의 첫/마지막 스냅샷 비교 → `{ from, to, igFollowers: {handle: Δ}, ytSubscribers: {key: Δ} }`.
스냅샷 2개 미만이면 `null` (리포트에서 "집계 불가" 처리).

## 남은 작업 (양식 도착 후)

1. 양식 항목 ↔ 위 필드 매핑표 작성 (양식에 없는 데이터 = 신규 필드 논의)
2. 출력 형태 결정: 사이트 내 인쇄 뷰 / 파일 다운로드 — 디자인 규칙 준수
3. `npm run test`의 test-report.mjs에 양식 기준 케이스 보강
