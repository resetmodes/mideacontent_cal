import React, { useState, useMemo } from 'react'
import { IG } from './data/sns/instagram.js'
import { YT } from './data/sns/youtube.js'

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

const IG_GROUP_ORDER = ['본사', '사업소', '콘텐츠·IP', '해외']

function InstagramView() {
  const main = IG.accounts.find(a => a.isMain)
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
          <AccountTable list={g.list} />
        </div>
      ))}

      {competitors.length > 0 && (
        <div>
          <div className="group-label">경쟁사 (참고)</div>
          <AccountTable list={[...competitors].sort((a, b) => b.followers - a.followers)} />
        </div>
      )}

      <div className="mon-note">
        참여/1k = 팔로워 1,000명당 평균 반응(좋아요+댓글) — 규모가 다른 계정 간 비교 기준 · {IG.note}
      </div>
    </>
  )
}

function AccountTable({ list }) {
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
              <td className="strong">{num(a.followers)}</td>
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
                <td className="strong">{num(c.subscribers)}</td>
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

export default function MonitorPage() {
  const [platform, setPlatform] = useState('instagram')
  const generatedAt = platform === 'instagram' ? IG.generatedAt : YT.generatedAt

  return (
    <div className="wrap cal-wrap">
      <header>
        <div className="eyebrow">Media Content Team · SNS Monitor</div>
        <h1>SNS 모니터링</h1>
        <div className="masthead-sub">
          자사 인스타그램·유튜브 계정 성과 지표 — 데이터 기준 {fmtDate(generatedAt)}
          {' · '}매주 월 09:00 자동 수집 (수동: GitHub Actions → Run workflow, 로컬: <code>npm run sns:collect</code>)
        </div>
      </header>

      <div className="cal-controls">
        <div className="seg">
          {[['instagram', '인스타그램'], ['youtube', '유튜브']].map(([k, label]) => (
            <button key={k} className={platform === k ? 'on' : ''} onClick={() => setPlatform(k)}>{label}</button>
          ))}
        </div>
      </div>

      {platform === 'instagram' ? <InstagramView /> : <YoutubeView />}
    </div>
  )
}
