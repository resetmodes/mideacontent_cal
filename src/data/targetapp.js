/* 타겟APP 모니터링 메타 ('26.7) — 매체 구분·표시 순서만 (비민감).
   실적 수치는 Supabase targetapp_stats·targetapp_media 테이블(RLS, 내부 전용)에만 존재 —
   번들 파일에 싣지 않음 (공개 미러 번들로 새는 것 방지, '26.7 사용자 결정).
   이관·테이블 생성 SQL: data/targetapp-seed.sql · 절차: data/supabase-setup.md 7장 */
export const TA_GROUPS = [
  {
    "g": "아파트앱",
    "desc": "아파트 거주자 타겟",
    "media": [
      "아파트너",
      "바이비",
      "아파트아이"
    ]
  },
  {
    "g": "키즈앱",
    "desc": "영유아·학부모 타겟",
    "media": [
      "키즈노트",
      "하이클래스"
    ]
  },
  {
    "g": "직장인앱",
    "desc": "직장인·성인 타겟",
    "media": [
      "리멤버"
    ]
  },
  {
    "g": "대학생앱",
    "desc": "대학생·MZ 타겟",
    "media": [
      "에브리타임"
    ]
  },
  {
    "g": "취향앱",
    "desc": "취향·라이프스타일",
    "media": [
      "카카오골프",
      "데일리샷"
    ]
  },
  {
    "g": "글로벌앱",
    "desc": "방한 외국인 타겟",
    "media": [
      "K-Ride"
    ]
  }
]
