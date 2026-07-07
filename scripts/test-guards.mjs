/* 빈 결과 덮어쓰기 가드 회귀 테스트 ('26.7 하네스)
   '26.7.7 사고: Apify 한도 초과로 유튜브 수집 0건 → 정제 스크립트가 빈 데이터를
   저장해 기존 데이터 소실. 그 방지 가드(clean-*.mjs)가 살아있는지 확인.
   방법: 빈 raw 디렉토리로 정제 실행 → 기존 데이터 파일이 그대로여야 통과 */

import { readFile, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const hash = async f => createHash('sha256').update(await readFile(f)).digest('hex')

const emptyDir = await mkdtemp(join(tmpdir(), 'sns-empty-'))
let fail = 0

for (const [script, dataFile] of [
  ['scripts/sns/clean-youtube.mjs', 'src/data/sns/youtube.js'],
  ['scripts/sns/clean-instagram.mjs', 'src/data/sns/instagram.js'],
]) {
  const target = join(ROOT, dataFile)
  const before = await hash(target)
  try {
    execFileSync('node', [join(ROOT, script)], {
      env: { ...process.env, SNS_RAW_DIR: emptyDir },
      stdio: 'pipe',
    })
  } catch { /* 가드가 경고 후 비정상 종료해도 무방 — 파일 보존 여부만 본다 */ }
  const after = await hash(target)
  if (before !== after) {
    fail++
    console.error(`✗ ${script}: 빈 수집 결과가 ${dataFile}을 덮어씀 — 가드 소실!`)
  } else {
    console.log(`✓ ${script}: 빈 결과에서 ${dataFile} 보존됨`)
  }
}

/* ── carry-forward 테스트 ('26.7 사고 2 재발 방지) ─────────────
   크레딧이 수집 도중 끊겨 일부 계정 raw만 있는 경우:
   수집된 계정은 갱신, 못 한 계정은 이전 값 유지 — 계정이 사라지면 실패 */
import { writeFile, mkdir } from 'node:fs/promises'
import { IG_ACCOUNTS } from './sns/accounts.mjs'

const outDir = await mkdtemp(join(tmpdir(), 'sns-out-'))
const rawDir = await mkdtemp(join(tmpdir(), 'sns-raw-'))
const [accA, accB] = IG_ACCOUNTS

// 이전 출력: A·B 두 계정이 있던 상태
await writeFile(join(outDir, 'instagram.js'),
  'export const IG = ' + JSON.stringify({
    accounts: [
      { handle: accA.handle, name: accA.name, group: accA.group, followers: 50 },
      { handle: accB.handle, name: accB.name, group: accB.group, followers: 70 },
    ],
    competitors: [], posts: [],
  }) + '\n')

// 이번 수집: A만 성공 (B raw 없음 = 크레딧 끊김 시나리오)
await writeFile(join(rawDir, `${accA.file}.json`), JSON.stringify([{
  followersCount: 100, timestamp: new Date().toISOString(),
  likesCount: 5, commentsCount: 1, type: 'Image',
}]))

execFileSync('node', [join(ROOT, 'scripts/sns/clean-instagram.mjs')], {
  env: { ...process.env, SNS_RAW_DIR: rawDir, SNS_OUT_DIR: outDir },
  stdio: 'pipe',
})
const outTxt = await readFile(join(outDir, 'instagram.js'), 'utf8')
const out = JSON.parse(outTxt.slice(outTxt.indexOf('{')))
const a = out.accounts.find(x => x.handle === accA.handle)
const bKept = out.accounts.find(x => x.handle === accB.handle)
if (a?.followers === 100 && bKept?.followers === 70) {
  console.log('✓ clean-instagram.mjs: 부분 실패 시 수집분 갱신 + 미수집 계정 이전 값 유지')
} else {
  fail++
  console.error(`✗ carry-forward 실패 — A=${JSON.stringify(a)} B=${JSON.stringify(bKept)}`)
}

console.log(fail ? '\n가드 테스트 실패' : '\n가드 테스트: 전부 통과')
if (fail) process.exit(1)
