import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createExchangeInstance, getSymbol, type ExchangeId as Exchange } from '@/lib/exchange'

export const dynamic = 'force-dynamic'

const VALID_EXCHANGES: Exchange[] = ['bybit', 'okx', 'binance']
const POLL_INTERVAL_MS = 5_000
const MAX_DURATION_MS = 24 * 60 * 60 * 1000 // 24시간

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const exchange = searchParams.get('exchange') as Exchange | null
  const side = searchParams.get('side') as 'long' | 'short' | null

  if (!exchange || !VALID_EXCHANGES.includes(exchange) || !side || !['long', 'short'].includes(side)) {
    return NextResponse.json({ error: '잘못된 파라미터입니다.' }, { status: 400 })
  }

  const { data: keyRow } = await supabase
    .from('exchange_api_keys')
    .select('api_key, api_secret, passphrase, is_testnet')
    .eq('user_id', user.id)
    .eq('exchange', exchange)
    .single()

  if (!keyRow) {
    return NextResponse.json({ error: '해당 거래소의 API 키가 등록되지 않았습니다.' }, { status: 404 })
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
        } catch { /* controller 닫힘 */ }
      }

      let done = false
      let errorCount = 0
      const startTime = Date.now()

      request.signal.addEventListener('abort', () => { done = true })

      const sleep = (ms: number) =>
        new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, ms)
          request.signal.addEventListener('abort', () => { clearTimeout(timer); resolve() })
        })

      while (!done && Date.now() - startTime < MAX_DURATION_MS) {
        try {
          const positions = await ex.fetchPositions([symbol])
          errorCount = 0

          const open = positions.find(
            (p) => p.side === side && (p.contracts ?? 0) > 0
          )

          if (!open) {
            send({ status: 'closed' })
            break
          }

          send({ status: 'open' })
        } catch {
          errorCount++
          // 연속 5회 실패 시 클라이언트에 알림 (클라이언트가 재연결 판단)
          if (errorCount >= 5) {
            send({ status: 'error' })
            break
          }
        }

        await sleep(POLL_INTERVAL_MS)
      }

      try { controller.close() } catch { /* 이미 닫힘 */ }
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
