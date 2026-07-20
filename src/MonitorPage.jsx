import React, { useState, useMemo, useEffect } from 'react'
import { IG } from './data/sns/instagram.js'
import { YT } from './data/sns/youtube.js'
import { UGC } from './data/sns/ugc.js'
import { TREND } from './data/sns/trend.js'
import { TA_GROUPS } from './data/targetapp.js'
import { listTargetApp } from './lib/targetappStore.js'

/* 직전 수집 스냅샷 (현재 수집일보다 앞선 것 중 최신) — 없으면 증감 미표시 */
const prevSnapshot = cur => {
  const older = TREND.filter(t => t.date < cur)
  return older.length ? older[older.length - 1] : null
}

/* 전기 대비 증감 — ▲ 현대그린 / ▼ 그레이 (빨강은 경고 전용 원칙) */
function Delta({ d }) {
  if (d == null || d === 0) return null
  return (
    <small className={'delta ' + (d > 0 ? 'up' : 'down')}>
      {d > 0 ? '▲' : '▼'}{Math.abs(d).toLocaleString('ko-KR')}
    </small>
  )
}

/* ── 하이라이트 자동 요약 ('26.7) — 규칙 기반, AI·비용 없음 ─────────
   ① 팔로워 급증·급감 (직전 수집 대비 1% 또는 50명 이상) ② 새로 휴면 진입
   ③ 유튜브 조회 급등 (최근 3주 내 게시 & 채널 평균 3배 이상)
   직전 스냅샷이 없으면 ①②는 생략 — 표시할 게 없으면 섹션 자체를 숨김.
   export: 홈 화면 "채널 시그널" 섹션도 같은 로직 재사용 (HomePage.jsx) */
export function buildHighlights() {
  const items = []

  const prevIG = prevSnapshot((IG.generatedAt || '').slice(0, 10))?.ig
  if (prevIG) {
    for (const a of IG.accounts || []) {
      const p = prevIG[a.handle]
      if (!p) continue
      if (p.f != null && a.followers != null) {
        const d = a.followers - p.f
        if (Math.abs(d) >= Math.max(50, Math.round(p.f * 0.01))) {
          items.push({
            up: d > 0, mark: d > 0 ? '▲' : '▼',
            text: `${a.name} 팔로워 ${d > 0 ? '+' : ''}${d.toLocaleString('ko-KR')} → ${num(a.followers)}`,
            weight: Math.abs(d),
          })
        }
      }
      if (p.d === false && a.dormant) {
        items.push({ mark: '·', text: `${a.name} — 새로 휴면 진입 (30일+ 미게시)`, weight: 40 })
      }
    }
  }

  /* 유튜브 조회 급등 — 상대 게시시점("N days/weeks ago")이 3주 이내인 것만 */
  const chAvg = Object.fromEntries((YT.channels || []).map(c => [c.key, c.avgViews || 0]))
  const chName = Object.fromEntries((YT.channels || []).map(c => [c.key, c.name]))
  for (const v of YT.videos || []) {
    const m = (v.date || '').match(/(\d+)\s*(day|week)s?\s+ago/)
    if (!m) continue
    const days = +m[1] * (m[2] === 'week' ? 7 : 1)
    if (days > 21) continue
    const avg = chAvg[v.channel]
    if (avg > 0 && v.views >= avg * 3) {
      const t = v.title.length > 42 ? v.title.slice(0, 42) + '…' : v.title
      items.push({
        up: true, mark: '▲', url: v.url,
        text: `${chName[v.channel] || v.channel} 조회 급등 — ${t} (${compact(v.views)}, 평균의 ${Math.round(v.views / avg)}배)`,
        weight: v.views / avg * 100,
      })
    }
  }

  return items.sort((a, b) => b.weight - a.weight).slice(0, 6)
}

function Highlights() {
  const items = useMemo(buildHighlights, [])
  if (items.length === 0) return null
  return (
    <div className="mon-hl mon-hl-feature">
      <div className="mon-hl-head">
        <span className="mon-hl-title">이번 주 하이라이트</span>
        <span className="mon-hl-count">{items.length}건</span>
      </div>
      {items.map((it, i) => (
        <div key={i} className="mon-hl-row">
          <span className={'hl-mark' + (it.up ? ' up' : '')}>{it.mark}</span>
          {it.url
            ? <a href={it.url} target="_blank" rel="noreferrer">{it.text} ↗</a>
            : <span>{it.text}</span>}
        </div>
      ))}
    </div>
  )
}

const num = n => (n == null ? '—' : n.toLocaleString('ko-KR'))
const compact = n => {
  if (n == null) return '—'
  if (n >= 100000000) return (n / 100000000).toFixed(1) + '억'
  if (n >= 10000) return (n / 10000).toFixed(1) + '만'
  return n.toLocaleString('ko-KR')
}
const fmtDate = iso => (iso ? iso.slice(0, 10).replace(/-/g, '.') : '—')

/* "3 days ago" 류 상대 표기 → 한글, ISO 날짜 → 점 표기 */
const koDate = s => {
  if (!s) return '—'
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return fmtDate(s)
  const m = s.match(/(\d+)\s+(second|minute|hour|day|week|month|year)s?\s+ago/)
  if (!m) return s
  const unit = { second: '초', minute: '분', hour: '시간', day: '일', week: '주', month: '개월', year: '년' }[m[2]]
  return `${m[1]}${unit} 전`
}

function Hero({ stats }) {
  return (
    <div className="mon-hero">
      {stats.map(s => (
        <div key={s.label} className="mon-stat">
          <div className="mon-label">{s.label}</div>
          <div className="mon-value">{s.value}<small>{s.unit}</small></div>
          {s.sub && <div className="mon-sub">{s.sub}</div>}
        </div>
      ))}
    </div>
  )
}

const IG_GROUP_ORDER = ['본사', '사업소', '아울렛', '콘텐츠·IP', '해외']

function InstagramView() {
  const main = IG.accounts.find(a => a.isMain)
  const prev = prevSnapshot((IG.generatedAt || '').slice(0, 10))?.ig || null
  const groups = useMemo(() => {
    const inData = [...new Set(IG.accounts.map(a => a.group))]
    const order = [...IG_GROUP_ORDER.filter(g => inData.includes(g)), ...inData.filter(g => !IG_GROUP_ORDER.includes(g))]
    return order.map(g => ({
      name: g,
      list: IG.accounts.filter(a => a.group === g).sort((a, b) => b.followers - a.followers),
    }))
  }, [])
  const competitors = IG.competitors || []
  const dormantCount = IG.accounts.filter(a => a.dormant).length
  const posts30 = IG.accounts.reduce((s, a) => s + (a.postsLast30 || 0), 0)

  return (
    <>
      <Hero stats={[
        { label: '대표계정 팔로워', value: compact(main?.followers), sub: '@' + main?.handle },
        { label: '운영 계정', value: IG.accounts.length, unit: '개' },
        { label: '30일 게시물 합계', value: posts30, unit: '건' },
        { label: '휴면 계정', value: dormantCount, unit: '개', sub: '30일+ 미게시' },
      ]} />

      {groups.map(g => (
        <div key={g.name}>
          <div className="group-label">{g.name}</div>
          <AccountTable list={g.list} prev={prev} />
        </div>
      ))}

      {competitors.length > 0 && (
        <div>
          <div className="group-label">경쟁사 (참고)</div>
          <AccountTable list={[...competitors].sort((a, b) => b.followers - a.followers)} prev={prev} />
        </div>
      )}

      <div className="mon-note">
        참여/1k = 팔로워 1,000명당 평균 반응(좋아요+댓글) — 규모가 다른 계정 간 비교 기준 · {IG.note}
      </div>
    </>
  )
}

function AccountTable({ list, prev = null }) {
  return (
    <div className="mon-scroll">
      <table className="mon-table">
        <thead>
          <tr>
            <th>계정</th><th>팔로워</th><th>30일 게시</th><th>평균 좋아요</th>
            <th>평균 댓글</th><th>참여/1k</th><th>릴스 비중</th><th>최근 게시</th>
          </tr>
        </thead>
        <tbody>
          {list.map(a => (
            <tr key={a.handle} className={a.dormant ? 'dormant' : ''}>
              <td className="mon-acc">
                <b>{a.name}</b>
                <a href={a.profileUrl} target="_blank" rel="noreferrer">@{a.handle}</a>
                {a.dormant && <span className="mon-flag">휴면</span>}
              </td>
              <td className="strong">
                {num(a.followers)}
                {prev?.[a.handle]?.f != null && a.followers != null && <Delta d={a.followers - prev[a.handle].f} />}
              </td>
              <td>{num(a.postsLast30)}</td>
              <td>{a.likesVisible === 0 ? <span className="mute">비공개</span> : num(a.avgLikes)}</td>
              <td>{num(a.avgComments)}</td>
              <td>{a.engagementPer1k ?? '—'}</td>
              <td>{a.reelsShare != null ? a.reelsShare + '%' : '—'}</td>
              <td className="mute">{a.daysSinceLastPost != null ? `${a.daysSinceLastPost}일 전` : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function YoutubeView() {
  const [chFilter, setChFilter] = useState('전체')
  const main = YT.channels.find(c => c.isMain)
  const prev = prevSnapshot((YT.generatedAt || '').slice(0, 10))?.yt || null
  const chName = key => YT.channels.find(c => c.key === key)?.name || key

  const videos = useMemo(() => {
    const list = chFilter === '전체' ? YT.videos : YT.videos.filter(v => v.channel === chFilter)
    return [...list].sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, 20)
  }, [chFilter])

  return (
    <>
      <Hero stats={[
        { label: '대표채널 구독자', value: compact(main?.subscribers), sub: main?.name },
        { label: '운영 채널', value: YT.channels.length, unit: '개' },
        { label: '대표채널 총 조회', value: compact(main?.totalViews), sub: `영상 ${num(main?.totalVideos)}개` },
        { label: '평균 조회 (대표)', value: compact(main?.avgViews), sub: '최근 수집분' },
      ]} />

      <div className="group-label">채널 지표</div>
      <div className="mon-scroll">
        <table className="mon-table">
          <thead>
            <tr>
              <th>채널</th><th>구독자</th><th>총 영상</th><th>평균 조회</th>
              <th>롱폼 평균</th><th>쇼츠 평균</th><th>조회/1k구독</th><th>최대 조회</th>
            </tr>
          </thead>
          <tbody>
            {[...YT.channels].sort((a, b) => b.subscribers - a.subscribers).map(c => (
              <tr key={c.key}>
                <td className="mon-acc">
                  <b>{c.name}</b>
                  <a href={c.url} target="_blank" rel="noreferrer">{c.channelName}</a>
                </td>
                <td className="strong">
                  {num(c.subscribers)}
                  {prev?.[c.key]?.s != null && c.subscribers != null && <Delta d={c.subscribers - prev[c.key].s} />}
                </td>
                <td>{num(c.totalVideos)}</td>
                <td>{num(c.avgViews)}</td>
                <td>{num(c.avgViewsVideo)}</td>
                <td>{num(c.avgViewsShorts)}</td>
                <td>{num(c.viewsPer1kSubs)}</td>
                <td>{num(c.maxViews)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="group-label">조회수 상위 영상 (최근 수집분)</div>
      <div className="filters">
        {['전체', ...YT.channels.map(c => c.key)].map(k => (
          <button key={k} className={k === chFilter ? 'on' : ''} onClick={() => setChFilter(k)}>
            {k === '전체' ? '전체' : chName(k)}
          </button>
        ))}
      </div>
      <div className="mon-scroll">
        <table className="mon-table">
          <thead>
            <tr><th>제목</th><th>채널</th><th>유형</th><th>조회수</th><th>길이</th><th>게시</th></tr>
          </thead>
          <tbody>
            {videos.map((v, i) => (
              <tr key={v.url + i}>
                <td className="mon-title"><a href={v.url} target="_blank" rel="noreferrer">{v.title}</a></td>
                <td className="mute">{chName(v.channel)}</td>
                <td>{v.type === 'Shorts' ? '쇼츠' : '롱폼'}</td>
                <td className="strong">{num(v.views)}</td>
                <td className="mute">{v.duration || '—'}</td>
                <td className="mute">{koDate(v.date)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mon-note">{YT.note}</div>
    </>
  )
}

/* ── UGC — 고객·인플루언서 게시물 동향 ('26.7) ──────────────────
   데이터: src/data/sns/ugc.js (해시태그 수집 + Claude 감정·주제 분석)
   첫 수집 전(UGC=null)에는 세그먼트 자체가 숨겨짐. 감정·요약은 분석이
   있을 때만 노출 (ANTHROPIC_API_KEY 미설정 시 정량 지표만) */
function UgcView() {
  const positiveShare = UGC.sentiment
    ? Math.round(UGC.sentiment['긍정'] / Math.max(1, UGC.sentiment['긍정'] + UGC.sentiment['중립'] + UGC.sentiment['부정']) * 100)
    : null

  return (
    <>
      <Hero stats={[
        { label: '한 달 게시물', value: num(UGC.totalPosts), unit: '건', sub: UGC.tags.map(t => '#' + t).join(' ') },
        { label: '반응 합계', value: compact(UGC.totalEngagement), sub: '좋아요+댓글' },
        positiveShare != null
          ? { label: '긍정 비율', value: positiveShare, unit: '%', sub: `부정 ${UGC.sentiment['부정']}건` }
          : { label: '광고·협찬', value: num(UGC.adPosts), unit: '건' },
        { label: '인플루언서 게시물', value: num(UGC.influencerPosts), unit: '건', sub: '팔로워 1만+' },
      ]} />

      {UGC.summary?.length > 0 && (
        <div className="mon-hl">
          <div className="group-label">동향 요약</div>
          {UGC.summary.map((s, i) => (
            <div key={i} className="mon-hl-row"><span className="hl-mark">·</span><span>{s}</span></div>
          ))}
        </div>
      )}

      {(UGC.sentiment || UGC.topics?.length > 0) && (
        <>
          <div className="group-label">감정 · 주제 분포</div>
          <div className="mon-scroll">
            <table className="mon-table">
              <thead><tr><th>구분</th><th>건수</th><th>비중</th></tr></thead>
              <tbody>
                {UGC.sentiment && ['긍정', '중립', '부정'].map(k => {
                  const total = UGC.sentiment['긍정'] + UGC.sentiment['중립'] + UGC.sentiment['부정']
                  return (
                    <tr key={k}>
                      <td className="mon-acc"><b>{k}</b></td>
                      <td className="strong">{num(UGC.sentiment[k])}</td>
                      <td className="mute">{total ? Math.round(UGC.sentiment[k] / total * 100) + '%' : '—'}</td>
                    </tr>
                  )
                })}
                {(UGC.topics || []).map(t => (
                  <tr key={t.name}>
                    <td className="mon-acc mute">{t.name}</td>
                    <td>{num(t.count)}</td>
                    <td className="mute">{UGC.totalPosts ? Math.round(t.count / UGC.totalPosts * 100) + '%' : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div className="group-label">반응 상위 게시물</div>
      <div className="mon-scroll">
        <table className="mon-table">
          <thead>
            <tr><th>게시물</th><th>작성자</th><th>팔로워</th><th>좋아요</th><th>댓글</th>{UGC.sentiment && <th>감정</th>}<th>게시</th></tr>
          </thead>
          <tbody>
            {(UGC.topPosts || []).map((p, i) => (
              <tr key={p.url + i}>
                <td className="mon-title">
                  <a href={p.url} target="_blank" rel="noreferrer">{p.caption || '(캡션 없음)'}</a>
                  {p.isAd && <span className="mon-flag">광고·협찬</span>}
                </td>
                <td className="mute">@{p.owner}</td>
                <td>{p.followers != null ? compact(p.followers) : '—'}</td>
                <td className="strong">{p.likes === null ? <span className="mute">비공개</span> : num(p.likes)}</td>
                <td>{num(p.comments)}</td>
                {UGC.sentiment && <td className="mute">{p.sentiment || '—'}</td>}
                <td className="mute">{fmtDate(p.ts)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="group-label">주요 작성자 (반응 순)</div>
      <div className="mon-scroll">
        <table className="mon-table">
          <thead><tr><th>작성자</th><th>팔로워</th><th>게시물</th><th>반응 합계</th></tr></thead>
          <tbody>
            {(UGC.creators || []).map(c => (
              <tr key={c.owner}>
                <td className="mon-acc">
                  <a href={`https://www.instagram.com/${c.owner}/`} target="_blank" rel="noreferrer">@{c.owner}</a>
                  {c.influencer && <span className="mon-flag">인플루언서</span>}
                </td>
                <td className="strong">{c.followers != null ? num(c.followers) : '—'}</td>
                <td>{num(c.posts)}</td>
                <td>{num(c.engagement)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mon-note">{UGC.note}</div>
    </>
  )
}

/* ── 타겟APP — 캠페인 실적 (수기 입력, '26.7) ──────────────────
   데이터: Supabase targetapp_stats(캠페인 행)·targetapp_media(매체별 누적 스냅샷) —
   내부 전용(RLS: 로그인 계정만, anon 정책 없음 → 미러에서 접근 불가).
   API 자동 연동이 없어 매월 초 전월 실적을 수기 입력 (입력 폼은 어드민 2차) */
function TargetAppView() {
  const [data, setData] = useState(undefined)   // undefined=로딩 · null=미설정/빈 데이터
  const [monFilter, setMonFilter] = useState('전체')
  useEffect(() => { listTargetApp().then(setData) }, [])

  if (data === undefined) return <div className="empty">불러오는 중…</div>
  if (!data) return (
    <div className="mon-note">
      타겟APP 실적 데이터가 아직 없습니다 — Supabase SQL Editor에서 <b>data/targetapp-seed.sql</b>을
      1회 실행하면 '26.1~4월 이관분(캠페인 50건 + 매체별 누적 10종)이 채워집니다
      (절차: data/supabase-setup.md 7장). 이후 매월 실적은 어드민에서 입력 예정.
    </div>
  )

  const { rows, media } = data
  const total = k => rows.reduce((a, r) => a + (r[k] || 0), 0)
  const ctr = (clk, exp) => (exp ? (clk / exp * 100).toFixed(2) + '%' : '—')
  const offices = [...new Set(rows.map(r => r.office))]
  const monthKeys = [...new Set(rows.map(r => `${r.year}.${r.month}`))]
  const byMonth = monthKeys.map(k => {
    const list = rows.filter(r => `${r.year}.${r.month}` === k)
    const t = kk => list.reduce((a, r) => a + (r[kk] || 0), 0)
    return { k, cnt: list.length, exp: t('exp'), clk: t('clk'), vis: t('vis'), inst: t('inst') }
  })
  const filtered = monFilter === '전체' ? rows : rows.filter(r => `${r.year}.${r.month}` === monFilter)
  const offGroups = offices
    .map(o => ({ o, list: filtered.filter(r => r.office === o), cnt: rows.filter(r => r.office === o).length }))
    .filter(g => g.list.length > 0)
    .sort((a, b) => b.cnt - a.cnt || a.o.localeCompare(b.o))
  const mediaByName = Object.fromEntries(media.map(m => [m.name, m]))

  return (
    <>
      <Hero stats={[
        { label: '캠페인', value: num(rows.length), unit: '건', sub: "'26.1월~ 누적" },
        { label: '총 노출', value: compact(total('exp')), sub: `클릭 ${compact(total('clk'))} · 클릭율 ${ctr(total('clk'), total('exp'))}` },
        { label: '총 방문', value: num(total('vis')), unit: '명' },
        { label: '앱설치', value: num(total('inst')), unit: '건', sub: `사업소·행사 ${offices.length}개 단위` },
      ]} />

      <div className="group-label">월별 추이</div>
      <div className="mon-scroll">
        <table className="mon-table">
          <thead><tr><th>월</th><th>캠페인</th><th>노출</th><th>클릭</th><th>클릭율</th><th>방문</th><th>앱설치</th></tr></thead>
          <tbody>
            {byMonth.map(m => (
              <tr key={m.k}>
                <td className="mon-acc">{m.k}월</td>
                <td>{m.cnt}건</td>
                <td>{compact(m.exp)}</td>
                <td>{compact(m.clk)}</td>
                <td className="mute">{ctr(m.clk, m.exp)}</td>
                <td>{num(m.vis)}</td>
                <td className="strong">{num(m.inst)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {media.length > 0 && (
        <>
          <div className="group-label">매체별 누적 <small className="ta-basis">{media[0]?.basis}</small></div>
          <div className="mon-scroll">
            <table className="mon-table">
              <thead><tr><th>구분</th><th>매체</th><th>역할</th><th>노출</th><th>클릭</th><th>클릭율</th><th>방문</th><th>앱설치</th><th>캠페인</th></tr></thead>
              <tbody>
                {TA_GROUPS.flatMap(g => g.media.map(name => {
                  const m = mediaByName[name]
                  if (!m) return null
                  return (
                    <tr key={name}>
                      <td className="mute">{g.g}</td>
                      <td className="mon-acc">{m.name}</td>
                      <td className="mute">{m.role}</td>
                      <td>{compact(m.exp)}</td>
                      <td>{compact(m.clk)}</td>
                      <td className="mute">{ctr(m.clk, m.exp)}</td>
                      <td>{num(m.vis)}</td>
                      <td className="strong">{num(m.inst)}</td>
                      <td className="mute">{m.cam}건</td>
                    </tr>
                  )
                })).filter(Boolean)}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div className="group-label">사업소별 캠페인</div>
      <div className="filters">
        {['전체', ...monthKeys].map(k => (
          <button key={k} className={k === monFilter ? 'on' : ''} onClick={() => setMonFilter(k)}>
            {k === '전체' ? `전체 (${rows.length}건)` : `${k.split('.')[1]}월`}
          </button>
        ))}
      </div>
      {offGroups.map(g => (
        <details className="ta-office" key={g.o}>
          <summary>
            <span className="ta-name">{g.o}</span>
            <span className="ta-cnt">{g.cnt}회 집행</span>
            <span className="ta-sum">노출 {compact(g.list.reduce((a, r) => a + r.exp, 0))} · 설치 {num(g.list.reduce((a, r) => a + r.inst, 0))}</span>
          </summary>
          <div className="mon-scroll">
            <table className="mon-table">
              <thead><tr><th>월</th><th>캠페인</th><th>기간</th><th>매체</th><th>노출</th><th>클릭</th><th>클릭율</th><th>방문</th><th>앱설치</th></tr></thead>
              <tbody>
                {g.list.map(r => (
                  <tr key={r.id}>
                    <td className="mute">{r.month}월</td>
                    <td className="mon-acc">{r.name}</td>
                    <td className="mute">{r.period}</td>
                    <td className="mute">{(r.media || []).join('·')}</td>
                    <td>{compact(r.exp)}</td>
                    <td>{compact(r.clk)}</td>
                    <td className="mute">{ctr(r.clk, r.exp)}</td>
                    <td>{num(r.vis)}</td>
                    <td className="strong">{num(r.inst)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {[...new Set(g.list.map(r => r.note).filter(Boolean))].map((n, i) => (
            <div className="ta-note" key={i}>{n}</div>
          ))}
        </details>
      ))}

      <div className="mon-note">
        랜딩이 자사 페이지가 아니면(네이버 예약 등 외부 랜딩) 방문·앱설치가 자사 트래킹에
        집계되지 않음 — 방문 0 건은 대부분 이 경우. 신규 실적은 매월 초 전월분 수기 입력
      </div>
    </>
  )
}

export default function MonitorPage() {
  const [platform, setPlatform] = useState('instagram')
  const generatedAt =
    platform === 'instagram' ? IG.generatedAt : platform === 'youtube' ? YT.generatedAt : UGC?.generatedAt

  const segments = [['instagram', '인스타그램'], ['youtube', '유튜브'], ...(UGC ? [['ugc', 'UGC']] : []), ['targetapp', '타겟APP']]

  return (
    <div className="wrap cal-wrap">
      <header>
        <div className="eyebrow">Media Content Team · Media Monitor</div>
        <h1>매체 모니터링</h1>
        <div className="masthead-sub">
          {platform === 'targetapp'
            ? '타겟형 매체 캠페인 실적 — 수기 입력 (매월 갱신, 팀 내부 전용)'
            : `자사 인스타그램·유튜브 계정 성과 지표 — 데이터 기준 ${fmtDate(generatedAt)}`}
        </div>
      </header>

      <Highlights />

      <div className="cal-controls">
        <div className="seg">
          {segments.map(([k, label]) => (
            <button key={k} className={platform === k ? 'on' : ''} onClick={() => setPlatform(k)}>{label}</button>
          ))}
        </div>
      </div>

      {platform === 'instagram' ? <InstagramView />
        : platform === 'youtube' ? <YoutubeView />
        : platform === 'targetapp' ? <TargetAppView />
        : <UgcView />}
    </div>
  )
}
