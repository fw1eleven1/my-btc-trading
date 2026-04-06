import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createExchangeInstance, getSymbol, type ExchangeId as Exchange } from '@/lib/exchange'

export const dynamic = 'force-dynamic'

const VALID_EXCHANGES: Exchange[] = ['bybit', 'okx', 'binance']

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  }

  let body: { exchange: Exchange; orderId: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 })
  }

  const { exchange, orderId } = body

  if (!exchange || !VALID_EXCHANGES.includes(exchange) || !orderId) {
    return NextResponse.json({ error: '유효하지 않은 파라미터입니다.' }, { status: 400 })
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

  try {
    const ex = createExchangeInstance(exchange, {
      apiKey: keyRow.api_key,
      apiSecret: keyRow.api_secret,
      passphrase: keyRow.passphrase,
      isTestnet: keyRow.is_testnet,
    })

    const symbol = getSymbol(exchange)
    await ex.cancelOrder(orderId, symbol)

    return NextResponse.json({ success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : '주문 취소 실패'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
