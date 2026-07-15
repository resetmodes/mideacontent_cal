/* UGC 정제·분석 ('26.7)
   data/sns-raw/ugc/*.json → src/data/sns/ugc.js (ES 모듈)

   사용법: node scripts/sns/clean-ugc.mjs

   단계
   ① 태그별 raw 통합 → 중복 제거(같은 게시물이 여러 태그에 걸림) → 자사·경쟁사 계정 제외
      → 최근 1개월 필터 → 광고·협찬 플래그(#광고·#협찬 등)
   ② 작성자 프로필(_profiles.json)로 팔로워 수 병합 → 인플루언서 판정
   ③ Claude로 게시물별 감정(긍정/중립/부정)·주제 분류 + 주간 동향 요약
      — ANTHROPIC_API_KEY 없거나 SDK 미설치면 이 단계만 건너뜀 (정량 지표는 저장)
   가드: 실수집 0건이면 기존 ugc.js 보존, 저장 스킵 ('26.7 사고 교훈 — 빈 덮어쓰기 방지) */

import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { IG_ACCOUNTS, IG_COMPETITORS } from './accounts.mjs'
import {
  UGC_TAGS, INFLUENCER_MIN_FOLLOWERS, ANALYZE_MODEL, ANALYZE_CAP, UGC_TOPICS,
} from './ugc-config.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..', '..')
const RAW_DIR = process.env.SNS_RAW_DIR || join(ROOT, 'data', 'sns-raw', 'ugc')
const OUT_DIR = process.env.SNS_OUT_DIR || join(ROOT, 'src', 'data', 'sns')
const OUT = join(OUT_DIR, 'ugc.js')

try { process.loadEnvFile(join(ROOT, '.env')) } catch { /* CI에선 환경변수 사용 */ }

const OWN = new Set([...IG_ACCOUNTS, ...IG_COMPETITORS].map(a => a.handle.toLowerCase()))
/* \b는 한글 뒤에서 동작 안 함(JS \w=ASCII) — 한글 키워드는 경계 없이, 영문만 \b */
const AD_RE = /#\s*(광고|협찬|유료광고|제공)|#(ad|sponsored)\b/i
const DAY = 86400000
const CUTOFF_TS = Date.now() - 30 * DAY
const CUTOFF_DATE = new Date(CUTOFF_TS).toISOString().slice(0, 10)

/* ── ① raw 통합·정제 ─────────────────────────────────────────── */
async function loadPosts() {
  let files = []
  try { files = await readdir(RAW_DIR) } catch { return { posts: [], freshTags: 0 } }
  const seen = new Set()
  const posts = []
  let freshTags = 0
  for (const f of files) {
    if (!f.endsWith('.json') || f.startsWith('_')) continue
    let items
    try { items = JSON.parse(await readFile(join(RAW_DIR, f), 'utf8')) } catch { continue }
    if (!Array.isArray(items) || items[0]?.error) continue
    freshTags++
    for (const p of items) {
      const url = p.url || (p.shortCode ? `https://www.instagram.com/p/${p.shortCode}/` : null)
      if (!url || seen.has(url)) continue
      seen.add(url)
      const owner = (p.ownerUsername || '').toLowerCase()
      if (!owner || OWN.has(owner)) continue
      const ts = new Date(p.timestamp).getTime()
      if (isNaN(ts) || ts < CUTOFF_TS) continue
      const caption = (p.caption || '').replace(/\s+/g, ' ').trim()
      posts.push({
        url, owner, ts: p.timestamp,
        caption: caption.slice(0, 300),
        likes: p.likesCount === -1 ? null : (p.likesCount ?? null),
        comments: p.commentsCount ?? 0,
        engagement: (p.likesCount > 0 ? p.likesCount : 0) + (p.commentsCount || 0),
        isAd: AD_RE.test(caption),
      })
    }
  }
  return { posts, freshTags }
}

async function loadProfiles() {
  try {
    const items = JSON.parse(await readFile(join(RAW_DIR, '_profiles.json'), 'utf8'))
    return new Map(items
      .filter(p => p.username && p.followersCount != null)
      .map(p => [p.username.toLowerCase(), p.followersCount]))
  } catch { return new Map() }
}

/* ── ③ Claude 분석 — 키·SDK 없으면 null 반환 (화면은 해당 섹션 숨김) ── */
async function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('⚠ ANTHROPIC_API_KEY 없음 — 감정·주제·요약 없이 정량 지표만 저장')
    return null
  }
  try {
    const { default: Anthropic } = await import('@anthropic-ai/sdk')
    return new Anthropic()
  } catch {
    console.warn('⚠ @anthropic-ai/sdk 미설치 (npm install) — 감정·주제·요약 생략')
    return null
  }
}

const CLASSIFY_SCHEMA = {
  type: 'object',
  properties: {
    results: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          i: { type: 'integer' },
          sentiment: { type: 'string', enum: ['긍정', '중립', '부정'] },
          topic: { type: 'string', enum: UGC_TOPICS },
        },
        required: ['i', 'sentiment', 'topic'],
        additionalProperties: false,
      },
    },
  },
  required: ['results'],
  additionalProperties: false,
}

const parseJson = res => {
  const text = res.content.find(b => b.type === 'text')?.text || ''
  return JSON.parse(text)
}

async function classifyPosts(client, posts) {
  const targets = [...posts].sort((a, b) => b.engagement - a.engagement).slice(0, ANALYZE_CAP)
  const CHUNK = 40
  for (let off = 0; off < targets.length; off += CHUNK) {
    const chunk = targets.slice(off, off + CHUNK)
    const lines = chunk.map((p, i) => `${i}\t${p.caption || '(캡션 없음)'}`).join('\n')
    try {
      const res = await client.messages.create({
        model: ANALYZE_MODEL,
        max_tokens: 16000,
        system: '너는 현대백화점 미디어콘텐츠팀의 SNS 분석가다. 고객이 현대백화점 관련 해시태그로 올린 인스타그램 게시물 캡션을 분류한다. 감정은 방문 경험·브랜드에 대한 톤 기준(단순 정보 나열은 중립). 주제는 캡션이 주로 다루는 것 하나만 고른다.',
        messages: [{
          role: 'user',
          content: `다음 게시물 캡션들을 분류하라. 각 줄은 "번호<TAB>캡션"이다. 모든 번호에 대해 결과를 반환하라.\n\n${lines}`,
        }],
        output_config: { format: { type: 'json_schema', schema: CLASSIFY_SCHEMA } },
      })
      for (const r of parseJson(res).results || []) {
        const p = chunk[r.i]
        if (p) { p.sentiment = r.sentiment; p.topic = r.topic }
      }
      console.log(`  · 분류 ${Math.min(off + CHUNK, targets.length)}/${targets.length}`)
    } catch (e) {
      console.error(`  ❌ 분류 청크 실패 (${off}~): ${e.message} — 해당 분량은 미분석으로 유지`)
    }
  }
  return targets.some(p => p.sentiment)
}

const SUMMARY_SCHEMA = {
  type: 'object',
  properties: { bullets: { type: 'array', items: { type: 'string' } } },
  required: ['bullets'],
  additionalProperties: false,
}

async function summarize(client, posts, stats) {
  const top = [...posts].sort((a, b) => b.engagement - a.engagement).slice(0, 40)
    .map(p => `[${p.sentiment || '?'}/${p.topic || '?'}] ${p.caption.slice(0, 120)}`).join('\n')
  try {
    const res = await client.messages.create({
      model: ANALYZE_MODEL,
      max_tokens: 16000,
      thinking: { type: 'adaptive' },
      system: '너는 현대백화점 미디어콘텐츠팀의 SNS 분석가다. 팀 내부 브리핑용으로, 과장 없이 데이터에 근거해 쓴다.',
      messages: [{
        role: 'user',
        content: `최근 1개월 현대백화점 관련 UGC(고객 게시물) 동향을 3~5개 불릿으로 요약하라. 각 불릿은 한 문장, 한국어. 눈에 띄는 주제·감정 흐름·반복 언급 지점 중심으로.\n\n집계: ${JSON.stringify(stats)}\n\n반응 상위 게시물:\n${top}`,
      }],
      output_config: { format: { type: 'json_schema', schema: SUMMARY_SCHEMA } },
    })
    return parseJson(res).bullets?.slice(0, 5) || null
  } catch (e) {
    console.error(`  ❌ 동향 요약 실패: ${e.message}`)
    return null
  }
}

/* ── main ─────────────────────────────────────────────────────── */
async function main() {
  const { posts, freshTags } = await loadPosts()

  /* 빈 결과 가드 — 실수집 0건이면 기존 파일 보존 (한도 초과·수집 실패 시 데이터 소실 방지) */
  if (freshTags === 0 || posts.length === 0) {
    console.error('❌ UGC 실수집 0건 — 기존 ugc.js를 보존하고 저장을 건너뜀 (Apify 한도·토큰 확인)')
    return
  }

  const profiles = await loadProfiles()
  for (const p of posts) p.followers = profiles.get(p.owner) ?? null

  /* 작성자 집계 — 반응 순 상위 */
  const creatorMap = new Map()
  for (const p of posts) {
    const c = creatorMap.get(p.owner) || { owner: p.owner, posts: 0, engagement: 0 }
    c.posts++; c.engagement += p.engagement
    creatorMap.set(p.owner, c)
  }
  const creators = [...creatorMap.values()]
    .map(c => ({
      ...c,
      followers: profiles.get(c.owner) ?? null,
      influencer: (profiles.get(c.owner) ?? 0) >= INFLUENCER_MIN_FOLLOWERS,
    }))
    .sort((a, b) => b.engagement - a.engagement)
    .slice(0, 20)

  /* Claude 분석 (선택) */
  const client = await getClient()
  let sentiment = null, topics = null, summary = null
  if (client) {
    console.log(`▶ Claude 분석 (${ANALYZE_MODEL}) — 게시물 ${Math.min(posts.length, ANALYZE_CAP)}건…`)
    const ok = await classifyPosts(client, posts)
    if (ok) {
      const analyzed = posts.filter(p => p.sentiment)
      sentiment = { 긍정: 0, 중립: 0, 부정: 0 }
      const topicCount = {}
      for (const p of analyzed) {
        sentiment[p.sentiment]++
        topicCount[p.topic] = (topicCount[p.topic] || 0) + 1
      }
      topics = UGC_TOPICS.map(name => ({ name, count: topicCount[name] || 0 })).filter(t => t.count > 0)
      summary = await summarize(client, analyzed, {
        총게시물: posts.length, 분석: analyzed.length, 감정: sentiment,
        주제: Object.fromEntries(topics.map(t => [t.name, t.count])),
      })
    }
  }

  const topPosts = [...posts].sort((a, b) => b.engagement - a.engagement).slice(0, 30)
    .map(p => ({
      ts: p.ts, owner: p.owner, followers: p.followers, url: p.url,
      caption: p.caption.slice(0, 120), likes: p.likes, comments: p.comments,
      sentiment: p.sentiment || null, topic: p.topic || null, isAd: p.isAd,
    }))

  const output = {
    source: 'apify/instagram-scraper (hashtags) + claude',
    generatedAt: new Date().toISOString(),
    windowSince: CUTOFF_DATE,
    tags: UGC_TAGS,
    totalPosts: posts.length,
    totalEngagement: posts.reduce((s, p) => s + p.engagement, 0),
    adPosts: posts.filter(p => p.isAd).length,
    influencerPosts: posts.filter(p => (p.followers ?? 0) >= INFLUENCER_MIN_FOLLOWERS).length,
    sentiment, topics, summary,
    topPosts, creators,
    note: `추적 태그 ${UGC_TAGS.map(t => '#' + t).join(' ')} · 최근 1개월(${CUTOFF_DATE} 이후) · 자사·경쟁사 계정 게시물 제외 · 팔로워는 반응 상위 작성자만 조회`,
  }

  await mkdir(OUT_DIR, { recursive: true })
  await writeFile(OUT, '/* 자동 생성 — scripts/sns/clean-ugc.mjs 로 갱신. 직접 수정 금지 */\nexport const UGC = ' + JSON.stringify(output, null, 1) + '\n', 'utf8')
  console.log(`✅ src/data/sns/ugc.js — 게시물 ${posts.length}건 · 작성자 ${creatorMap.size}명${sentiment ? ' · 감정 분석 포함' : ' · 정량만'}`)
}

main()
