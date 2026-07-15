import React from 'react'
import { channelById } from './data/channels.js'

/* 매체 아이콘 — 매체 컬러 칩 배경 + 흰색 라인 글리프 (이모지 금지 원칙 준수)
   칩 컬러는 channels.js의 color 필드에서 관리 */
const S = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round' }
const F = { fill: 'currentColor', stroke: 'none' }

const ICONS = {
  '타겟APP': (
    <>
      <circle {...S} cx="8" cy="8" r="5.2" />
      <circle {...F} cx="8" cy="8" r="1.7" />
    </>
  ),
  '인스타': (
    <>
      <rect {...S} x="2.7" y="2.7" width="10.6" height="10.6" rx="3" />
      <circle {...S} cx="8" cy="8" r="2.5" />
      <circle {...F} cx="11.1" cy="4.9" r=".9" />
    </>
  ),
  '유튜브': (
    <>
      <rect {...S} x="2" y="3.6" width="12" height="8.8" rx="2.4" />
      <path {...F} d="M7 5.9v4.2L10.4 8z" />
    </>
  ),
  '버스광고': (
    <>
      <rect {...S} x="3" y="2.4" width="10" height="10" rx="2" />
      <path {...S} d="M3 8.2h10" />
      <circle {...F} cx="5.6" cy="13.8" r="1" />
      <circle {...F} cx="10.4" cy="13.8" r="1" />
    </>
  ),
  '백화점APP': (
    <>
      <rect {...S} x="4.6" y="1.8" width="6.8" height="12.4" rx="1.8" />
      <path {...S} d="M7 11.9h2" />
    </>
  ),
  '카카오톡': (
    <path {...S} d="M8 2.9c-3.5 0-6.1 2.2-6.1 4.9 0 1.7 1 3.2 2.7 4.1l-.7 2.6 2.9-1.6q.6.1 1.2.1c3.5 0 6.1-2.2 6.1-5S11.5 2.9 8 2.9z" />
  ),
  '아파트LCD': (
    <>
      <rect {...S} x="2.6" y="3" width="10.8" height="7.8" rx="1.5" />
      <path {...S} d="M8 10.8v2.6M5.8 13.4h4.4" />
    </>
  ),
  '기타': (
    <>
      <circle {...F} cx="3.6" cy="8" r="1.2" />
      <circle {...F} cx="8" cy="8" r="1.2" />
      <circle {...F} cx="12.4" cy="8" r="1.2" />
    </>
  ),
  /* ── 팀 일정 유형 ('26.7) — channels.js TEAM_TYPES와 짝 */
  '연차': (   // 해 — 쉬는 날
    <>
      <circle {...S} cx="8" cy="8" r="2.7" />
      <path {...S} d="M8 2.4v1.8M8 11.8v1.8M2.4 8h1.8M11.8 8h1.8M4 4l1.3 1.3M10.7 10.7L12 12M12 4l-1.3 1.3M5.3 10.7L4 12" />
    </>
  ),
  '반차': (   // 반만 채운 원 — 반일
    <>
      <circle {...S} cx="8" cy="8" r="4.6" />
      <path {...F} d="M8 3.4a4.6 4.6 0 010 9.2z" />
    </>
  ),
  '외근': (   // 문 밖으로 나가는 화살표
    <>
      <path {...S} d="M9 3H4.2a1 1 0 00-1 1v8a1 1 0 001 1H9" />
      <path {...S} d="M7.5 8h6M11.3 5.8L13.5 8l-2.2 2.2" />
    </>
  ),
  '출장': (   // 서류가방
    <>
      <rect {...S} x="2.6" y="5.2" width="10.8" height="7.4" rx="1.5" />
      <path {...S} d="M6 5.2V4a1.2 1.2 0 011.2-1.2h1.6A1.2 1.2 0 0110 4v1.2M2.6 8.6h10.8" />
    </>
  ),
  '교육': (   // 펼친 책
    <>
      <path {...S} d="M8 4C6.6 3 4.2 3 2.8 3.8v8.4C4.2 11.4 6.6 11.4 8 12.4c1.4-1 3.8-1 5.2-.2V3.8C11.8 3 9.4 3 8 4z" />
      <path {...S} d="M8 4v8.4" />
    </>
  ),
  '기념일': (   // 선물상자
    <>
      <rect {...S} x="3" y="6.4" width="10" height="6.6" rx="1" />
      <path {...S} d="M8 6.4V13M5.6 6.4C4.6 4.8 6.4 3.2 8 5c1.6-1.8 3.4-.2 2.4 1.4" />
    </>
  ),
}

/* 기념일 무지개 칩 ('26.7) — 특별한 날 강조. 단색 배경 대신 무지개 그라데이션 특수 처리 */
const RAINBOW = 'linear-gradient(135deg,#E23C3C 0%,#E8730C 20%,#F4C020 40%,#2FA84F 58%,#2563EB 76%,#7C3AED 100%)'

export default function ChannelIcon({ id, className = '' }) {
  const ch = channelById(id)
  const bg = ch?.rainbow ? RAINBOW : (ch?.color || '#878A93')
  return (
    <span
      className={'ch-chip ' + className}
      style={{ background: bg, color: ch?.fg || '#fff' }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 16 16">
        {ICONS[id] || ICONS['기타']}
      </svg>
    </span>
  )
}
