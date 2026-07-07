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
}

export default function ChannelIcon({ id, className = '' }) {
  const ch = channelById(id)
  return (
    <span
      className={'ch-chip ' + className}
      style={{ background: ch?.color || '#878A93', color: ch?.fg || '#fff' }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 16 16">
        {ICONS[id] || ICONS['기타']}
      </svg>
    </span>
  )
}
