# BTC Trading

비트코인 선물 자동매매 웹앱. ByBit, OKX, Binance 세 거래소를 지원하며 지정가/BBO 주문, TP/SL/Close 자동 설정, 포지션 및 거래 히스토리 조회 기능을 제공한다.

## 기술 스택

- **Next.js 16** (App Router)
- **TypeScript**
- **Tailwind CSS v4**
- **ccxt** — 거래소 API 추상화
- **Supabase** — 인증(Auth) + DB(PostgreSQL)

## 시작하기

### 환경 변수

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

### Supabase DB 설정

`supabase/schema.sql`을 Supabase SQL Editor에서 실행한다.

### 개발 서버 실행

```bash
npm install
npm run dev
```

[http://localhost:3000](http://localhost:3000) 접속.

## 주요 기능

### 거래 실행 (`/`)

- 등록된 거래소 중 하나를 선택하면 USDT 잔액과 현재 포지션을 표시
- 롱/숏, 레버리지, 진입가(또는 BBO), USDT 증거금 입력
- TP/SL/Close 가격 설정 — 직접 입력 또는 진입가 대비 %(3/5/10%) 선택
- 거래소 공개 WebSocket으로 BTC 마크 프라이스 실시간 수신 (5초 스로틀)

### 포지션 (`/positions`)

- API 키가 등록된 거래소만 표시
- 거래소별 오픈 포지션 병렬 조회
- 방향, 진입가, 수량, 증거금, 레버리지, 마진모드, 미실현 PnL, 수익률 표시
- 전체 미실현 손익 합계 표시

### 거래 히스토리 (`/history`)

- 거래소, 롱/숏, 날짜 범위 필터
- 진입가, 종료가, 수량, PnL, 수익률, 레버리지 표시

### 설정 (`/settings`)

- 거래소별 API 키(Key/Secret/Passphrase) 등록 및 삭제
- 테스트넷 모드 지원

## 인증

Supabase Auth 기반. 미로그인 상태에서 모든 경로는 `/login`으로 리다이렉트된다.
