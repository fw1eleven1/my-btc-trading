import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const exchange = searchParams.get('exchange')
  const side = searchParams.get('side')
  const from = searchParams.get('from')
  const to = searchParams.get('to')

  let query = supabase
    .from('trade_history')
    .select('id, exchange, side, leverage, entry_price, exit_price, btc_qty, pnl, tp_price, sl_price, close_price, order_id, status, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (exchange) query = query.eq('exchange', exchange)
  if (side) query = query.eq('side', side)
  if (from) query = query.gte('created_at', from)
  if (to) {
    // to 날짜 포함을 위해 다음날 00:00 미만으로 설정
    const toDate = new Date(to)
    toDate.setDate(toDate.getDate() + 1)
    query = query.lt('created_at', toDate.toISOString())
  }

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: data ?? [] })
}
