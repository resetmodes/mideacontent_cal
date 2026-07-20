-- 타겟APP 실적 모니터링 — 테이블 생성 + '26.1~4월 이관분 (50건 + 매체 누적 10종)
-- 실행: Supabase → SQL Editor → 전체 붙여넣기 → Run (1회)
-- 내부 전용: anon(미러) 정책 없음 — 로그인 계정만 조회, 쓰기는 team_writers만

create table if not exists targetapp_stats (
  id uuid primary key default gen_random_uuid(),
  year int not null default 2026,
  month int not null,
  office text not null,
  name text not null,
  period text,
  media text[] default '{}',
  exp bigint default 0,
  clk bigint default 0,
  vis bigint default 0,
  inst bigint default 0,
  landing text,
  note text,
  created_at timestamptz default now()
);
alter table targetapp_stats enable row level security;
create policy "ta read signed-in" on targetapp_stats for select to authenticated using (true);
create policy "ta write writers" on targetapp_stats for all to authenticated
  using (is_team_writer()) with check (is_team_writer());

-- 매체별 누적 스냅샷 (보고서 원본 — 캠페인 행으로는 매체별 분해가 불가해 별도 보관)
create table if not exists targetapp_media (
  name text primary key,
  grp text not null,
  role text,
  exp bigint default 0,
  clk bigint default 0,
  vis bigint default 0,
  inst bigint default 0,
  cam int default 0,
  basis text
);
alter table targetapp_media enable row level security;
create policy "tam read signed-in" on targetapp_media for select to authenticated using (true);
create policy "tam write writers" on targetapp_media for all to authenticated
  using (is_team_writer()) with check (is_team_writer());

-- ── '26.1~4월 캠페인 이관 ──
insert into targetapp_stats (year,month,office,name,period,media,exp,clk,vis,inst,note) values (2026,1,'대구','더현대 대구 리뉴얼 3주년 & 빵빵이팝업','1.3~1.31',array['아파트너','바이비']::text[],226021,2925,1005,12,null);
insert into targetapp_stats (year,month,office,name,period,media,exp,clk,vis,inst,note) values (2026,2,'대구','양파쿵야 팝업스토어','2.21~3.2',array['키즈노트']::text[],824965,3077,1644,4,null);
insert into targetapp_stats (year,month,office,name,period,media,exp,clk,vis,inst,note) values (2026,3,'대구','캐치티니핑 팝업스토어','3.21~3.31',array['키즈노트']::text[],1149984,6577,3336,45,null);
insert into targetapp_stats (year,month,office,name,period,media,exp,clk,vis,inst,note) values (2026,4,'대구','로블록스 팝업 및 온라인 기획전','4.21~4.30',array['아파트너','바이비']::text[],180186,1986,337,7,'4개월 연속 집행. 1월 아파트너+바이비(클릭율 1.29%·앱설치 12) → 2월 키즈노트 단독(앱설치 4) → 3월 캐치티니핑 IP로 키즈노트 단독에도 앱설치 45 반등 → 4월 아파트너+바이비 복귀(클릭율 1.10%). 강한 IP 콘텐츠일 때 키즈노트 단독 전환 가능.');
insert into targetapp_stats (year,month,office,name,period,media,exp,clk,vis,inst,note) values (2026,2,'판교','오버워치 팝업 & 테크쇼','2.9~2.21',array['아파트너','바이비','리멤버','하이클래스']::text[],3371315,17785,7057,96,null);
insert into targetapp_stats (year,month,office,name,period,media,exp,clk,vis,inst,note) values (2026,3,'판교','판교 파인슬립 박람회','3.13~3.21',array['아파트너','바이비']::text[],373702,2664,806,28,'2월 오버워치 팝업(4매체) 앱설치 96 — 아파트너 53(55%) 기여. 3월 박람회 2매체 앱설치 28. 사업소 단위 다양한 콘텐츠로 안정적 전환 지속.');
insert into targetapp_stats (year,month,office,name,period,media,exp,clk,vis,inst,note) values (2026,1,'킨텍스','몬스터키즈쇼','1.5~1.24',array['아파트너','바이비','키즈노트']::text[],9260588,16462,9480,58,null);
insert into targetapp_stats (year,month,office,name,period,media,exp,clk,vis,inst,note) values (2026,2,'킨텍스','키즈토피아 시즌3','2.11~2.20',array['키즈노트']::text[],1379988,7323,0,0,null);
insert into targetapp_stats (year,month,office,name,period,media,exp,clk,vis,inst,note) values (2026,4,'킨텍스','멤버스위크 존리 특강 및 슬라라','3.26~4.3',array['아파트너','바이비','키즈노트']::text[],906512,6315,2382,83,'혼합(앱설치 58) → 키즈노트 단독(방문·앱설치 0) → 혼합 복귀(앱설치 83). 2월 키즈토피아 캠페인 방문·앱설치 0은 외부 예매 페이지 랜딩으로 자사 트래킹 미연결. 유사한 사례의 경우 홈페이지가 아닌 타 페이지(네이버 예약 등) 랜딩으로 인한 것으로, 노출·클릭은 정상 도달했으나 자사 트래킹에 방문·앱설치가 집계되지 않음.');
insert into targetapp_stats (year,month,office,name,period,media,exp,clk,vis,inst,note) values (2026,1,'부산','커넥트 과학탐험대','1.8~1.15',array['키즈노트']::text[],699978,3804,1780,12,null);
insert into targetapp_stats (year,month,office,name,period,media,exp,clk,vis,inst,note) values (2026,2,'부산','과학탐험대 2차','1.28~2.13',array['아파트너','바이비','키즈노트']::text[],1000254,6770,2599,15,null);
insert into targetapp_stats (year,month,office,name,period,media,exp,clk,vis,inst,note) values (2026,4,'부산','웨어하우스 및 열대어탐험대','3.27~4.5',array['키즈노트']::text[],689975,3890,1787,15,'반복 집행으로 클릭율 개선. 4월 키즈노트 단독 앱설치 15 — 열대어탐험대 콘텐츠 경쟁력. 아파트너 병행 시 추가 확보 여지.');
insert into targetapp_stats (year,month,office,name,period,media,exp,clk,vis,inst,note) values (2026,1,'송도','키즈관 1주년','1.9~1.16',array['아파트너','바이비','키즈노트']::text[],2135355,9486,4267,45,null);
insert into targetapp_stats (year,month,office,name,period,media,exp,clk,vis,inst,note) values (2026,3,'송도','인천FC 팝업스토어','3.13~3.20',array['아파트너','바이비','키즈노트']::text[],2440691,9551,4825,37,null);
insert into targetapp_stats (year,month,office,name,period,media,exp,clk,vis,inst,note) values (2026,4,'송도','송도 10주년 행사','4.17~4.25',array['아파트너','바이비','키즈노트']::text[],1056845,11474,4265,105,'동일 3매체 3회 반복. 앱설치 45→37 감소 후 4월 105로 대폭 반등. 10주년 콘텐츠+아파트너 클릭율 2.09% 동반 상승이 핵심.');
insert into targetapp_stats (year,month,office,name,period,media,exp,clk,vis,inst,note) values (2026,2,'중동','일룸 팝업스토어','1.28~2.10',array['아파트너','바이비','키즈노트']::text[],2131197,8509,3709,47,null);
insert into targetapp_stats (year,month,office,name,period,media,exp,clk,vis,inst,note) values (2026,3,'중동','신비한 마법학교','3.3~3.8',array['키즈노트']::text[],1462983,5867,0,0,null);
insert into targetapp_stats (year,month,office,name,period,media,exp,clk,vis,inst,note) values (2026,4,'중동','공룡 대발이 어드벤처','3.30~4.8',array['키즈노트']::text[],839980,1943,0,0,'3월·4월 키즈노트 단독 캠페인의 방문·앱설치 0은 네이버 예약 페이지로 트래픽이 빠진 결과. 유사한 사례의 경우 홈페이지가 아닌 타 페이지(네이버 예약 등) 랜딩으로 인한 것으로, 노출·클릭은 정상 도달했으나 자사 트래킹에 방문·앱설치가 집계되지 않음. 2월 일룸 팝업(아파트너 포함, 자사 페이지 랜딩)은 정상 트래킹으로 방문 3,709·앱설치 47 확보.');
insert into targetapp_stats (year,month,office,name,period,media,exp,clk,vis,inst,note) values (2026,1,'천호','신년 감사제','1.16~1.22',array['아파트너','바이비']::text[],289678,2949,941,26,null);
insert into targetapp_stats (year,month,office,name,period,media,exp,clk,vis,inst,note) values (2026,2,'천호','정토이즈 오픈','2.23~3.1',array['키즈노트']::text[],824958,2899,1599,4,null);
insert into targetapp_stats (year,month,office,name,period,media,exp,clk,vis,inst,note) values (2026,4,'천호','키즈북가든','3.26~4.5',array['키즈노트']::text[],689978,4525,1980,49,'키즈노트 단독 2회 비교 — 키즈북가든(앱설치 49) vs 정토이즈(앱설치 4). 콘텐츠 경쟁력이 전환을 결정.');
insert into targetapp_stats (year,month,office,name,period,media,exp,clk,vis,inst,note) values (2026,1,'설명절','백화점 설명절 선물세트','1.13~2.18',array['아파트너','바이비','키즈노트','리멤버','아파트아이','하이클래스']::text[],16273785,126848,67354,0,null);
insert into targetapp_stats (year,month,office,name,period,media,exp,clk,vis,inst,note) values (2026,2,'설명절','아울렛 설명절 선물세트','1.30~2.13',array['아파트너','바이비','아파트아이']::text[],1068988,8973,2781,56,'백화점·아울렛 시즌 통합 캠페인. 백화점은 6매체 대규모 노출(1,627만)·방문 67,354명 확보, 앱설치 0은 설명절 탐색 목적 방문 특성. 아울렛은 3매체로 아파트너+아파트아이 시너지(앱설치 56) — 아파트 거주층 주거형 소비 타겟 정밀 도달.');
insert into targetapp_stats (year,month,office,name,period,media,exp,clk,vis,inst,note) values (2026,3,'글로벌 뷰티테마','글로벌 뷰티테마','3.16~3.31',array['K-Ride']::text[],43715,2015,1202,0,null);
insert into targetapp_stats (year,month,office,name,period,media,exp,clk,vis,inst,note) values (2026,4,'글로벌 뷰티테마','글로벌 뷰티테마','4.6~4.28',array['K-Ride']::text[],55980,2331,949,0,'K-Ride 단독 클릭율 4%+ 유지. 외국인 방문객 인지·유입 전용 매체로 확정 — 웹페이지 랜딩 구조로 앱설치 KPI 적용 불가.');
insert into targetapp_stats (year,month,office,name,period,media,exp,clk,vis,inst,note) values (2026,1,'무역','미노띠 프로모션','1.23~1.31',array['아파트너','바이비','리멤버']::text[],490732,6656,2171,105,null);
insert into targetapp_stats (year,month,office,name,period,media,exp,clk,vis,inst,note) values (2026,3,'무역','All New Sports','3.18~3.31',array['아파트너','바이비','리멤버','카카오골프']::text[],1252033,8423,2583,102,'3월 카카오골프 추가로 노출 확장(490,732→1,252,033). 앱설치 105→102 유지. 카카오골프 단독 앱설치 50 기여.');
insert into targetapp_stats (year,month,office,name,period,media,exp,clk,vis,inst,note) values (2026,1,'목동','설명절 혜택 홍보','1.15~1.29',array['아파트너','바이비','리멤버']::text[],294929,2521,815,25,null);
insert into targetapp_stats (year,month,office,name,period,media,exp,clk,vis,inst,note) values (2026,2,'목동','액티브 그라운드 오픈','2.11~2.20',array['아파트너','바이비','리멤버']::text[],254203,2116,696,30,'방문 소폭 감소, 앱설치 25→30 증가. 시설 오픈형에서 탐색 후 전환 행동 확인.');
insert into targetapp_stats (year,month,office,name,period,media,exp,clk,vis,inst,note) values (2026,1,'MOKA','생각수장고 & 모카가든','1.23~2.8',array['키즈노트','하이클래스']::text[],4030804,21933,0,0,null);
insert into targetapp_stats (year,month,office,name,period,media,exp,clk,vis,inst,note) values (2026,3,'MOKA','신규 전시 ''세상의 눈''','3.13~3.24',array['아파트너','바이비','키즈노트']::text[],3259139,31468,13922,184,'1월 캠페인 방문·앱설치 0은 외부 전시 예약 페이지 랜딩으로 트래킹 미집계. 유사한 사례의 경우 홈페이지가 아닌 타 페이지(네이버 예약 등) 랜딩으로 인한 것으로, 노출·클릭은 정상 도달했으나 자사 트래킹에 방문·앱설치가 집계되지 않음. 3월 아파트너 추가 + 자사 페이지 랜딩 구조로 전환되며 방문 13,922·앱설치 184 확보.');
insert into targetapp_stats (year,month,office,name,period,media,exp,clk,vis,inst,note) values (2026,2,'미아','공룡 대발이 안전 어드벤처','1.28~2.8',array['키즈노트']::text[],699973,6978,2865,46,null);
insert into targetapp_stats (year,month,office,name,period,media,exp,clk,vis,inst,note) values (2026,4,'미아','벚꽃 베이커리 및 상상그라운드','3.27~4.5',array['아파트너','바이비','키즈노트']::text[],969175,3155,463,10,'2월 키즈노트 단독(앱설치 46) → 4월 3매체에도 앱설치 10 급감. IP 경쟁력 차이가 매체 조합보다 크게 작용.');
insert into targetapp_stats (year,month,office,name,period,media,exp,clk,vis,inst,note) values (2026,1,'도쿄장난감미술관','도쿄장난감미술관 예약 홍보','1.23~1.31',array['키즈노트']::text[],1899976,3692,0,0,null);
insert into targetapp_stats (year,month,office,name,period,media,exp,clk,vis,inst,note) values (2026,3,'도쿄장난감미술관','도쿄장난감미술관 키즈노트 입점','3.4~3.16',array['키즈노트']::text[],12933479,33751,0,0,'2회 모두 외부 예약 페이지(네이버 예약 등) 랜딩으로 자사 트래킹 미집계. 유사한 사례의 경우 홈페이지가 아닌 타 페이지(네이버 예약 등) 랜딩으로 인한 것으로, 노출·클릭은 정상 도달했으나 자사 트래킹에 방문·앱설치가 집계되지 않음.');
insert into targetapp_stats (year,month,office,name,period,media,exp,clk,vis,inst,note) values (2026,2,'웨딩페어','웨딩페어 1차','2.13~2.26',array['리멤버']::text[],132169,901,415,13,'리멤버 단독 집행으로 웨딩 시즌 직장인 타겟 도달. 클릭율 0.68%·앱설치 13. 결혼 준비층의 직장인 비중 고려한 매체 선정.');
insert into targetapp_stats (year,month,office,name,period,media,exp,clk,vis,inst,note) values (2026,1,'가든파이브','눈썰매장·클럽프렌즈 오픈','1.1~1.16',array['아파트너','바이비','키즈노트','리멤버']::text[],2136670,12291,5279,95,'4매체 혼합 앱설치 95. 아파트너(앱설치 49)가 전환 52% 담당.');
insert into targetapp_stats (year,month,office,name,period,media,exp,clk,vis,inst,note) values (2026,1,'울산','울산 키자니아GO 팝업','1.9~1.15',array['키즈노트']::text[],699965,4429,2330,28,'키즈노트 단독 클릭율 0.63%·앱설치 28. 키즈 IP 특화 단독 전환 가능성 확인.');
insert into targetapp_stats (year,month,office,name,period,media,exp,clk,vis,inst,note) values (2026,2,'신촌','EBS 윤윤구 입시설명회','2.13~2.23',array['아파트너','바이비']::text[],234860,1990,530,19,'소규모 노출 대비 클릭율 0.85%·앱설치 19. 교육 콘텐츠+아파트너 정밀 전환.');
insert into targetapp_stats (year,month,office,name,period,media,exp,clk,vis,inst,note) values (2026,2,'듀록돼지','듀록돼지 행사','2.27~3.7',array['아파트너','바이비']::text[],505256,7232,2311,49,'클릭율 1.43%·앱설치 49. 아파트너+바이비 2매체 전형적 조합 효율.');
insert into targetapp_stats (year,month,office,name,period,media,exp,clk,vis,inst,note) values (2026,3,'동대문','동대문점 10주년 행사','3.4~3.12',array['아파트너','바이비','리멤버']::text[],551574,7703,0,0,'클릭율 1.40%로 반응은 정상이나 방문·앱설치 0 — 유사한 사례의 경우 홈페이지가 아닌 타 페이지(네이버 예약 등) 랜딩으로 인한 것으로, 노출·클릭은 정상 도달했으나 자사 트래킹에 방문·앱설치가 집계되지 않음. 매체 조합은 검증된 구조이므로 다음 집행 시 자사 홈페이지 랜딩 + 트래킹 연동 필수.');
insert into targetapp_stats (year,month,office,name,period,media,exp,clk,vis,inst,note) values (2026,3,'H.Point','H.Point NCP 오픈 사전알림','3.9~3.20',array['아파트너','바이비']::text[],1076089,17299,5399,115,'클릭율 1.61%·앱설치 115. 아파트너 단독 앱설치 102(89%). 신규 오픈 사전알림 최고 효율.');
insert into targetapp_stats (year,month,office,name,period,media,exp,clk,vis,inst,note) values (2026,3,'알트원전시','ALT.1 신규 전시 ''렘브란트부터 고야까지''','3.10~3.19',array['아파트너','바이비','리멤버']::text[],1124580,18615,6064,161,'클릭율 1.66%·앱설치 161(3월 최고). 아파트너(111)+리멤버(29). 성인 전시에서 리멤버 전환 기여 확인.');
insert into targetapp_stats (year,month,office,name,period,media,exp,clk,vis,inst,note) values (2026,3,'가산','가산 키즈행사','3.10~3.20',array['키즈노트']::text[],1499941,6898,3063,67,'키즈노트 단독 앱설치 67. 강한 키즈 행사 콘텐츠로 단독 전환 확보.');
insert into targetapp_stats (year,month,office,name,period,media,exp,clk,vis,inst,note) values (2026,3,'골프페어','그린마스터페스타 2026','3.12~3.24',array['아파트너','바이비','카카오골프']::text[],2582843,24360,9154,233,'앱설치 233 (전 캠페인 최고). 카카오골프 단독 앱설치 151. 골프 타겟 카카오골프 압도적 효율.');
insert into targetapp_stats (year,month,office,name,period,media,exp,clk,vis,inst,note) values (2026,4,'더현대기프트','더현대기프트 오픈 홍보','3.27~4.23',array['아파트너','바이비','키즈노트','리멤버','아파트아이']::text[],2257314,16203,5234,117,'5매체 앱설치 117. 아파트아이 추가로 아파트 타겟 도달.');
insert into targetapp_stats (year,month,office,name,period,media,exp,clk,vis,inst,note) values (2026,4,'팝업페스타','더현대 팝업 페스타','3.27~4.5',array['아파트너','바이비','키즈노트','리멤버','K-Ride']::text[],2594826,29257,10553,199,'5매체 앱설치 199. 아파트너(앱설치 154·77%) 압도적. K-Ride 방문 393·앱설치 0.');
insert into targetapp_stats (year,month,office,name,period,media,exp,clk,vis,inst,note) values (2026,4,'더현대하이','더현대하이 오픈 홍보','4.6~4.26',array['아파트너','바이비','키즈노트','리멤버','아파트아이','하이클래스','에브리타임']::text[],23854769,67189,28809,0,'7매체 동시 집행. 노출 2,385만(전 캠페인 최다)·방문 28,809에도 앱설치 0 — 유사한 사례의 경우 홈페이지가 아닌 타 페이지(네이버 예약 등) 랜딩으로 인한 것으로, 노출·클릭은 정상 도달했으나 자사 트래킹에 방문·앱설치가 집계되지 않음. 자사 오픈 페이지 랜딩 + 앱 전환 트래킹 설정 후 재집행 필요.');
insert into targetapp_stats (year,month,office,name,period,media,exp,clk,vis,inst,note) values (2026,4,'와지트위크','와지트위크 신라호텔 파티','4.3~4.15',array['아파트너','바이비','데일리샷']::text[],1161435,18407,10543,0,'클릭율 1.58%·방문 10,543. 앱설치 0은 신라호텔 파티 예약 페이지 랜딩으로 자체 앱 전환 트래킹 미설정 추정. 유사한 사례의 경우 홈페이지가 아닌 타 페이지(네이버 예약 등) 랜딩으로 인한 것으로, 노출·클릭은 정상 도달했으나 자사 트래킹에 방문·앱설치가 집계되지 않음.');
insert into targetapp_stats (year,month,office,name,period,media,exp,clk,vis,inst,note) values (2026,4,'압구정본점','압구정본점 룰루레몬 팝업','4.23~4.30',array['카카오골프']::text[],1216115,1832,194,0,'카카오골프 단독 집행. 방문 194·앱설치 0. 럭셔리 팝업 타겟 — 인지 목적.');

-- ── 매체별 누적 ('26.1~4월) ──
insert into targetapp_media (name,grp,role,exp,clk,vis,inst,cam,basis) values ('아파트너','아파트앱','전환 핵심',23151959,260021,106238,1149,31,'''26.1~4월 누적');
insert into targetapp_media (name,grp,role,exp,clk,vis,inst,cam,basis) values ('바이비','아파트앱','반응 유도',2635447,46191,23354,222,31,'''26.1~4월 누적');
insert into targetapp_media (name,grp,role,exp,clk,vis,inst,cam,basis) values ('아파트아이','아파트앱','유입 확장',3375120,15971,8794,15,4,'''26.1~4월 누적');
insert into targetapp_media (name,grp,role,exp,clk,vis,inst,cam,basis) values ('키즈노트','키즈앱','유입 확장',57210262,194985,68058,533,29,'''26.1~4월 누적');
insert into targetapp_media (name,grp,role,exp,clk,vis,inst,cam,basis) values ('하이클래스','키즈앱','유입 확장',21914467,31357,10965,8,4,'''26.1~4월 누적');
insert into targetapp_media (name,grp,role,exp,clk,vis,inst,cam,basis) values ('리멤버','직장인앱','반응 유도',3461639,54885,10247,214,13,'''26.1~4월 누적');
insert into targetapp_media (name,grp,role,exp,clk,vis,inst,cam,basis) values ('에브리타임','대학생앱','타겟 특화',1020123,930,391,0,1,'''26.1~4월 누적');
insert into targetapp_media (name,grp,role,exp,clk,vis,inst,cam,basis) values ('카카오골프','취향앱','타겟 특화',4076528,20231,7051,201,3,'''26.1~4월 누적');
insert into targetapp_media (name,grp,role,exp,clk,vis,inst,cam,basis) values ('데일리샷','취향앱','타겟 특화',120480,2376,1836,0,1,'''26.1~4월 누적');
insert into targetapp_media (name,grp,role,exp,clk,vis,inst,cam,basis) values ('K-Ride','글로벌앱','방한 외국인',124425,5300,2544,0,3,'''26.1~4월 누적');
