import { createClient } from '@/lib/supabase/server'
import Navbar from '@/components/Navbar'
import TradingClient from './TradingClient'

export const dynamic = 'force-dynamic'

type Exchange = 'bybit' | 'okx' | 'binance'

export default async function HomePage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: keys } = await supabase
    .from('exchange_api_keys')
    .select('exchange')
    .eq('user_id', user?.id ?? '')

  const registeredExchanges: Exchange[] = (keys ?? []).map(
    (row: { exchange: string }) => row.exchange as Exchange
  )

  return (
    <div style={{ backgroundColor: '#0f0f0f', minHeight: '100vh' }}>
      <Navbar userEmail={user?.email} />
      <TradingClient registeredExchanges={registeredExchanges} />
    </div>
  )
}
