import { createClient } from '@/lib/supabase/server'
import Navbar from '@/components/Navbar'
import SettingsClient from './SettingsClient'

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: existingKeys } = await supabase
    .from('exchange_api_keys')
    .select('exchange, api_key, passphrase, is_testnet')

  type ExchangeRow = {
    exchange: string
    api_key: string
    passphrase: string | null
    is_testnet: boolean
  }

  const keyMap: Record<
    string,
    { apiKeyMasked: string; hasSecret: boolean; hasPassphrase: boolean; isTestnet: boolean }
  > = {}

  if (existingKeys) {
    for (const row of existingKeys as ExchangeRow[]) {
      keyMap[row.exchange] = {
        apiKeyMasked: row.api_key.slice(0, 8),
        hasSecret: true,
        hasPassphrase: !!row.passphrase,
        isTestnet: row.is_testnet,
      }
    }
  }

  return (
    <div style={{ backgroundColor: '#0f0f0f', minHeight: '100vh' }}>
      <Navbar userEmail={user?.email} />

      <main className="max-w-3xl mx-auto px-6 py-10 space-y-4">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold text-white">거래소 API 설정</h1>
          <p style={{ color: '#888888' }} className="text-sm">
            거래소 API 키를 등록하면 자동매매 기능을 이용할 수 있습니다.
          </p>
        </div>

        <SettingsClient initialKeyMap={keyMap} />
      </main>
    </div>
  )
}
