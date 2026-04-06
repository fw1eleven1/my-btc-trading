'use client'

import { useState } from 'react'
import ExchangeKeyForm from '@/components/ExchangeKeyForm'

type Exchange = 'bybit' | 'okx' | 'binance'

interface ExchangeKeyData {
  apiKey: string
  apiSecret: string
  passphrase: string
  isTestnet: boolean
}

interface KeyInfo {
  apiKeyMasked: string
  hasSecret: boolean
  hasPassphrase: boolean
  isTestnet: boolean
}

interface SettingsClientProps {
  initialKeyMap: Record<string, KeyInfo>
}

const EXCHANGES: { id: Exchange; label: string }[] = [
  { id: 'bybit', label: 'ByBit' },
  { id: 'okx', label: 'OKX' },
  { id: 'binance', label: 'Binance' },
]

export default function SettingsClient({ initialKeyMap }: SettingsClientProps) {
  const [keyMap, setKeyMap] = useState(initialKeyMap)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null)

  function showToast(message: string, type: 'success' | 'error' | 'info') {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  async function handleSave(exchange: Exchange, data: ExchangeKeyData) {
    const response = await fetch('/api/settings/exchange-keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        exchange,
        apiKey: data.apiKey,
        apiSecret: data.apiSecret,
        passphrase: data.passphrase || null,
        isTestnet: data.isTestnet,
      }),
    })

    if (!response.ok) {
      const body = await response.json().catch(() => ({}))
      throw new Error(body.error ?? '저장 실패')
    }

    setKeyMap((prev) => ({
      ...prev,
      [exchange]: {
        apiKeyMasked: data.apiKey.slice(0, 8),
        hasSecret: true,
        hasPassphrase: !!data.passphrase,
        isTestnet: data.isTestnet,
      },
    }))

    showToast(`${exchange.toUpperCase()} API 키가 저장되었습니다.`, 'success')
  }

  function handleTest(exchange: Exchange) {
    showToast(`${exchange.toUpperCase()} 연결 테스트 기능은 준비 중입니다.`, 'info')
  }

  const toastColors: Record<string, { bg: string; text: string; border: string }> = {
    success: { bg: '#1a3a1a', text: '#4ade80', border: '#166534' },
    error: { bg: '#3a1a1a', text: '#f87171', border: '#7f1d1d' },
    info: { bg: '#1a2a3a', text: '#60a5fa', border: '#1e3a5f' },
  }

  return (
    <div className="space-y-4">
      {/* Toast 알림 */}
      {toast && (
        <div
          style={{
            backgroundColor: toastColors[toast.type].bg,
            color: toastColors[toast.type].text,
            border: `1px solid ${toastColors[toast.type].border}`,
            position: 'fixed',
            top: '24px',
            right: '24px',
            zIndex: 50,
          }}
          className="px-5 py-3 rounded-lg text-sm font-medium shadow-lg"
        >
          {toast.message}
        </div>
      )}

      {/* 거래소별 폼 */}
      {EXCHANGES.map(({ id, label }) => (
        <ExchangeKeyForm
          key={id}
          exchange={id}
          exchangeLabel={label}
          initialData={keyMap[id]}
          onSave={handleSave}
          onTest={handleTest}
        />
      ))}
    </div>
  )
}
