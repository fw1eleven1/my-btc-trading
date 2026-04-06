import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createExchangeInstance, getSymbol, type ExchangeId as Exchange } from '@/lib/exchange'

export const dynamic = 'force-dynamic'

const VALID_EXCHANGES: Exchange[] = ['bybit', 'okx', 'binance']
const POLL_INTERVAL_MS = 2000
const MAX_DURATION_MS = 10 * 60 * 1000 // 최대 10분

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const orderId = searchParams.get('orderId')
  const exchange = searchParams.get('exchange') as Exchange | null

  if (!orderId || !exchange || !VALID_EXCHANGES.includes(exchange)) {
    return NextResponse.json({ error: '잘못된 파라미터입니다.' }, { status: 400 })
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
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
        } catch {
          // controller가 이미 닫힌 경우 무시
        }
      }

      let done = false
      const startTime = Date.now()
      let errorCount = 0

      request.signal.addEventListener('abort', () => { done = true })

      const sleep = (ms: number) =>
        new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, ms)
          request.signal.addEventListener('abort', () => { clearTimeout(timer); resolve() })
        })

      while (!done && Date.now() - startTime < MAX_DURATION_MS) {
        try {
          const order = await ex.fetchOrder(orderId, symbol)
          errorCount = 0

          if (order.status === 'closed') {
            send({ status: 'filled', filledPrice: order.average ?? order.price })
            break
          } else if (
            order.status === 'canceled' ||
            order.status === 'rejected' ||
            order.status === 'expired'
          ) {
            send({ status: 'cancelled' })
            break
          } else {
            // 'open' — 미체결
            send({ status: 'open', filled: order.filled ?? 0, remaining: order.remaining ?? 0 })
          }
        } catch {
          errorCount++
          if (errorCount >= 5) {
            send({ status: 'error' })
            break
          }
        }

        await sleep(POLL_INTERVAL_MS)
      }

      try { controller.close() } catch { /* 이미 닫힌 경우 무시 */ }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
