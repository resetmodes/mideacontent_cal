/* 팀원 명단 — 로그인 이메일 → 작성자 표시 이름(이름+직급)
   일정 등록 시 로그인 계정에서 작성자를 자동 기록하는 데 사용.
   팀원 추가: 아래에 '이메일(소문자)': '이름 직급' 한 줄 추가.
   명단에 없는 계정은 이메일 앞부분(@ 앞)으로 자동 표시됨. */
export const TEAM = {
  'jaesal@hmall.com': '이재상 팀장',
  'hajh0121@thehyundai.com': '하지훈 책임',
  '1100442@thehyundai.com': '김희진 책임',
  'jykim84@thehyundai.com': '김자영 책임',
  'sangsu88926@thehyundai.com': '김상수 책임',
  '1607211@thehyundai.com': '정소미 책임',
  '2319320@thehyundai.com': '이수정 선임',
  'mjyoo@thehyundai.com': '유미진 선임',
  'umhyewon@thehyundai.com': '엄혜원 선임',
  'hanjumping@thehyundai.com': '한정빈 선임',
  'kyuvin@thehyundai.com': '노규빈 선임',
  'chaeeun@thehyundai.com': '백채은 선임',
  'sklee1031@thehyundai.com': '이승권 선임',
  'hyojaekim@thehyundai.com': '김효재 선임',
  // '이메일@thehyundai.com': '이름 직급',
}

/* 로그인 이메일 → 작성자 표시 이름 (명단에 없으면 이메일 앞부분) */
export function authorName(email) {
  if (!email) return ''
  return TEAM[email.toLowerCase()] || email.split('@')[0]
}
