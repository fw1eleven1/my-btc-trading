import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

type Exchange = 'bybit' | 'okx' | 'binance'

interface ExchangeKeyPayload {
  exchange: Exchange
  apiKey: string
  apiSecret: string
  passphrase?: string | null
  isTestnet?: boolean
}

export async function GET() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('exchange_api_keys')
    .select('id, exchange, api_key, passphrase, is_testnet, created_at, updated_at')
    .eq('user_id', user.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // api_key 앞 8자리만 반환
  const masked = (data ?? []).map((row) => ({
    ...row,
    api_key: row.api_key.slice(0, 8),
    api_secret: undefined,
  }))

  return NextResponse.json({ data: masked })
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  }

  let body: ExchangeKeyPayload

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 })
  }

  const { exchange, apiKey, apiSecret, passphrase, isTestnet } = body

  if (!exchange || !apiKey || !apiSecret) {
    return NextResponse.json(
      { error: 'exchange, apiKey, apiSecret은 필수입니다.' },
      { status: 400 }
    )
  }

  const validExchanges: Exchange[] = ['bybit', 'okx', 'binance']
  if (!validExchanges.includes(exchange)) {
    return NextResponse.json({ error: '지원하지 않는 거래소입니다.' }, { status: 400 })
  }

  const { error } = await supabase.from('exchange_api_keys').upsert(
    {
      user_id: user.id,
      exchange,
      api_key: apiKey,
      api_secret: apiSecret,
      passphrase: passphrase ?? null,
      is_testnet: isTestnet ?? false,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,exchange' }
  )

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const exchange = searchParams.get('exchange') as Exchange | null

  if (!exchange) {
    return NextResponse.json({ error: 'exchange 파라미터가 필요합니다.' }, { status: 400 })
  }

  const { error } = await supabase
    .from('exchange_api_keys')
    .delete()
    .eq('user_id', user.id)
    .eq('exchange', exchange)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
