# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
npm run dev      # 개발 서버 (Next.js)
npm run build    # 프로덕션 빌드
npm run lint     # ESLint
```

테스트 파일 없음. 빌드로 타입 오류를 확인한다.

## Architecture

BTC 선물 자동매매 웹앱. Next.js 16 App Router + Supabase Auth + ccxt.

### 페이지 구조

모든 보호된 경로는 `src/middleware.ts`에서 Supabase 세션을 확인해 `/login`으로 리다이렉트한다.

각 페이지는 **Server Component(page.tsx) + Client Component(\*Client.tsx)** 패턴을 따른다. Server Component에서 Supabase 세션/초기 데이터를 조회하고 Client Component에 prop으로 전달한다.

| 경로 | 역할 |
|------|------|
| `/` | 거래 실행 (거래소 선택 → 잔액/포지션 조회 → 주문) |
| `/positions` | 등록된 거래소별 오픈 포지션 전체 조회 |
| `/history` | 거래 히스토리 (거래소/방향/날짜 필터) |
| `/settings` | 거래소 API 키 등록/삭제 |

### API Routes (`src/app/api/`)

모든 라우트는 서버에서 Supabase 인증을 재검증한다. ccxt 인스턴스는 요청마다 생성한다(싱글턴 없음).

- `GET /api/trade/balance?exchange=` — USDT 가용 잔액
- `GET /api/trade/positions?exchange=` — 오픈 포지션 (contracts > 0 필터)
- `POST /api/trade/execute` — 주문 실행 (레버리지 설정 → BBO/지정가 → TP/SL/Close)
- `GET|POST|DELETE /api/settings/exchange-keys` — API 키 CRUD
- `GET /api/history` — 거래 히스토리 조회
- `POST /api/trade/margin-mode` — 마진 모드 변경
- `GET /api/trade/order-fill` — 주문 체결 여부 확인

### 핵심 유틸리티

**`src/lib/exchange.ts`** — ccxt 인스턴스 팩토리.
- `createExchangeInstance(exchange, credentials)` : bybit(linear), okx(swap), binanceusdm 인스턴스 반환
- `getSymbol(exchange)` : 모든 거래소 `'BTC/USDT:USDT'` 반환 (선물 심볼)

**`src/hooks/useBtcMarkPrice.ts`** — 거래소별 공개 WebSocket으로 BTC 마크 프라이스 수신. React 상태는 5초 스로틀로 업데이트해 리렌더를 최소화한다.

### Supabase

- `src/lib/supabase/server.ts` — Server Component/Route Handler용 (`@supabase/ssr`)
- `src/lib/supabase/client.ts` — Client Component용

**테이블**:
- `exchange_api_keys` — `(user_id, exchange)` unique. `api_secret`은 API로 절대 반환하지 않음(앞 8자리만 노출)
- `trade_history` — 주문 실행 시 `status='open'`으로 insert. `exit_price`, `pnl`은 별도 업데이트

두 테이블 모두 RLS 활성화 — `auth.uid() = user_id` 정책.

### 주문 실행 흐름 (`/api/trade/execute`)

1. 레버리지 설정 (`ex.setLeverage`)
2. BBO 옵션이면 오더북에서 최우선 호가 조회
3. 진입 주문 생성 (TP/SL은 ccxt params 인라인)
4. Close 가격이 있으면 reduce-only 지정가 주문 추가
5. `trade_history` insert

기존 포지션이 있고 새 TP/SL/Close를 설정하는 경우, 기존 reduce-only/조건부 주문을 먼저 일괄 취소한다.
