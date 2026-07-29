import React from 'react'

/* 미콘룸 로고 ('26.7.29 — 사용자 제공 가이드) — 사각형 30개로 짠 기하 레터링.
   원본 SVG는 public/logo/에 보관하고, 화면에서는 인라인으로 그려 색을 상속받는다
   (네트워크 요청 0, 다크 무대에서도 같은 컴포넌트 재사용).
   가이드 규정
     ─ 심볼과 워드마크 간격 44, 글자 사이 14 (뷰박스 좌표 고정, 임의 조정 금지)
     ─ 가로 조합은 높이 48px 이상에서만. 그보다 작은 자리는 심볼 단독
     ─ 색은 그린(#0B4336) 또는 화이트만. 그라데이션·그림자·비율 변경 금지 */

/* 심볼 — 정사각 프레임의 우하단 두 모서리를 끊은 형태 */
const MARK = (
  <>
    <rect x="0" y="0" width="128" height="14" />
    <rect x="0" y="0" width="14" height="128" />
    <rect x="0" y="114" width="80" height="14" />
    <rect x="114" y="0" width="14" height="80" />
  </>
)

/* 워드마크 "미콘룸" — 세 글자 모두 128 정사각, 획 14 */
const WORD = (
  <g transform="translate(172,0)">
    <g>
      <rect x="0" y="0" width="98" height="14" />
      <rect x="0" y="114" width="98" height="14" />
      <rect x="0" y="0" width="14" height="128" />
      <rect x="84" y="0" width="14" height="128" />
      <rect x="114" y="0" width="14" height="128" />
    </g>
    <g transform="translate(142,0)">
      <rect x="0" y="0" width="128" height="14" />
      <rect x="114" y="0" width="14" height="54" />
      <rect x="52" y="26" width="76" height="14" />
      <rect x="56" y="60" width="14" height="8" />
      <rect x="0" y="68" width="128" height="14" />
      <rect x="0" y="88" width="14" height="40" />
      <rect x="0" y="114" width="128" height="14" />
    </g>
    <g transform="translate(284,0)">
      <rect x="0" y="0" width="128" height="14" />
      <rect x="114" y="14" width="14" height="6" />
      <rect x="0" y="20" width="128" height="14" />
      <rect x="0" y="34" width="14" height="6" />
      <rect x="0" y="40" width="128" height="14" />
      <rect x="0" y="60" width="128" height="14" />
      <rect x="56" y="74" width="14" height="8" />
      <rect x="0" y="88" width="128" height="14" />
      <rect x="0" y="114" width="128" height="14" />
      <rect x="0" y="88" width="14" height="40" />
      <rect x="114" y="88" width="14" height="40" />
    </g>
  </g>
)

/* 가로 조합 (심볼 + 워드마크) — height는 48 이상으로 넘길 것 */
export function LogoLockup({ height = 48, color = 'currentColor', className = '' }) {
  return (
    <svg className={className} width={height * 584 / 128} height={height}
      viewBox="0 0 584 128" fill={color} role="img" aria-label="미콘룸">
      {MARK}{WORD}
    </svg>
  )
}

/* 심볼 단독 — 좁은 자리(사이드바, 미러 필 바, 워터마크) */
export function LogoMark({ size = 24, color = 'currentColor', className = '' }) {
  return (
    <svg className={className} width={size} height={size}
      viewBox="0 0 128 128" fill={color} role="img" aria-label="미콘룸">
      {MARK}
    </svg>
  )
}
