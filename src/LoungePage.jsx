/* 미디어 바이럴 라운지 ('26.8) — 타 팀이 자사 매체 광고, 바이럴을 신청하는 창구
   세그 2개: 신청 접수(폼) + 접수 관리(팀 관리함)
   - 1차는 어드민 게이트 뒤 비공개 — 팀즈로 들어온 신청을 팀이 대신 입력하며 항목 검증,
     안정되면 신청 폼을 미러(무로그인)에 공개 (LoungeForm export가 그 대비)
   - 백화점APP은 구좌 4종 상세 폼 — "APP 광고 가이드"의 규격, 글자수, 리드타임 3단,
     이동페이지 규칙을 폼이 강제한다 (가이드를 읽지 않아도 준수되게)
   - 계획안 등 기밀 문서와 푸시 타겟 고객번호 파일은 시스템에 받지 않음 — 보유 체크만,
     담당자 배정 후 팀즈 개별 공유 ('26.7 사용자 확정)
   - 관리함 "확정" = 매체 캘린더 자동 등록 (아젠다명이 캠페인 태그로) */
import React, { useEffect, useMemo, useState } from 'react'
import {
  LOUNGE_MEDIA, RECOMMEND_ID, SELL_POINTS, GOALS, READY_STATES, readyById,
  APP_SLOTS, appSlotById, PUSH_TYPES, LANDING_KINDS, APP_MENUS,
  AUDIENCE_KINDS, CARD_GRADES, EXCEL_NOTE, DEFAULT_OWNERS,
  LOUNGE_STATUS, STATUS_REJECT,
  TARGET_APPS, targetSpec, maxTargetLead, targetCaution, parseSize,
  leadCheck, bizDeadline, fmtKday, handoffPlan,
  hasEmoji, overLines, ratioOff, isoOf, transferText,
} from './data/lounge.js'
import {
  listRequests, createRequest, updateRequest, deleteRequest,
  uploadLoungeSource, loungeSourceUrl, listBoard,
} from './lib/loungeStore.js'
import { MIRROR_URL } from './config.js'
import { createEvent } from './lib/store.js'
import { TEAM } from './data/team.js'
import { toast } from './lib/toast.js'
import { copyText } from './lib/clipboard.js'

const fmtMd = iso => (iso ? `${+iso.slice(5, 7)}/${+iso.slice(8, 10)}` : '')

/* ═══════════════ 신청 폼 ═══════════════ */
const EMPTY = {
  dept: '', name: '', email: '', agenda: '',
  sellPoints: [], sellNote: '', goal: '',
  media: [], recommend: false, appSlot: '', targetApps: [],
  eventStart: '', eventEnd: '', wishDate: '', wishEnd: '', wishTime: '',
  ready: 'done', branches: '',
  title: '', body: '', pushType: '', adKind: '광고',
  landingKind: '', prismNo: '', prismBranch: '', prismCat: '', prismApproved: false,
  appMenu: '', landingUrl: '',
  audienceKind: '', cardGrades: [],
  sources: [], sourceLink: '', sourceLater: false, hasPlan: false,
}

export function LoungeForm({ todayCount, onDone }) {
  const [f, setF] = useState(EMPTY)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(null)          // 접수 완료 { reqNo }
  const [preview, setPreview] = useState(null)    // { url, w, h }
  const set = patch => setF(v => ({ ...v, ...patch }))

  const slot = f.media.includes('백화점APP') ? appSlotById(f.appSlot) : null
  const isPush = slot?.id === 'push'
  const isTarget = f.media.includes('타겟APP')
  const today = isoOf(new Date())
  /* 리드타임 — 구좌는 소재 준비 3단, 타겟APP은 선택 앱 중 최장 D-N (media.js 기준) */
  const tLead = isTarget && !slot ? maxTargetLead(f.targetApps) : null
  const lead = slot ? leadCheck(today, f.wishDate, f.ready)
    : tLead ? leadCheck(today, f.wishDate, null, tLead.need) : null
  const dueDate = lead && f.wishDate ? bizDeadline(f.wishDate, lead.need) : null
  const popupLong = slot?.maxDays && f.wishDate && f.wishEnd
    && (new Date(f.wishEnd) - new Date(f.wishDate)) / 86400000 + 1 > slot.maxDays

  /* 글자수, 이모지 검사 */
  const titleOver = slot?.title?.perLine ? overLines(f.title, slot.title.perLine) : []
  const titleLinesOver = slot?.title?.lines && f.title.split('\n').length > slot.title.lines
  const pushTitleOver = isPush && f.title.length > slot.push.titleMax
  const pushBodyTotal = isPush && f.body.replace(/\n/g, '').length > slot.push.bodyMax
  const pushBodyLines = isPush ? overLines(f.body, slot.push.bodyPerLine) : []
  const emojiBad = isPush && (hasEmoji(f.title) || hasEmoji(f.body))

  const toggleIn = (key, v) => set({ [key]: f[key].includes(v) ? f[key].filter(x => x !== v) : [...f[key], v] })
  const toggleMedia = id => {
    const media = f.media.includes(id) ? f.media.filter(x => x !== id) : [...f.media, id]
    set({
      media, recommend: false,
      appSlot: media.includes('백화점APP') ? f.appSlot : '',
      targetApps: media.includes('타겟APP') ? f.targetApps : [],
    })
  }

  /* 브랜드 소스 — 선택 즉시 업로드 + 우측 목업 미리보기 */
  const onFile = async e => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => setPreview({ url, w: img.naturalWidth, h: img.naturalHeight })
    img.src = url
    try {
      const meta = await uploadLoungeSource(file)
      set({ sources: [...f.sources, meta] })
      toast('브랜드 소스 업로드됨')
    } catch (err) { toast(err.message, { danger: true }) }
  }

  const missing = []
  if (!f.dept.trim()) missing.push('부서')
  if (!f.name.trim()) missing.push('이름')
  if (!f.email.trim()) missing.push('이메일')
  if (!f.agenda.trim()) missing.push('아젠다명')
  if (!f.media.length && !f.recommend) missing.push('희망 매체')
  if (f.media.includes('백화점APP') && !f.appSlot) missing.push('APP 구좌')
  if (!f.wishDate) missing.push('희망 게시일')
  if (slot && !f.branches.trim()) missing.push('노출 지점')
  if (slot?.title && !slot.title.adminOnly && !f.title.trim()) missing.push('제목')
  if (isPush) {
    if (!f.title.trim()) missing.push('푸시 제목')
    if (!f.body.trim()) missing.push('푸시 내용')
    if (!f.pushType) missing.push('푸시 유형')
    if (!f.wishTime) missing.push('발송 시간')
  }
  if (slot?.landing && !f.landingKind) missing.push('이동페이지')

  const submit = async () => {
    if (missing.length) { toast(`미입력 ${missing.join(', ')}`, { danger: true }); return }
    if (emojiBad) { toast('푸시 제목과 내용에는 이모지를 쓸 수 없습니다', { danger: true }); return }
    setBusy(true)
    try {
      const details = {}
      if (isTarget && f.targetApps.length) details.targetApps = f.targetApps
      if (slot) {
        Object.assign(details, {
          appSlot: slot.id, ready: f.ready, branches: f.branches,
          title: f.title || undefined, body: f.body || undefined,
          wishTime: f.wishTime || undefined,
          landingKind: f.landingKind || undefined,
          prismNo: f.prismNo || undefined, prismBranch: f.prismBranch || undefined,
          prismCat: f.prismCat || undefined, prismApproved: f.prismApproved || undefined,
          appMenu: f.appMenu || undefined, landingUrl: f.landingUrl || undefined,
          audienceKind: f.audienceKind || undefined,
          cardGrades: f.audienceKind === 'card' && f.cardGrades.length ? f.cardGrades : undefined,
          pushType: f.pushType || undefined, adKind: isPush ? f.adKind : undefined,
        })
      }
      const row = await createRequest({
        dept: f.dept.trim(), name: f.name.trim(), email: f.email.trim(), agenda: f.agenda.trim(),
        sellPoints: f.sellPoints, sellNote: f.sellNote.trim(), goal: f.goal,
        media: f.recommend ? [] : f.media,
        eventStart: f.eventStart, eventEnd: f.eventEnd,
        wishDate: f.wishDate, wishEnd: f.wishEnd,
        details, sources: f.sources, sourceLink: f.sourceLink.trim(),
        sourceLater: f.sourceLater, hasPlan: f.hasPlan,
      }, todayCount)
      setDone(row)
      onDone?.(row)
      window.scrollTo(0, 0)
    } catch (err) { toast(err.message, { danger: true }) } finally { setBusy(false) }
  }

  const plan = (f.media.length || f.recommend)
    ? handoffPlan({ ...f, appSlot: slot ? f.appSlot : '', targetApps: isTarget ? f.targetApps : [] })
    : null

  if (done) return (
    <div className="lg-done">
      <div className="lg-done-t">접수되었습니다</div>
      <div className="lg-done-no">{done.reqNo}</div>
      <p>담당자가 배정되면 팀즈로 연락드립니다, 보통 영업일 1일 이내입니다.</p>
      {plan && <HandoffGuide plan={plan} done />}
      <div className="lg-done-acts">
        <button className="lg-btn" onClick={async () => { if (await copyText(transferText(done))) toast('접수 내용이 복사됨') }}>접수 내용 복사</button>
        <button className="lg-btn" onClick={() => { setDone(null); setF(EMPTY); setPreview(null) }}>새 신청 작성</button>
      </div>
      <p className="lg-done-tip">복사한 내용을 팀즈에 보관해 두면 담당자와 소통할 때 그대로 쓸 수 있습니다</p>
    </div>
  )

  return (
    <div className="lg-cols">
      <div>
        <div className="lg-fld">
          <label>신청 부서, 담당자<em>*</em></label>
          <div className="lg-row3">
            <input type="text" placeholder="부서 또는 사업소" value={f.dept} onChange={e => set({ dept: e.target.value })} />
            <input type="text" placeholder="이름" value={f.name} onChange={e => set({ name: e.target.value })} />
            <input type="email" placeholder="사내 이메일" value={f.email} onChange={e => set({ email: e.target.value })} />
          </div>
        </div>

        <div className="lg-fld">
          <label>아젠다명<em>*</em><span className="lg-hint">행사나 브랜드 이름</span></label>
          <input type="text" placeholder="예 무역센터점 위스키 페어" value={f.agenda} onChange={e => set({ agenda: e.target.value })} />
        </div>

        <div className="lg-fld">
          <label>주요 소구점</label>
          <div className="lg-chips">
            {SELL_POINTS.map(s => (
              <button key={s} type="button" className={`lg-chip${f.sellPoints.includes(s) ? ' on' : ''}`}
                onClick={() => toggleIn('sellPoints', s)}>{s}</button>
            ))}
          </div>
          <input type="text" className="lg-mt" placeholder="한 줄 설명" value={f.sellNote} onChange={e => set({ sellNote: e.target.value })} />
        </div>

        <div className="lg-fld">
          <label>목적</label>
          <div className="lg-chips">
            {GOALS.map(g => (
              <button key={g} type="button" className={`lg-chip${f.goal === g ? ' on' : ''}`}
                onClick={() => set({ goal: f.goal === g ? '' : g })}>{g}</button>
            ))}
          </div>
        </div>

        <div className="lg-fld">
          <label>희망 매체<em>*</em><span className="lg-hint">고르면 우측에 게재 예시가 보입니다</span></label>
          <div className="lg-chips">
            {LOUNGE_MEDIA.map(m => (
              <button key={m.id} type="button" className={`lg-chip${f.media.includes(m.id) ? ' on' : ''}`}
                onClick={() => toggleMedia(m.id)}>{m.label}</button>
            ))}
            <button type="button" className={`lg-chip ghost${f.recommend ? ' on' : ''}`}
              onClick={() => set({ recommend: !f.recommend, media: [] })}>잘 모르겠어요, 추천 받고 싶어요</button>
          </div>
        </div>

        {f.media.includes('백화점APP') && (
          <div className="lg-fld">
            <label>APP 구좌<em>*</em><span className="lg-hint">구좌마다 규격과 문안 규칙이 다릅니다</span></label>
            <div className="lg-chips">
              {APP_SLOTS.map(s => (
                <button key={s.id} type="button" className={`lg-chip${f.appSlot === s.id ? ' on' : ''}`}
                  onClick={() => set({ appSlot: s.id })}>{s.name}</button>
              ))}
            </div>
          </div>
        )}

        {isTarget && (
          <div className="lg-fld">
            <label>타겟 앱 선택<span className="lg-hint">여러 앱 동시 집행 가능, 안 고르면 담당자가 목적에 맞게 제안</span></label>
            <div className="lg-chips">
              {TARGET_APPS.map(a => (
                <button key={a} type="button" className={`lg-chip${f.targetApps.includes(a) ? ' on' : ''}`}
                  onClick={() => toggleIn('targetApps', a)}>{a}</button>
              ))}
              <button type="button" className="lg-chip ghost"
                onClick={() => set({ targetApps: f.targetApps.length === TARGET_APPS.length ? [] : [...TARGET_APPS] })}>
                {f.targetApps.length === TARGET_APPS.length ? '전체 해제' : '전체 선택'}</button>
            </div>
            {f.targetApps.length > 0 && (
              <div className="lg-ta-rows">
                {f.targetApps.map(a => {
                  const sp = targetSpec(a)
                  const caution = targetCaution(a)
                  return (
                    <div className="lg-ta-row" key={a}>
                      <b>{a}</b>
                      {sp ? (<>
                        <span className="lg-ta-lead">{sp.lead.replace(' (영업일)', ' 영업일')}</span>
                        <span className="lg-ta-slots">{sp.slots.map(s => `${s.name} ${s.size}`).join(', ')}</span>
                        {caution && <span className="lg-ta-caution">{caution}</span>}
                      </>) : <span className="lg-ta-slots">스펙 미등록, 접수 후 담당자와 협의</span>}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        <div className="lg-fld">
          <label>일정<em>*</em></label>
          <div className="lg-row2">
            <div><span className="lg-minil">행사 시작</span><input type="date" value={f.eventStart} onChange={e => set({ eventStart: e.target.value })} /></div>
            <div><span className="lg-minil">행사 종료</span><input type="date" value={f.eventEnd} onChange={e => set({ eventEnd: e.target.value })} /></div>
          </div>
          <div className="lg-row3 lg-mt">
            <div><span className="lg-minil">희망 게시일</span><input type="date" value={f.wishDate} onChange={e => set({ wishDate: e.target.value })} /></div>
            <div><span className="lg-minil">게시 종료 (기간 노출)</span><input type="date" value={f.wishEnd} onChange={e => set({ wishEnd: e.target.value })} /></div>
            <div><span className="lg-minil">{isPush ? '발송 시간' : '게시 시간 (선택)'}</span><input type="time" value={f.wishTime} onChange={e => set({ wishTime: e.target.value })} /></div>
          </div>
          {popupLong && (
            <div className="lg-warn on">메인팝업은 매일 노출되어 피로감이 높은 구좌라 최대 1주 노출을 권장합니다. 기간이 이를 넘어 담당자와 협의가 필요합니다.</div>
          )}
          {tLead && lead && !lead.ok && (
            <div className="lg-warn on">선택한 앱 중 {tLead.from} 기준 게시 {lead.need}영업일 전까지 소재 전달이 필요합니다. 희망 게시일까지 영업일 {lead.left}일이라 일정 협의가 필요할 수 있습니다. 접수는 그대로 가능합니다.</div>
          )}
          {tLead && lead && lead.ok && (
            <div className="lg-ok">소재 전달 마감 {fmtKday(dueDate)}, {tLead.from} 기준 게시 {lead.need}영업일 전</div>
          )}
        </div>

        {slot && (
          <div className="lg-fld">
            <label>소재 준비 상태<em>*</em><span className="lg-hint">전달 마감이 달라집니다</span></label>
            <div className="lg-chips">
              {READY_STATES.map(r => (
                <button key={r.id} type="button" className={`lg-chip${f.ready === r.id ? ' on' : ''}`}
                  onClick={() => set({ ready: r.id })}>{r.label} +{r.lead}영업일</button>
              ))}
            </div>
            {lead && !lead.ok && (
              <div className="lg-warn on">이 구좌는 {readyById(f.ready).label} 기준 게시희망일 {lead.need}영업일 전까지 전달이 필요합니다. 희망 게시일까지 영업일 {lead.left}일이라 일정 협의가 필요할 수 있습니다. 접수는 그대로 가능합니다.</div>
            )}
            {lead && lead.ok && <div className="lg-ok">소재 전달 마감 {fmtKday(dueDate)}, 희망 게시일까지 영업일 {lead.left}일</div>}
          </div>
        )}

        {slot && (
          <div className="lg-fld">
            <label>노출 지점<em>*</em><span className="lg-hint">행사 진행 지점에 한함, 타 지점은 계획품의서 검토</span></label>
            <input type="text" placeholder="예 판교점, 부산점" value={f.branches} onChange={e => set({ branches: e.target.value })} />
          </div>
        )}

        {slot && !slot.title?.adminOnly && slot.title && (
          <div className="lg-fld">
            <label>제목<em>*</em><span className="lg-hint">{slot.title.note}</span></label>
            <textarea rows={2} placeholder={'예 영롱한 봄,\n3월의 럭셔리 뷰티'} value={f.title} onChange={e => set({ title: e.target.value })} />
            <div className={`lg-count${titleOver.length || titleLinesOver ? ' bad' : ''}`}>
              {f.title.split('\n').map(l => l.length).join('자, ')}자
              {titleOver.length > 0 && ` (${titleOver.join(', ')}줄이 ${slot.title.perLine}자 초과, 말줄임 처리됩니다)`}
              {titleLinesOver && ` (최대 ${slot.title.lines}줄)`}
            </div>
          </div>
        )}
        {slot?.title?.adminOnly && (
          <div className="lg-fld">
            <label>제목 (관리용)</label>
            <input type="text" placeholder="앱에 노출되지 않는 제목, 편하게 작성" value={f.title} onChange={e => set({ title: e.target.value })} />
          </div>
        )}

        {isPush && (
          <>
            <div className="lg-fld">
              <label>푸시 제목<em>*</em><span className="lg-hint">공백 포함 {slot.push.titleMax}자 이내, 이모지 불가</span></label>
              <input type="text" value={f.title} onChange={e => set({ title: e.target.value })} />
              <div className={`lg-count${pushTitleOver || hasEmoji(f.title) ? ' bad' : ''}`}>
                {f.title.length}자 / {slot.push.titleMax}자{hasEmoji(f.title) && ' (이모지는 쓸 수 없습니다)'}
              </div>
            </div>
            <div className="lg-fld">
              <label>푸시 내용<em>*</em><span className="lg-hint">공백 포함 {slot.push.bodyMax}자 이내, 한 줄당 {slot.push.bodyPerLine}자</span></label>
              <textarea rows={2} value={f.body} onChange={e => set({ body: e.target.value })} />
              <div className={`lg-count${pushBodyTotal || pushBodyLines.length || hasEmoji(f.body) ? ' bad' : ''}`}>
                {f.body.replace(/\n/g, '').length}자 / {slot.push.bodyMax}자
                {pushBodyLines.length > 0 && ` (${pushBodyLines.join(', ')}줄이 ${slot.push.bodyPerLine}자 초과)`}
                {hasEmoji(f.body) && ' (이모지는 쓸 수 없습니다)'}
              </div>
            </div>
            <div className="lg-fld">
              <label>푸시 유형<em>*</em></label>
              <div className="lg-row2">
                <select value={f.pushType} onChange={e => set({ pushType: e.target.value })}>
                  <option value="">유형 선택</option>
                  {PUSH_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
                <select value={f.adKind} onChange={e => set({ adKind: e.target.value })}>
                  <option value="광고">광고 (마케팅알림 동의 고객)</option>
                  <option value="정보">정보 (푸시알림 동의 고객)</option>
                </select>
              </div>
            </div>
          </>
        )}

        {slot?.landing && (
          <div className="lg-fld">
            <label>이동페이지<em>*</em><span className="lg-hint">클릭하면 어디로 갈지, 셋 중 하나</span></label>
            <div className="lg-chips">
              {LANDING_KINDS.map(k => (
                <button key={k.id} type="button" className={`lg-chip${f.landingKind === k.id ? ' on' : ''}`}
                  onClick={() => set({ landingKind: k.id })}>{k.label}</button>
              ))}
            </div>
            {f.landingKind === 'prism' && (
              <div className="lg-mt">
                <div className="lg-row3">
                  <input type="text" placeholder="행사카드 번호" value={f.prismNo} onChange={e => set({ prismNo: e.target.value })} />
                  <input type="text" placeholder="카드 등록 지점 (본사 등)" value={f.prismBranch} onChange={e => set({ prismBranch: e.target.value })} />
                  <input type="text" placeholder="카드 카테고리 (쇼핑뉴스 등)" value={f.prismCat} onChange={e => set({ prismCat: e.target.value })} />
                </div>
                <label className="lg-check"><input type="checkbox" checked={f.prismApproved} onChange={e => set({ prismApproved: e.target.checked })} />
                  <span>행사카드 승인 완료<span className="lg-check-d">미승인 상태에서는 광고 세팅이 불가합니다, 승인 후 전달해 주세요</span></span></label>
              </div>
            )}
            {f.landingKind === 'menu' && (
              <select className="lg-mt" value={f.appMenu} onChange={e => set({ appMenu: e.target.value })}>
                <option value="">이동할 APP 메뉴 선택</option>
                {APP_MENUS.map(m => <option key={m}>{m}</option>)}
              </select>
            )}
            {f.landingKind === 'url' && (
              <input type="url" className="lg-mt" placeholder="연결할 페이지 URL, 페이지 제작이 필요하면 소재 준비 상태를 페이지 제작으로"
                value={f.landingUrl} onChange={e => set({ landingUrl: e.target.value })} />
            )}
          </div>
        )}

        {slot?.audience && (
          <div className="lg-fld">
            <label>{isPush ? '발송 대상' : '노출 대상'}<span className="lg-hint">셋 중 하나</span></label>
            <div className="lg-chips">
              {AUDIENCE_KINDS.map(k => (
                <button key={k.id} type="button" className={`lg-chip${f.audienceKind === k.id ? ' on' : ''}`}
                  onClick={() => set({ audienceKind: f.audienceKind === k.id ? '' : k.id })}>{k.label}</button>
              ))}
            </div>
            {f.audienceKind === 'card' && (
              <div className="lg-chips lg-mt">
                {CARD_GRADES.map(g => (
                  <button key={g} type="button" className={`lg-chip sm${f.cardGrades.includes(g) ? ' on' : ''}`}
                    onClick={() => toggleIn('cardGrades', g)}>{g}</button>
                ))}
              </div>
            )}
            {f.audienceKind === 'excel' && <div className="lg-ok-note">{EXCEL_NOTE}</div>}
          </div>
        )}

        <div className="lg-fld">
          <label>브랜드 소스<span className="lg-hint">로고, 키비주얼 이미지, 영상은 링크로</span></label>
          <label className="lg-upbtn">
            이미지 첨부 (자동 압축, 10MB 이하)
            <input type="file" accept="image/*" style={{ display: 'none' }} onChange={onFile} />
          </label>
          {f.sources.length > 0 && (
            <div className="lg-srcs">{f.sources.map((s, i) => <span key={i}>{s.name}</span>)}</div>
          )}
          <input type="url" className="lg-mt" placeholder="영상이나 대용량 소스는 사내 공유 링크로" value={f.sourceLink} onChange={e => set({ sourceLink: e.target.value })} />
          <label className="lg-check"><input type="checkbox" checked={f.sourceLater} onChange={e => set({ sourceLater: e.target.checked })} /> <span>소재는 추후 전달할게요</span></label>
        </div>

        <div className="lg-fld">
          <label>관련 문서<span className="lg-hint">계획안 등, 파일은 받지 않습니다</span></label>
          <label className="lg-check"><input type="checkbox" checked={f.hasPlan} onChange={e => set({ hasPlan: e.target.checked })} />
            <span>계획안이 있습니다<span className="lg-check-d">담당자 배정 후 팀즈로 개별 공유해 주시면 됩니다</span></span></label>
        </div>

        {plan && <HandoffGuide plan={plan} />}
        {missing.length > 0 && <div className="lg-missing">미입력 {missing.join(', ')}</div>}
        <button className="lg-submit" disabled={busy || missing.length > 0} onClick={submit}>
          {busy ? '접수 중' : '신청 접수'}
        </button>
      </div>

      <SlotMock slot={slot} media={f.media} recommend={f.recommend} preview={preview}
        title={f.title} body={f.body} ready={f.ready} targetApps={f.targetApps} />
    </div>
  )
}

/* ── 전달 경로 안내 ('26.8 2차) — "무엇이 이 접수로 끝나고 무엇을 팀즈로 따로
   보내야 하는지"를 폼 하단과 접수 완료 화면에 같은 내용으로 보여준다 ── */
function HandoffGuide({ plan, done }) {
  return (
    <div className={`lg-handoff${done ? ' in-done' : ''}`}>
      <div className="lg-ho-t">전달 안내</div>
      <div className="lg-ho-cols">
        <div>
          <div className="lg-ho-h">이 접수로 전달되는 것</div>
          {plan.now.map((n, i) => <div className="lg-ho-item ok" key={i}>{n}</div>)}
        </div>
        <div>
          <div className="lg-ho-h">팀즈로 따로 전달할 것</div>
          {plan.later.length === 0 && <div className="lg-ho-item">없음, 이 접수로 끝입니다</div>}
          {plan.later.map((l, i) => (
            <div className="lg-ho-item later" key={i}>
              <b>{l.label}</b>
              <span>{l.to}{l.due ? `, 마감 ${fmtKday(l.due)}` : ''}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ── 타겟APP 목업 — media.js 타겟형 스펙과 가이드 지면 이미지(ta-*.jpg) 재사용.
   앱 탭으로 전환, 지면 탭으로 이미지 전환, 비율 검사는 보고 있는 지면 규격 기준 ── */
function TargetMock({ apps, preview }) {
  const [app, setApp] = useState(apps[0])
  const cur = apps.includes(app) ? app : apps[0]
  const sp = targetSpec(cur)
  const slots = sp?.slots || []
  const [si, setSi] = useState(0)
  const slot = slots[Math.min(si, Math.max(0, slots.length - 1))] || null
  const size = slot ? parseSize(slot.size) : null
  const off = preview && size ? ratioOff(preview.w, preview.h, size.w, size.h) : 0
  const caution = targetCaution(cur)
  return (
    <div className="lg-mock">
      <div className="lg-mk-head">타겟APP 게재 예시</div>
      <div className="lg-mk-sub">가이드라인의 지면 목업입니다, 앱과 지면을 눌러 넘겨 보세요</div>
      {apps.length > 1 && (
        <div className="lg-chips lg-mt">
          {apps.map(a => (
            <button key={a} type="button" className={`lg-chip sm${a === cur ? ' on' : ''}`}
              onClick={() => { setApp(a); setSi(0) }}>{a}</button>
          ))}
        </div>
      )}
      {!sp && <div className="lg-mk-empty">{cur}는 스펙 미등록입니다<br />접수 후 담당자와 규격을 협의합니다</div>}
      {sp && (<>
        {slots.length > 1 && (
          <div className="lg-chips lg-mt">
            {slots.map((s, i) => (
              <button key={s.name} type="button" className={`lg-chip sm${i === si ? ' on' : ''}`}
                onClick={() => setSi(i)}>{s.name}</button>
            ))}
          </div>
        )}
        {slot?.ref
          ? <div className="lg-ta-shot"><img src={`${import.meta.env.BASE_URL}media-ref/${slot.ref}`} alt={`${cur} ${slot.name} 목업`} /></div>
          : <div className="lg-mk-empty">이 지면은 목업 이미지가 없습니다</div>}
        {preview && size && off > 0.05 && (
          <div className="lg-ratio bad">{slot.name}은 {size.w} × {size.h}입니다. 올리신 이미지는 {preview.w} × {preview.h}라 이 지면에는 리사이즈가 필요합니다. 지면마다 규격이 달라 최종 소재는 담당자와 지면 확정 후 맞추면 됩니다.</div>
        )}
        {preview && size && off <= 0.05 && <div className="lg-ratio ok">{slot.name} 규격 비율과 일치합니다</div>}
        <div className="lg-specs">
          {slot && <div className="lg-spec"><span>규격</span><b>{slot.size}</b></div>}
          {slot?.cap && <div className="lg-spec"><span>용량</span><b>{slot.cap}</b></div>}
          {slot?.img && <div className="lg-spec"><span>형식</span><b>{slot.img}</b></div>}
          <div className="lg-spec"><span>전달 마감</span><b>게시 {sp.lead.replace(' (영업일)', '')} 영업일</b></div>
          {slot?.note && <div className="lg-spec note"><span>주의</span><b>{slot.note}</b></div>}
          {caution && <div className="lg-spec note"><span>주의</span><b>{caution}</b></div>}
        </div>
      </>)}
      <div className="lg-mk-note">전체 규격과 진행 절차는 매체 스펙 탭에서 확인할 수 있습니다</div>
    </div>
  )
}

/* ── 우측 목업 — 구좌별 게재 예시 + 비율 검사 ── */
function SlotMock({ slot, media, recommend, preview, title, body, ready, targetApps }) {
  if (!slot && media.includes('타겟APP') && targetApps?.length)
    return <TargetMock apps={targetApps} preview={preview} />
  if (!slot) return (
    <div className="lg-mock">
      <div className="lg-mk-head">{recommend ? '매체 추천 요청' : media.length ? '접수 후 협의' : '게재 예시'}</div>
      <div className="lg-mk-empty">
        {recommend
          ? '아젠다와 목적을 보고 담당자가 맞는 매체를 제안합니다'
          : media.includes('타겟APP')
            ? '타겟 앱을 고르면 지면 목업과 규격이 보입니다'
            : media.length
              ? '이 매체는 접수 후 담당자와 소재 규격을 협의합니다'
              : '희망 매체를 고르면 여기에 게재 예시와 규격이 보입니다'}
      </div>
      <div className="lg-mk-note">전체 규격과 진행 절차는 매체 스펙 탭에서 확인할 수 있습니다</div>
    </div>
  )
  const off = preview ? ratioOff(preview.w, preview.h, slot.w, slot.h) : 0
  const r = readyById(ready)
  return (
    <div className="lg-mock">
      <div className="lg-mk-head">{slot.name}</div>
      <div className="lg-mk-sub">브랜드 소스를 올리면 실제 노출 위치에 합성됩니다</div>
      <div className="lg-phone-wrap">
        <div className="lg-phone">
          <div className="lg-island" />
          <div className="lg-scr">
            {slot.id === 'shopping' && (
              <div className="lg-mk-shopping">
                <div className="lg-sk t" /><div className="lg-sk" />
                <div className="lg-slotbox sq">{preview ? <img src={preview.url} alt="" /> : <span>750 × 750</span>}
                  {title && <div className="lg-ov-title">{title.split('\n').slice(0, 2).map((l, i) => <div key={i}>{l.slice(0, 11)}</div>)}</div>}
                </div>
                <div className="lg-sk" />
              </div>
            )}
            {slot.id === 'banner' && (
              <div className="lg-mk-banner">
                <div className="lg-sk t" /><div className="lg-sk" /><div className="lg-sk" />
                <div className="lg-slotbox wide">{preview ? <img src={preview.url} alt="" /> : <span>650 × 242</span>}</div>
                <div className="lg-sk" />
              </div>
            )}
            {slot.id === 'popup' && (
              <div className="lg-mk-popup">
                <div className="lg-dim" />
                <div className="lg-sheet">
                  <div className="lg-slotbox pop">{preview ? <img src={preview.url} alt="" /> : <span>720 × 512</span>}</div>
                  <div className="lg-sheet-btns"><span>오늘 하루 보지 않기</span><b>닫기</b></div>
                </div>
              </div>
            )}
            {slot.id === 'push' && (
              <div className="lg-mk-push">
                <div className="lg-noti">
                  <div className="lg-noti-app">THE HYUNDAI</div>
                  <div className="lg-noti-t">{title || '푸시 제목'}</div>
                  <div className="lg-noti-b">{body || '푸시 내용이 여기에 보입니다'}</div>
                  <div className="lg-slotbox pushimg">{preview ? <img src={preview.url} alt="" /> : <span>500 × 250 (선택)</span>}</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      {preview && off > 0.05 && (
        <div className="lg-ratio bad">이 구좌는 {slot.w} × {slot.h}입니다. 올리신 이미지는 {preview.w} × {preview.h}라 위아래 또는 좌우가 잘려 보입니다. 규격에 맞춘 소재를 준비해 주세요.</div>
      )}
      {preview && off <= 0.05 && <div className="lg-ratio ok">규격 비율과 일치합니다</div>}
      <div className="lg-specs">
        <div className="lg-spec"><span>규격</span><b>{slot.w} × {slot.h}</b></div>
        <div className="lg-spec"><span>형식</span><b>JPG, PNG</b></div>
        <div className="lg-spec"><span>전달 마감</span><b>게시 D-{r.lead} 영업일</b></div>
        {slot.notes.map((n, i) => <div className="lg-spec note" key={i}><span>주의</span><b>{n}</b></div>)}
      </div>
      <div className="lg-mk-note">전체 규격과 진행 절차는 매체 스펙 탭에서 확인할 수 있습니다</div>
    </div>
  )
}

/* ═══════════════ 공개 진행 현황 보드 ('26.8 전사 공개) ═══════════════
   미러(무로그인)에서 모든 팀이 본다 — 누가 무엇을 신청했고 어디까지 진행됐는지.
   데이터는 lounge_board 뷰 (이메일, 문안 상세, 소스, 반려 사유, 메모 제외) */
export function LoungeBoard({ rows }) {
  if (rows === null) return <div className="lg-empty">진행 현황을 준비 중입니다</div>
  if (!rows?.length) return <div className="lg-empty">아직 접수된 신청이 없습니다, 첫 신청을 올려보세요</div>
  const live = rows.filter(r => r.status !== STATUS_REJECT)
  const doing = live.filter(r => r.status !== '게시 완료').length
  const doneN = live.filter(r => r.status === '게시 완료').length
  return (
    <div>
      <div className="lg-sums">
        <span className="lg-sum"><b>{doing}</b>진행 중</span>
        <span className="lg-sum"><b>{doneN}</b>게시 완료</span>
      </div>
      <div className="lg-tblwrap">
        <table className="lg-tbl">
          <thead><tr><th>접수</th><th>아젠다</th><th>신청</th><th>매체</th><th>게시</th><th>담당</th><th>상태</th></tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id}>
                <td>{fmtMd(r.createdAt?.slice(0, 10))}</td>
                <td><b>{r.agenda}</b></td>
                <td>{r.dept}{r.name ? ` ${r.name}` : ''}</td>
                <td>{r.media.length ? r.media.join(', ') : '추천 요청'}</td>
                <td>{fmtMd(r.wishDate)}{r.wishEnd ? ` 부터 ${fmtMd(r.wishEnd)}` : ''}</td>
                <td>{r.owner || ''}</td>
                <td><span className={`lg-st ${stClass(r.status)}`}>{r.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="lg-mk-note">접수와 배정, 진행은 미디어콘텐츠팀이 관리합니다</div>
    </div>
  )
}

/* 미러 사이트용 공개 화면 — 신청 폼 + 진행 현황 (관리함 없음) */
export function LoungePublic() {
  const [seg, setSeg] = useState('form')
  const [board, setBoard] = useState(undefined)
  const reload = async () => setBoard(await listBoard())
  useEffect(() => { reload() }, [])
  const todayCount = useMemo(() => {
    if (!Array.isArray(board)) return null
    const today = isoOf(new Date())
    return board.filter(r => r.createdAt?.slice(0, 10) === today).length
  }, [board])
  return (
    <div className="wrap lounge">
      <header className="cal-head">
        <div>
          <h1>미디어 바이럴 라운지</h1>
          <p className="cal-desc">현대백화점 미디어콘텐츠팀의 매체에 광고와 바이럴을 신청하는 창구입니다<br />접수 후 담당자가 배정되면 팀즈로 연락드립니다</p>
        </div>
      </header>
      <div className="seg lg-seg">
        <button className={seg === 'form' ? 'on' : ''} onClick={() => setSeg('form')}>신청 접수</button>
        <button className={seg === 'board' ? 'on' : ''} onClick={() => { setSeg('board'); reload() }}>진행 현황</button>
      </div>
      {seg === 'form' && <LoungeForm todayCount={todayCount} onDone={reload} />}
      {seg === 'board' && (board === undefined
        ? <div className="lg-empty">불러오는 중</div>
        : <LoungeBoard rows={board} />)}
    </div>
  )
}

/* ═══════════════ 접수 관리함 ═══════════════ */
const PIPE = ['접수', '담당 배정', '협의', '확정', '게시 완료']
const stClass = s => ({ '접수': 's0', '협의': 's1', '확정': 's2', '게시 완료': 's3', [STATUS_REJECT]: 'sr' }[s] || 's0')

function LoungeInbox({ rows, onReload }) {
  const [openId, setOpenId] = useState(null)
  const [filter, setFilter] = useState('')
  const open = rows?.find(r => r.id === openId) || null

  if (rows === null) return (
    <div className="lg-empty">라운지 테이블이 아직 설정되지 않았습니다, data/lounge-setup.sql 실행 후 사용할 수 있습니다 (setup.md 14장)</div>
  )
  const live = rows.filter(r => r.status !== STATUS_REJECT)
  const unassigned = live.filter(r => !r.owner && r.status === '접수')
  const talking = live.filter(r => r.status === '협의')
  const weekEnd = isoOf(new Date(Date.now() + 7 * 86400000))
  const thisWeek = live.filter(r => r.status === '확정' && r.wishDate && r.wishDate <= weekEnd)
  const shown = filter === 'un' ? unassigned : filter === 'talk' ? talking : filter === 'week' ? thisWeek : rows

  return (
    <div>
      <div className="lg-sums">
        <button className={`lg-sum${unassigned.length ? ' alert' : ''}${filter === 'un' ? ' on' : ''}`}
          onClick={() => setFilter(filter === 'un' ? '' : 'un')}><b>{unassigned.length}</b>미배정</button>
        <button className={`lg-sum${filter === 'talk' ? ' on' : ''}`}
          onClick={() => setFilter(filter === 'talk' ? '' : 'talk')}><b>{talking.length}</b>협의 중</button>
        <button className={`lg-sum${filter === 'week' ? ' on' : ''}`}
          onClick={() => setFilter(filter === 'week' ? '' : 'week')}><b>{thisWeek.length}</b>이번 주 게시 예정</button>
      </div>

      {shown.length === 0 && <div className="lg-empty">표시할 신청이 없습니다</div>}
      {shown.length > 0 && (
        <div className="lg-tblwrap">
          <table className="lg-tbl">
            <thead><tr><th>접수</th><th>아젠다</th><th>부서</th><th>희망 매체</th><th>희망 게시</th><th>담당</th><th>상태</th><th></th></tr></thead>
            <tbody>
              {shown.map(r => (
                <tr key={r.id} className={r.id === openId ? 'sel' : ''}>
                  <td>{fmtMd(r.createdAt?.slice(0, 10))}</td>
                  <td><b>{r.agenda}</b></td>
                  <td>{r.dept}</td>
                  <td>{r.media.length ? r.media.join(', ') : '추천 요청'}</td>
                  <td>{fmtMd(r.wishDate)}</td>
                  <td className={r.owner ? '' : 'lg-un'}>{r.owner || '미배정'}</td>
                  <td><span className={`lg-st ${stClass(r.status)}`}>{r.status}</span></td>
                  <td><button className="lg-rowbtn" onClick={() => setOpenId(r.id === openId ? null : r.id)}>
                    {r.id === openId ? '닫기' : '열기'}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {open && <ReqDetail key={open.id} r={open} onReload={onReload} onClose={() => setOpenId(null)} />}
    </div>
  )
}

function ReqDetail({ r, onReload, onClose }) {
  const d = r.details || {}
  const slot = appSlotById(d.appSlot)
  const suggested = useMemo(() => {
    for (const m of r.media) if (DEFAULT_OWNERS[m]) return DEFAULT_OWNERS[m]
    return null
  }, [r.media])
  const [owner, setOwner] = useState(r.owner || suggested?.main || '')
  const [media, setMedia] = useState(r.media)
  const [rejectArm, setRejectArm] = useState(false)
  const [rejectWhy, setRejectWhy] = useState('')
  const [delArm, setDelArm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [srcUrls, setSrcUrls] = useState([])

  /* 브랜드 소스 열람 — 비공개 버킷이라 토큰 fetch 후 blob URL */
  useEffect(() => {
    let dead = false, made = []
    Promise.all((r.sources || []).map(s => loungeSourceUrl(s.path).catch(() => null)))
      .then(list => {
        made = list.filter(Boolean)
        if (dead) made.forEach(u => URL.revokeObjectURL(u))
        else setSrcUrls(made)
      })
    return () => { dead = true; made.forEach(u => URL.revokeObjectURL(u)) }
  }, [r.id, r.sources])

  const act = async (fn, msg) => {
    setBusy(true)
    try { await fn(); msg && toast(msg); await onReload() }
    catch (err) { toast(err.message, { danger: true }) }
    finally { setBusy(false) }
  }

  const assign = () => act(async () => {
    if (!owner) throw new Error('담당을 먼저 선택해 주세요')
    await updateRequest(r.id, { owner, status: r.status === '접수' ? '협의' : r.status })
  }, '배정됨, 팀즈로 신청자에게 연락해 주세요')

  const saveMedia = () => act(() => updateRequest(r.id, { media }), '매체 지정됨')

  const confirmReg = () => act(async () => {
    const list = media.length ? media : r.media
    if (!list.length) throw new Error('희망 매체가 없어 캘린더 등록이 안 됩니다, 매체를 먼저 지정해 주세요')
    const date = r.wishDate || r.eventStart
    if (!date) throw new Error('게시일이 없어 캘린더 등록이 안 됩니다')
    const camp = (r.agenda || '').replace(/\s+/g, '').slice(0, 20)
    const subFor = m => (m === '백화점APP' ? ({ push: '푸쉬', popup: '팝업' }[d.appSlot] || null) : null)
    const memo = `바이럴 라운지 접수${r.reqNo ? ` ${r.reqNo}` : ''}, 신청 ${r.dept} ${r.name}`
    const base = {
      title: r.agenda, date, endDate: r.wishEnd || null, campaign: camp || null,
      owner: r.owner || owner || null, memo,
    }
    const ids = []
    for (const m of list) {
      /* 타겟APP은 캘린더의 1건=1세부 모델 그대로 — 선택 앱마다 한 건 (셀에서는 ×N 묶임) */
      if (m === '타겟APP' && d.targetApps?.length) {
        for (const a of d.targetApps) {
          const ev = await createEvent({ ...base, channel: m, sub: a })
          ids.push(ev.id)
        }
        continue
      }
      const ev = await createEvent({ ...base, channel: m, sub: subFor(m) })
      ids.push(ev.id)
    }
    await updateRequest(r.id, { status: '확정', linked_events: ids })
    toast(`매체 캘린더에 ${ids.length}건 등록됨, 캠페인 태그 ${camp || '없음'}`)
  })

  const setStatus = s => act(() => updateRequest(r.id, { status: s }), '상태 변경됨')
  const reject = () => act(() => updateRequest(r.id, { status: STATUS_REJECT, reject_reason: rejectWhy || null }), '반려 처리됨')
  const remove = () => act(async () => { await deleteRequest(r.id); onClose() }, '삭제됨')

  const copyTransfer = async () => { if (await copyText(transferText(r))) toast('전달 양식이 복사됨') }

  const doneIdx = (() => {
    if (r.status === STATUS_REJECT) return -1
    const map = { '접수': 0, '협의': 2, '확정': 3, '게시 완료': 4 }
    let idx = map[r.status] ?? 0
    if (r.owner && idx < 1) idx = 1
    return idx
  })()
  const today = isoOf(new Date())
  const tNeed = d.targetApps?.length ? maxTargetLead(d.targetApps) : null
  const lead = r.wishDate
    ? (slot ? leadCheck(today, r.wishDate, d.ready)
      : tNeed ? leadCheck(today, r.wishDate, null, tNeed.need) : null)
    : null
  const due = lead ? bizDeadline(r.wishDate, lead.need) : null

  return (
    <div className="lg-detail">
      <div>
        <h3>{r.agenda}{r.reqNo && <span className="lg-reqno">{r.reqNo}</span>}</h3>
        {r.status === STATUS_REJECT
          ? <div className="lg-rejected">반려됨{r.rejectReason ? `, 사유 ${r.rejectReason}` : ''}</div>
          : (
            <div className="lg-pipe">
              {PIPE.map((p, i) => (
                <span key={p} className={`lg-pl${i < doneIdx ? ' done' : ''}${i === doneIdx ? ' cur' : ''}`}>{p}</span>
              ))}
            </div>
          )}
        <div className="lg-kv">
          <span className="k">신청</span><span>{r.dept} {r.name} ({r.email})</span>
          {(r.sellPoints.length > 0 || r.sellNote) && (<>
            <span className="k">소구점</span><span>{[r.sellPoints.join(', '), r.sellNote].filter(Boolean).join(', ')}</span>
          </>)}
          {r.goal && (<><span className="k">목적</span><span>{r.goal}</span></>)}
          <span className="k">희망 매체</span>
          <span>{r.media.length ? r.media.join(', ') : '추천 요청'}{slot ? ` (${slot.name})` : ''}</span>
          {d.targetApps?.length > 0 && (<>
            <span className="k">타겟 앱</span><span>{d.targetApps.join(', ')}</span>
          </>)}
          {r.eventStart && (<><span className="k">행사 기간</span><span>{fmtMd(r.eventStart)}{r.eventEnd ? ` 부터 ${fmtMd(r.eventEnd)}` : ''}</span></>)}
          {r.wishDate && (<>
            <span className="k">희망 게시</span>
            <span>{fmtMd(r.wishDate)}{r.wishEnd ? ` 부터 ${fmtMd(r.wishEnd)}` : ''}{d.wishTime ? ` ${d.wishTime}` : ''}
              {lead && !lead.ok && <span className="lg-leadflag"> 리드타임 경고 접수됨, 필요 {lead.need}영업일에 잔여 {lead.left}일</span>}
            </span>
          </>)}
          {due && (<>
            <span className="k">소재 마감</span>
            <span>{fmtKday(due)}{tNeed ? `, ${tNeed.from} 기준 게시 ${lead.need}영업일 전` : `, 게시 ${lead.need}영업일 전`}</span>
          </>)}
          {d.branches && (<><span className="k">지점</span><span>{d.branches}</span></>)}
          {d.title && (<><span className="k">제목</span><span>{d.title.split('\n').join(', ')}</span></>)}
          {d.body && (<><span className="k">내용</span><span>{d.body.split('\n').join(', ')}</span></>)}
          {d.pushType && (<><span className="k">푸시</span><span>{d.pushType}, {d.adKind || '광고'}</span></>)}
          {d.landingKind && (<>
            <span className="k">이동페이지</span>
            <span>{LANDING_KINDS.find(k => k.id === d.landingKind)?.label}
              {d.landingKind === 'prism' && ` (${[d.prismNo, d.prismBranch, d.prismCat].filter(Boolean).join(', ') || '정보 미기입'}${d.prismApproved ? ', 승인 완료' : ', 승인 확인 필요'})`}
              {d.landingKind === 'menu' && d.appMenu && ` (${d.appMenu})`}
              {d.landingKind === 'url' && d.landingUrl && ` (${d.landingUrl})`}
            </span>
          </>)}
          {d.audienceKind && (<>
            <span className="k">{d.appSlot === 'push' ? '발송 대상' : '노출 대상'}</span>
            <span>{AUDIENCE_KINDS.find(k => k.id === d.audienceKind)?.label}
              {d.cardGrades?.length ? ` (${d.cardGrades.join(', ')})` : ''}
              {d.audienceKind === 'excel' ? ', 타겟 파일은 신청 부서에서 별도 수령' : ''}
            </span>
          </>)}
          <span className="k">브랜드 소스</span>
          <span>{[r.sources.length ? `이미지 ${r.sources.length}장` : '', r.sourceLink ? '링크 있음' : '', r.sourceLater ? '추후 전달' : '']
            .filter(Boolean).join(', ') || '없음'}
            {r.sourceLink && <> <a href={r.sourceLink} target="_blank" rel="noreferrer">열기</a></>}
          </span>
          <span className="k">관련 문서</span>
          <span>{r.hasPlan ? '계획안 보유, 담당 배정 후 팀즈 공유 예정' : '없음'}</span>
        </div>
        {srcUrls.length > 0 && (
          <div className="lg-srcimgs">{srcUrls.map((u, i) => <img key={i} src={u} alt="" />)}</div>
        )}
      </div>

      <div className="lg-assign">
        <div className="lg-a-t">담당 배정</div>
        {suggested && !r.owner && (
          <div className="lg-sugg">희망 매체 기준 기본 담당 <b>{suggested.main}</b>을 제안합니다{suggested.subs?.length ? `, 부 담당 ${suggested.subs.join(', ')}` : ''}<br />다른 팀원으로 직접 지정할 수도 있습니다</div>
        )}
        <select value={owner} onChange={e => setOwner(e.target.value)}>
          <option value="">담당 선택</option>
          {Object.values(TEAM).map(n => <option key={n}>{n}</option>)}
        </select>
        <button className="lg-act primary" disabled={busy} onClick={assign}>배정하고 팀즈 연락 시작</button>

        {!r.media.length && (
          <div className="lg-mt">
            <div className="lg-a-t">매체 지정 (추천 요청 건)</div>
            <div className="lg-chips">
              {LOUNGE_MEDIA.map(m => (
                <button key={m.id} type="button" className={`lg-chip sm${media.includes(m.id) ? ' on' : ''}`}
                  onClick={() => setMedia(v => v.includes(m.id) ? v.filter(x => x !== m.id) : [...v, m.id])}>{m.label}</button>
              ))}
            </div>
            <button className="lg-act" disabled={busy} onClick={saveMedia}>매체 저장</button>
          </div>
        )}

        {r.status !== STATUS_REJECT && r.status !== '게시 완료' && (
          <div className="lg-actrow">
            {r.status !== '확정' && <button className="lg-act" disabled={busy} onClick={confirmReg}>확정, 캘린더 등록</button>}
            {r.status === '확정' && <button className="lg-act" disabled={busy} onClick={() => setStatus('게시 완료')}>게시 완료로</button>}
            {!rejectArm && <button className="lg-act danger" disabled={busy} onClick={() => setRejectArm(true)}>반려</button>}
          </div>
        )}
        {rejectArm && (
          <div className="lg-mt">
            <input type="text" placeholder="반려 사유 (신청자 회신용)" value={rejectWhy} onChange={e => setRejectWhy(e.target.value)} />
            <div className="lg-actrow">
              <button className="lg-act danger" disabled={busy} onClick={reject}>반려 확정</button>
              <button className="lg-act" onClick={() => setRejectArm(false)}>취소</button>
            </div>
          </div>
        )}
        {r.linkedEvents?.length > 0 && (
          <div className="lg-calnote">매체 캘린더에 {r.linkedEvents.length}건 등록됨</div>
        )}

        <div className="lg-actrow lg-mt">
          <button className="lg-act" onClick={copyTransfer}>전달 양식으로 복사</button>
          {!delArm
            ? <button className="lg-act" onClick={() => setDelArm(true)}>삭제</button>
            : <button className="lg-act danger" disabled={busy} onClick={remove}>정말 삭제</button>}
        </div>
      </div>
    </div>
  )
}

/* ═══════════════ 탭 셸 ═══════════════ */
export default function LoungePage() {
  const [seg, setSeg] = useState('inbox')   // 팀 화면이라 관리함이 기본
  const [rows, setRows] = useState(undefined)
  const reload = async () => setRows(await listRequests())
  useEffect(() => { reload() }, [])

  const todayCount = useMemo(() => {
    if (!Array.isArray(rows)) return null
    const today = isoOf(new Date())
    return rows.filter(r => r.createdAt?.slice(0, 10) === today).length
  }, [rows])

  return (
    <div className="wrap lounge">
      <header className="cal-head">
        <div>
          <h1>미디어 바이럴 라운지</h1>
          <p className="cal-desc">타 팀의 매체 광고, 바이럴 신청 접수와 진행 관리<br />신청 폼과 진행 현황은 미러 사이트에 전사 공개되어 있습니다</p>
        </div>
        <button className="lg-btn share" onClick={async () => {
          if (await copyText(`${MIRROR_URL}/#lounge`)) toast('신청 링크가 복사됨, 팀즈에 공유해 주세요')
        }}>신청 링크 복사</button>
      </header>
      <div className="seg lg-seg">
        <button className={seg === 'inbox' ? 'on' : ''} onClick={() => setSeg('inbox')}>접수 관리</button>
        <button className={seg === 'form' ? 'on' : ''} onClick={() => setSeg('form')}>신청 접수</button>
      </div>
      {seg === 'form' && <LoungeForm todayCount={todayCount} onDone={reload} />}
      {seg === 'inbox' && (rows === undefined
        ? <div className="lg-empty">불러오는 중</div>
        : <LoungeInbox rows={rows} onReload={reload} />)}
    </div>
  )
}
