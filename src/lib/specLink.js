/* 캘린더 채널/세부 → 매체 스펙 라이브러리 항목 매핑
   일정 모달의 "이 매체 규격·납기 보기" 딥링크에 사용.
   MEDIA에 실제 존재하는 이름만 반환 — 매체명이 바뀌면 링크는 조용히 숨김(막다른 길 방지) */
import { MEDIA } from '../data/media.js'

const NAMES = new Set(MEDIA.map(m => m.name))

/* 키 형식: `${channel}|${sub}` (세부 없으면 `${channel}|`) */
const MAP = {
  '인스타|': '인스타그램 대표계정 (the_hyundai)',
  '유튜브|': '유튜브 (현대백화점 THE HYUNDAI)',
  '유튜브|와지트': '와지트',
  '카카오톡|': '카카오톡 대표계정',
  '카카오톡|친구톡': '친구톡 와이드',
  '아파트LCD|': '아파트 LCD',
  '버스광고|': '서울버스TV',
  '백화점APP|': '앱 (APP)',
  '기타|홈페이지': '홈페이지 (WEB)',
  '기타|웹진': '웹진 에디토리얼 디파트먼트',
  '기타|신문': '신문광고',
  '기타|H.Point': 'H.Point 메인 배너',
  '기타|고지물': '고지물 (PMS)',
  '기타|TVCF·라디오': 'TVCF / 라디오',
}

/* 매핑되는 스펙 매체명 반환 (없으면 null) */
export function resolveSpecMedia(channel, sub) {
  if (!channel) return null
  // 타겟APP은 세부명이 곧 매체명 (아파트너·바이비·키즈노트 …)
  if (channel === '타겟APP' && sub && NAMES.has(sub)) return sub
  const withSub = MAP[`${channel}|${sub || ''}`]
  if (withSub && NAMES.has(withSub)) return withSub
  const base = MAP[`${channel}|`]
  if (base && NAMES.has(base)) return base
  return null
}
