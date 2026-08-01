/* ─────────────────────────────────────────────────────────────
   미디어 바이럴 라운지 ('26.8) — 타 팀 매체 신청 규칙 단일 소스
   - 백화점APP 구좌 4종 규칙은 "APP 광고 가이드 v0.4" (커뮤니케이션팀 전달 양식,
     '26.8 스크린샷 수령분) 기준. 규격, 글자수, 리드타임, 이동페이지를 폼이 강제한다
   - 리드타임 3단(+3, +5, +10 영업일)은 게시희망일 기준 "전달 마감"이므로
     오늘부터 희망일까지 남은 영업일과 대조해 경고만 한다 (접수는 막지 않음)
   - 담당 배정 기본값(DEFAULT_OWNERS)은 가이드 명시 담당 체계, 수기 지정 가능
   ───────────────────────────────────────────────────────────── */
import { HOLIDAYS } from './holidays.js'
import { MEDIA } from './media.js'
import { CHANNELS } from './channels.js'

/* ── 신청 가능 매체 — 캘린더 채널 id와 동일 (확정 시 캘린더 등록에 그대로 사용).
   RMN(유료 판매)은 제외 ('26.7 사용자 확정) */
export const LOUNGE_MEDIA = [
  { id: '인스타', label: '인스타' },
  { id: '유튜브', label: '유튜브' },
  { id: '백화점APP', label: '백화점APP' },
  { id: '카카오톡', label: '카톡' },
  { id: '아파트LCD', label: 'APT LCD' },
  { id: '타겟APP', label: '타겟APP' },
]
export const RECOMMEND_ID = '추천'   // "잘 모르겠어요" — 매체 미정 신청

export const SELL_POINTS = ['할인', '증정', '국내 최초', '신규 오픈', '한정', '시즌 행사']
export const GOALS = ['방문 유도', '인지 확대', '판매 전환']

/* ── 소재 준비 상태 → 전달 마감 (가이드 공통 규칙: 게시희망일 기준 영업일) ── */
export const READY_STATES = [
  { id: 'done', label: '완성 소재 있음', lead: 3 },
  { id: 'image', label: '이미지 제작 필요', lead: 5 },
  { id: 'page', label: '페이지 제작 필요', lead: 10 },
]
export const readyById = id => READY_STATES.find(r => r.id === id) || READY_STATES[0]

/* ── 백화점APP 구좌 4종 (가이드 시트 구좌1, 2, 3 + 푸시 템플릿) ── */
export const APP_SLOTS = [
  {
    id: 'shopping', name: '앱 메인 Shopping info', w: 750, h: 750,
    title: { lines: 2, perLine: 11, note: '한 줄당 공백 포함 최대 11자, 초과분은 말줄임 처리' },
    landing: true,
    notes: ['노출 지점은 행사 진행 지점에 한함, 타 지점 노출은 계획품의서 검토 후 확정'],
  },
  {
    id: 'banner', name: '앱 하단 배너', w: 650, h: 242,
    title: { adminOnly: true, note: '제목은 앱에 노출되지 않는 관리용, 편하게 작성' },
    landing: true,
    notes: ['노출 지점은 행사 진행 지점에 한함, 타 지점 노출은 계획품의서 검토 후 확정'],
  },
  {
    id: 'popup', name: '앱 메인팝업', w: 720, h: 512,
    title: { adminOnly: true, note: '제목은 앱에 노출되지 않는 관리용, 편하게 작성' },
    landing: true, maxDays: 7, audience: true,
    notes: [
      '매일 노출되어 피로감이 높은 구좌, 최대 1주 노출 권장',
      '노출 지점은 행사 진행 지점에 한함, 타 지점 노출은 계획품의서 검토 후 확정',
    ],
  },
  {
    id: 'push', name: '앱 푸시', w: 500, h: 250, imgOptional: true,
    push: { titleMax: 30, bodyMax: 60, bodyPerLine: 30 },
    landing: true, audience: true,
    notes: [
      '제목과 내용에 이모지 사용 불가',
      '발송 지점은 행사 진행 지점 한정, 타 지점 발송은 운영계획안 문서 전달 후 내부 검토',
    ],
  },
]
export const appSlotById = id => APP_SLOTS.find(s => s.id === id) || null

/* 푸시 유형 12종 택1 (가이드 푸시 템플릿) */
export const PUSH_TYPES = ['문화센터', '스페셜쿠폰', '행사안내', '이벤트', '공지', '비대면결제',
  'VIP음료주문', '현대백화점카드', '젤리레이스', '본사공지', '안내', '긴급']

/* ── 이동페이지 택1 (가이드 공통) — 프리즘행사카드는 승인 후에만 세팅 가능 ── */
export const LANDING_KINDS = [
  { id: 'prism', label: '프리즘 행사카드' },
  { id: 'menu', label: 'APP 메뉴' },
  { id: 'url', label: 'URL 링크' },
]
export const APP_MENUS = ['지점안내(서브메인)', '행사안내', '현대백화점카드(서브메인)',
  '문화센터', '마이페이지', '알림함', '설정', '나의 쿠폰']

/* ── 노출, 발송 대상 (팝업과 푸시) ── */
export const AUDIENCE_KINDS = [
  { id: 'card', label: '자사카드 회원' },
  { id: 'hpoint', label: 'H.point 회원' },
  { id: 'excel', label: '엑셀 타겟' },
]
export const CARD_GRADES = ['전체', '자스민', '세이지', 'YP', '그린', '일반']
/* 엑셀 타겟 파일(고객번호)은 개인정보라 라운지에서 받지 않는다 — 담당자에게 별도 전달 안내만.
   가이드 규칙: 5만 명 단위 분할, e현대 고객번호 권장 */
export const EXCEL_NOTE = '고객번호 파일은 개인정보라 여기서 받지 않습니다, 담당자 배정 후 별도 전달해 주세요 (5만 명 단위 분할, e현대 번호 권장)'

/* ── 매체별 기본 담당 (가이드 명시 + 팀 담당 체계, 수기 지정 가능) ── */
export const DEFAULT_OWNERS = {
  '백화점APP': { main: '이수정 선임', subs: ['백채은 선임', '하지훈 책임'] },
}

/* ─────────────────────────────────────────────────────────────
   타겟APP ('26.8 2차) — 스펙은 media.js 타겟형 매체가 단일 소스 (중복 등재 금지).
   앱 목록은 channels.js 세부와 동일 (캘린더 등록 sub 값으로 그대로 사용).
   media.js에 없는 앱(K-Ride)은 스펙 미등록으로 표기하고 접수는 받는다
   ───────────────────────────────────────────────────────────── */
export const TARGET_APPS = CHANNELS.find(c => c.id === '타겟APP')?.subs || []

export function targetSpec(name) {
  return MEDIA.find(m => m.group === '타겟형 매체' && m.name === name) || null
}

/* "D-7 (영업일)" → 7. 형식이 다르면 null (계산 불가 시 경고 생략) */
export function leadDaysOf(entry) {
  const m = entry?.lead?.match(/D-(\d+)/)
  return m ? +m[1] : null
}

/* 선택 앱 중 가장 긴 리드타임 — 경고는 최장 기준 (그 앱 이름 병기) */
export function maxTargetLead(names) {
  let best = null
  for (const n of names || []) {
    const d = leadDaysOf(targetSpec(n))
    if (d != null && (!best || d > best.need)) best = { need: d, from: n }
  }
  return best
}

/* 주류 등 표현 검수가 필요한 앱 — media.js target 문구에서 파생 (별도 목록 유지 안 함) */
export function targetCaution(name) {
  const t = targetSpec(name)?.target || ''
  return t.includes('주류') ? '주류 매체, 표현 검수 필수' : null
}

/* "1080 × 720" → {w, h}. 규격 미기재 지면은 null */
export function parseSize(size) {
  const m = (size || '').match(/(\d+)\s*×\s*(\d+)/)
  return m ? { w: +m[1], h: +m[2] } : null
}

/* ── 상태 — 저장값. 파이프라인 표시의 "담당 배정" 단계는 owner 유무로 파생 ── */
export const LOUNGE_STATUS = ['접수', '협의', '확정', '게시 완료']
export const STATUS_REJECT = '반려'

/* ─────────────────────────────────────────────────────────────
   영업일 계산 — 주말(토, 일)과 HOLIDAYS(대체공휴일 포함) 제외
   ───────────────────────────────────────────────────────────── */
const pad = n => String(n).padStart(2, '0')
export const isoOf = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const dateOf = iso => new Date(`${iso}T12:00:00`)   // 정오 고정 — DST 없는 KST에서도 안전

export function isBusinessDay(iso) {
  const d = dateOf(iso)
  const wd = d.getDay()
  if (wd === 0 || wd === 6) return false
  return !HOLIDAYS[iso]
}

/* from 다음 날부터 to까지의 영업일 수 (to가 from 이전이면 0).
   "오늘 전달하면 몇 영업일 확보되나"의 답 — 가이드의 "+N영업일 전까지 전달"과 대조 */
export function bizDaysBetween(fromIso, toIso) {
  if (!fromIso || !toIso || toIso <= fromIso) return 0
  let n = 0
  const d = dateOf(fromIso)
  const end = dateOf(toIso)
  while (d < end) {
    d.setDate(d.getDate() + 1)
    if (isBusinessDay(isoOf(d))) n++
  }
  return n
}

/* 리드타임 대조 — 경고만, 접수는 막지 않음. needOverride = 타겟APP 등 구좌 외 기준 */
export function leadCheck(todayIso, wishIso, readyId, needOverride) {
  if (!wishIso) return null
  const need = needOverride ?? readyById(readyId).lead
  const left = bizDaysBetween(todayIso, wishIso)
  return { need, left, ok: left >= need }
}

/* 전달 마감 실날짜 — 게시희망일에서 영업일 n일 역산 ('26.8 2차).
   "D-5 영업일"만 보여주면 신청자가 날짜로 환산을 못 한다, 달력 날짜로 박아준다 */
export function bizDeadline(wishIso, n) {
  if (!wishIso || !n) return null
  const d = dateOf(wishIso)
  let count = 0
  while (count < n) {
    d.setDate(d.getDate() - 1)
    if (isBusinessDay(isoOf(d))) count++
  }
  return isoOf(d)
}

const KDAY = ['일', '월', '화', '수', '목', '금', '토']
export function fmtKday(iso) {
  if (!iso) return ''
  return `${+iso.slice(5, 7)}/${+iso.slice(8, 10)}(${KDAY[dateOf(iso).getDay()]})`
}

/* ─────────────────────────────────────────────────────────────
   문안 검증
   ───────────────────────────────────────────────────────────── */
/* 이모지 감지 — 푸시는 이모지 불가 (가이드). 한글, 한자, 일반 기호는 통과 */
export function hasEmoji(str) {
  if (!str) return false
  try { return /\p{Extended_Pictographic}/u.test(str) } catch { /* 구형 브라우저 */ }
  return /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(str)
}

/* 줄 단위 글자수 검사 — 초과 줄 번호 목록 반환 (공백 포함 기준, 가이드 원문) */
export function overLines(text, perLine) {
  return (text || '').split('\n').map((l, i) => (l.length > perLine ? i + 1 : null)).filter(Boolean)
}

/* 이미지 비율 검사 — 규격 비율에서 5% 넘게 벗어나면 잘려 보임 */
export function ratioOff(imgW, imgH, slotW, slotH) {
  if (!imgW || !imgH) return 0
  const target = slotW / slotH
  return Math.abs(imgW / imgH - target) / target
}

/* 접수번호 — MR-YYMMDD-NN (그날 접수 순번) */
export function makeReqNo(iso, seq) {
  return `MR-${iso.slice(2, 4)}${iso.slice(5, 7)}${iso.slice(8, 10)}-${pad(seq)}`
}

/* ─────────────────────────────────────────────────────────────
   전달 경로 체크리스트 ('26.8 2차) — "무엇을 여기 올리고 무엇을 팀즈로 따로
   보내는지" 신청자가 알 수 없던 문제. 선택 상태에서 두 목록을 파생한다:
   now = 이 접수로 끝나는 것 / later = 담당자 배정 후 팀즈로 따로 전달할 것.
   폼 하단과 접수 완료 화면에 같은 목록을 보여준다 (약속의 단일 소스)
   ───────────────────────────────────────────────────────────── */
export function handoffPlan(f) {
  const now = ['신청 내용과 일정 (이 접수로 전달 완료)']
  if (f.sources?.length) now.push(`브랜드 소스 이미지 ${f.sources.length}장`)
  if (f.sourceLink) now.push('소스 공유 링크')

  const later = []
  /* 소재 마감 — 구좌(3단 리드타임) 또는 타겟APP(앱별 D-N 최장) 기준 실날짜 역산 */
  const slot = appSlotById(f.appSlot)
  const need = slot ? readyById(f.ready).lead : maxTargetLead(f.targetApps)?.need
  const due = f.wishDate && need ? bizDeadline(f.wishDate, need) : null
  if (f.sourceLater || (!f.sources?.length && !f.sourceLink))
    later.push({ label: '완성 소재', to: '담당자에게 팀즈로', due })
  if (f.hasPlan)
    later.push({ label: '계획안 문서', to: '담당자 배정 후 팀즈 개별 공유' })
  if (f.audienceKind === 'excel')
    later.push({ label: '타겟 고객번호 엑셀', to: '개인정보라 담당자에게 별도 전달, 5만 명 단위 분할' })
  if (f.landingKind === 'prism' && !f.prismApproved)
    later.push({ label: '행사카드 승인 후 카드번호', to: '승인 완료를 확인하고 담당자에게 전달' })
  return { now, later, due }
}

/* ── 집행 결과 회신 텍스트 ('26.8 — 관리함 "결과 회신 복사") — 게시 완료 건을
   신청 부서에 팀즈로 회신하는 카드. perf = campaignPerf.buildCampaignPerf 결과
   (수치가 있는 매체만 싣고 나머지는 집계 확인 중 — 추정, 환산 없음).
   boardUrl = 미러 진행 현황 (결과 이미지는 완료 카드 상세에서) */
export function resultReply(r, perf, boardUrl) {
  const d = r.details || {}
  const L = []
  L.push(`[집행 결과 회신] ${r.agenda}`)
  L.push(`신청: ${r.dept} ${r.name}${r.reqNo ? ` (${r.reqNo})` : ''}`)
  const media = r.media?.length ? r.media.join(', ') : ''
  if (media) L.push(`집행 매체: ${media}${d.targetApps?.length ? ` (${d.targetApps.join(', ')})` : ''}`)
  if (r.wishDate) L.push(`게시: ${r.wishDate}${r.wishEnd ? ` ~ ${r.wishEnd}` : ''}`)
  if (perf?.rows?.length) {
    const measured = perf.rows.filter(x => x.exp != null || x.act != null)
    if (measured.length) {
      L.push('성과 (수집 기준):')
      for (const x of measured) {
        const parts = []
        if (x.exp != null) parts.push(`노출 ${x.exp.toLocaleString()}`)
        if (x.act != null) parts.push(`${x.ch === '타겟APP' ? '클릭' : '반응'} ${x.act.toLocaleString()}`)
        L.push(`- ${x.label}: ${parts.join(', ')}${x.note ? ` (${x.note})` : ''}`)
      }
    }
    if (perf.pending?.length) L.push(`집계 확인 중: ${perf.pending.join(', ')}`)
  } else {
    L.push('성과: 집계 확인 중')
  }
  if (boardUrl) L.push(`결과 이미지와 전체 현황: ${boardUrl}`)
  if (r.owner) L.push(`담당: 미디어콘텐츠팀 ${r.owner}`)
  return L.join('\n')
}

/* ── 전달 양식 텍스트 ('26.8 — 관리함 "전달 양식으로 복사") — 가이드의 요청 템플릿 순서.
   담당자가 앱 어드민 등록이나 커뮤니케이션팀 전달에 그대로 쓴다.
   접수 완료 화면의 "접수 내용 복사"도 같은 텍스트 (신청자 보관, 팀즈 소통용) */
export function transferText(r) {
  const d = r.details || {}
  const slot = appSlotById(d.appSlot)
  const L = []
  L.push(`[매체 신청 전달] ${r.agenda}`)
  if (r.reqNo) L.push(`접수번호: ${r.reqNo}`)
  L.push(`신청: ${r.dept} ${r.name} (${r.email})`)
  if (slot) L.push(`구좌: ${slot.name} (${slot.w}x${slot.h})`)
  else if (r.media?.length) L.push(`매체: ${r.media.join(', ')}`)
  if (d.targetApps?.length) {
    L.push(`타겟 앱: ${d.targetApps.join(', ')}`)
    const ml = maxTargetLead(d.targetApps)
    if (ml && r.wishDate)
      L.push(`소재 마감: ${fmtKday(bizDeadline(r.wishDate, ml.need))} (${ml.from} D-${ml.need} 영업일 기준)`)
  }
  if (r.wishDate) L.push(`게시희망: ${r.wishDate}${d.wishTime ? ` ${d.wishTime}` : ''}${r.wishEnd ? ` ~ ${r.wishEnd}` : ''}`)
  if (r.eventStart) L.push(`행사기간: ${r.eventStart}${r.eventEnd ? ` ~ ${r.eventEnd}` : ''}`)
  if (d.branches) L.push(`지점: ${d.branches}`)
  if (d.title) L.push(`제목: ${d.title.replace(/\n/g, ' / ')}`)
  if (d.body) L.push(`내용: ${d.body.replace(/\n/g, ' / ')}`)
  if (d.pushType) L.push(`유형: ${d.pushType}`)
  if (d.adKind) L.push(`광고여부: ${d.adKind}`)
  if (d.landingKind) {
    const lk = LANDING_KINDS.find(k => k.id === d.landingKind)?.label || d.landingKind
    const v = d.landingKind === 'prism'
      ? [d.prismNo, d.prismBranch, d.prismCat, d.prismApproved ? '승인 완료' : '승인 확인 필요'].filter(Boolean).join(' / ')
      : d.landingKind === 'menu' ? d.appMenu : d.landingUrl
    L.push(`이동페이지: ${lk}${v ? ` (${v})` : ''}`)
  }
  if (d.audienceKind) {
    const ak = AUDIENCE_KINDS.find(k => k.id === d.audienceKind)?.label || d.audienceKind
    const g = d.audienceKind === 'card' && d.cardGrades?.length ? ` (${d.cardGrades.join(', ')})` : ''
    const x = d.audienceKind === 'excel' ? ' (타겟 파일은 신청 부서에서 별도 수령)' : ''
    L.push(`대상: ${ak}${g}${x}`)
  }
  const ready = READY_STATES.find(s => s.id === d.ready)
  if (ready) L.push(`소재: ${ready.label} (전달 마감 게시희망일 기준 ${ready.lead}영업일 전)`)
  if (r.sellNote || r.sellPoints?.length) L.push(`소구점: ${[...(r.sellPoints || []), r.sellNote].filter(Boolean).join(', ')}`)
  if (r.goal) L.push(`목적: ${r.goal}`)
  if (r.memo) L.push(`메모: ${r.memo}`)
  return L.join('\n')
}
