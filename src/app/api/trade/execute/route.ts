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
  postOnly?: boolean
  bbo?: boolean
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

  const { exchange, side, leverage, amount, tp, sl, closePrice, postOnly, bbo } = body
  let { entryPrice } = body

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
      entryPrice = side === 'long'
        ? ob.bids[0]?.[0]
        : ob.asks[0]?.[0]
      if (!entryPrice) {
        return NextResponse.json({ error: 'BBO 호가 조회 실패: 호가창이 비어 있습니다.' }, { status: 500 })
      }
    }

    // BTC 수량 = (USDT 증거금 × 레버리지) / 진입가  (BBO면 위에서 확정된 가격 사용)
    const btcQty = (amount * leverage) / entryPrice!

    await ex.setLeverage(leverage, symbol)

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

    const entryOrder = await ex.createOrder(
      symbol, 'limit', ccxtSide, btcQty, entryPrice!, entryParams
    )
    placedOrderIds.push(entryOrder.id)

    // ─── 2. Close — reduce-only 지정가 주문 ───────────────────────
    if (closePrice) {
      const closeOrder = await ex.createOrder(
        symbol, 'limit', closeSide, btcQty, closePrice,
        { reduceOnly: true }
      )
      placedOrderIds.push(closeOrder.id)
    }

    // ─── 3. 히스토리 저장 ─────────────────────────────────────────
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
