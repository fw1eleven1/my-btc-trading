import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createExchangeInstance, getSymbol, type ExchangeId as Exchange } from '@/lib/exchange'

export const dynamic = 'force-dynamic'

interface TradePayload {
  exchange: Exchange
  side: 'long' | 'short'
  leverage: number
  entryPrice: number | null
  amount: number // USDT 증거금
  tp?: number | null
  sl?: number | null
  closePrice?: number | null
  tpPct?: number | null
  slPct?: number | null
  closePct?: number | null
  postOnly?: boolean
  bbo?: boolean
}

// percent는 증거금 대비 수익률(%) — 실제 가격 변동 = percent / leverage
function calcPriceFromPercent(entry: number, percent: number, direction: 'above' | 'below', leverage: number): number {
  const move = percent / 100 / leverage
  return direction === 'above' ? entry * (1 + move) : entry * (1 - move)
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  }

  let body: TradePayload
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 })
  }

  const { exchange, side, leverage, amount, tpPct, slPct, closePct, postOnly, bbo } = body
  let { entryPrice, tp, sl, closePrice } = body

  if (!exchange || !side || !leverage || (!entryPrice && !bbo) || !amount) {
    return NextResponse.json({ error: '필수 항목이 누락되었습니다.' }, { status: 400 })
  }

  const { data: keyRow } = await supabase
    .from('exchange_api_keys')
    .select('api_key, api_secret, passphrase, is_testnet')
    .eq('user_id', user.id)
    .eq('exchange', exchange)
    .single()

  if (!keyRow) {
    return NextResponse.json(
      { error: '해당 거래소의 API 키가 등록되지 않았습니다.' },
      { status: 404 }
    )
  }

  const ex = createExchangeInstance(exchange, {
    apiKey: keyRow.api_key,
    apiSecret: keyRow.api_secret,
    passphrase: keyRow.passphrase,
    isTestnet: keyRow.is_testnet,
  })

  const symbol = getSymbol(exchange)
  const ccxtSide = side === 'long' ? 'buy' : 'sell'
  const closeSide = side === 'long' ? 'sell' : 'buy'

  const hasNewTpSlClose = !!(tp || sl || closePrice)

  const placedOrderIds: string[] = []

  try {
    // ─── BBO: 최우선호가 조회 ────────────────────────────────────────
    if (bbo) {
      const ob = await ex.fetchOrderBook(symbol, 1)
      // Long → 최우선 매수호가(bid)에 주문 (메이커, 호가창 1위)
      // Short → 최우선 매도호가(ask)에 주문 (메이커, 호가창 1위)
      const rawPrice = side === 'long' ? ob.bids[0]?.[0] : ob.asks[0]?.[0]
      entryPrice = rawPrice != null ? Number(rawPrice) : null
      if (!entryPrice) {
        return NextResponse.json({ error: 'BBO 호가 조회 실패: 호가창이 비어 있습니다.' }, { status: 500 })
      }

      // BBO 가격 확정 후 % → 절대가 계산
      const tpDir = side === 'long' ? 'above' : 'below'
      const slDir = side === 'long' ? 'below' : 'above'
      if (tpPct) tp = calcPriceFromPercent(entryPrice, tpPct, tpDir, leverage)
      if (slPct) sl = calcPriceFromPercent(entryPrice, slPct, slDir, leverage)
      if (closePct) closePrice = calcPriceFromPercent(entryPrice, closePct, tpDir, leverage)
    }

    // BTC 수량 = (USDT 증거금 × 레버리지) / 진입가  (BBO면 위에서 확정된 가격 사용)
    const btcQty = (amount * leverage) / entryPrice!

    try {
      await ex.setLeverage(leverage, symbol)
    } catch (err) {
      // ByBit retCode 110043: 이미 동일한 레버리지 설정됨 — 무시
      const msg = err instanceof Error ? err.message : ''
      if (!msg.includes('110043')) throw err
    }

    // ─── 0. 같은 방향 기존 포지션 확인 → TP/SL/Close 교체 처리 ──────
    if (hasNewTpSlClose) {
      try {
        const existingPositions = await ex.fetchPositions([symbol])
        const hasSamePos = existingPositions.some(
          (p) => p.side === side && Math.abs(Number(p.contracts ?? 0)) > 0
        )

        if (hasSamePos) {
          // 기존 reduce-only 주문(Close) 및 조건부 TP/SL 주문 취소
          const openOrders = await ex.fetchOpenOrders(symbol)
          const toCancel = openOrders.filter(
            (o) =>
              o.reduceOnly === true ||
              o.type === 'take_profit' ||
              o.type === 'take_profit_market' ||
              o.type === 'stop' ||
              o.type === 'stop_market'
          )
          await Promise.all(
            toCancel.map((o) => ex.cancelOrder(o.id, symbol).catch(() => {}))
          )

          // ByBit: 포지션 레벨 TP/SL도 초기화 (새 주문의 inline 값으로 덮어씌워짐)
          // OKX/Binance: 위 cancel로 처리됨
        }
      } catch {
        // 포지션 확인/취소 실패 시 non-fatal — 계속 진행
      }
    }

    // ─── 1. 진입 주문 (TP/SL 인라인 지원 거래소는 params에 포함) ───
    const entryParams: Record<string, unknown> = {}
    if (tp) entryParams.takeProfit = tp
    if (sl) entryParams.stopLoss = sl
    if (postOnly) entryParams.postOnly = true

    // ByBit: 헤지 모드 여부에 따라 positionIdx 설정
    if (exchange === 'bybit') {
      try {
        const modeResult = await (ex as unknown as { fetchPositionMode: (s: string) => Promise<{ hedged: boolean }> }).fetchPositionMode(symbol)
        if (modeResult.hedged) {
          const idx = side === 'long' ? 1 : 2
          entryParams.positionIdx = idx
        } else {
          entryParams.positionIdx = 0
        }
      } catch {
        // 조회 실패 시 헤지 모드로 가정
        entryParams.positionIdx = side === 'long' ? 1 : 2
      }
    }

    const entryOrder = await ex.createOrder(
      symbol, 'limit', ccxtSide, btcQty, entryPrice!, entryParams
    )
    placedOrderIds.push(entryOrder.id)

    // ─── 2. 히스토리 저장 (Close 주문은 체결 후 order-fill에서 실행) ──
    await supabase.from('trade_history').insert({
      user_id: user.id,
      exchange,
      side,
      leverage,
      entry_price: entryPrice,
      amount,
      btc_qty: btcQty,
      tp_price: tp ?? null,
      sl_price: sl ?? null,
      close_price: closePrice ?? null,
      order_id: entryOrder.id,
      status: 'open',
    })

    return NextResponse.json({ success: true, orderId: entryOrder.id, placedOrderIds })
  } catch (err) {
    const message = err instanceof Error ? err.message : '거래 실행 실패'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
