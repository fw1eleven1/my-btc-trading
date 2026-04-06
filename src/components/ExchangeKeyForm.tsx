'use client'

import { useState } from 'react'

type Exchange = 'bybit' | 'okx' | 'binance'

interface ExchangeKeyData {
  apiKey: string
  apiSecret: string
  passphrase: string
  isTestnet: boolean
}

interface ExchangeKeyFormProps {
  exchange: Exchange
  exchangeLabel: string
  initialData?: {
    apiKeyMasked?: string
    hasSecret?: boolean
    hasPassphrase?: boolean
    isTestnet?: boolean
  }
  onSave: (exchange: Exchange, data: ExchangeKeyData) => Promise<void>
  onTest: (exchange: Exchange) => void
}

export default function ExchangeKeyForm({
  exchange,
  exchangeLabel,
  initialData,
  onSave,
  onTest,
}: ExchangeKeyFormProps) {
  const [apiKey, setApiKey] = useState('')
  const [apiSecret, setApiSecret] = useState('')
  const [passphrase, setPassphrase] = useState('')
  const [isTestnet, setIsTestnet] = useState(initialData?.isTestnet ?? false)
  const [showApiKey, setShowApiKey] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState<{
    type: 'success' | 'error'
    text: string
  } | null>(null)

  async function handleSave() {
    if (!apiKey.trim() || !apiSecret.trim()) {
      setSaveMessage({ type: 'error', text: 'API Key와 Secret을 입력해주세요.' })
      return
    }
    if (exchange === 'okx' && !passphrase.trim()) {
      setSaveMessage({ type: 'error', text: 'OKX는 Passphrase가 필요합니다.' })
      return
    }

    setIsSaving(true)
    setSaveMessage(null)

    try {
      await onSave(exchange, { apiKey, apiSecret, passphrase, isTestnet })
      setSaveMessage({ type: 'success', text: '저장되었습니다.' })
      setApiKey('')
      setApiSecret('')
      setPassphrase('')
    } catch {
      setSaveMessage({ type: 'error', text: '저장에 실패했습니다.' })
    } finally {
      setIsSaving(false)
    }
  }

  const inputStyle = {
    backgroundColor: '#252525',
    border: '1px solid #333333',
    color: '#ffffff',
  }

  const labelStyle = {
    color: '#888888',
  }

  return (
    <div
      style={{ backgroundColor: '#1a1a1a', border: '1px solid #252525' }}
      className="rounded-xl p-6 space-y-5"
    >
      <div className="flex items-center gap-3">
        <h2 className="text-lg font-semibold text-white">{exchangeLabel}</h2>
        {initialData?.apiKeyMasked && (
          <span
            style={{
              backgroundColor: '#1a3a1a',
              color: '#4ade80',
              border: '1px solid #166534',
            }}
            className="text-xs px-2 py-0.5 rounded-full"
          >
            연결됨: {initialData.apiKeyMasked}...
          </span>
        )}
      </div>

      {/* API Key */}
      <div className="space-y-1.5">
        <label style={labelStyle} className="text-sm block">
          API Key
        </label>
        <div className="relative">
          <input
            type={showApiKey ? 'text' : 'password'}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={
              initialData?.apiKeyMasked
                ? `현재: ${initialData.apiKeyMasked}...`
                : 'API Key 입력'
            }
            style={inputStyle}
            className="w-full px-4 py-2.5 rounded-md text-sm pr-10 outline-none focus:ring-1 focus:ring-yellow-500 placeholder-gray-600"
          />
          <button
            type="button"
            onClick={() => setShowApiKey(!showApiKey)}
            style={{ color: '#888888' }}
            className="absolute right-3 top-1/2 -translate-y-1/2 hover:text-white transition-colors"
            aria-label={showApiKey ? 'API Key 숨기기' : 'API Key 보기'}
          >
            {showApiKey ? (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                fill="currentColor"
                viewBox="0 0 16 16"
              >
                <path d="M13.359 11.238C15.06 9.72 16 8 16 8s-3-5.5-8-5.5a7.028 7.028 0 0 0-2.79.588l.77.771A5.944 5.944 0 0 1 8 3.5c2.12 0 3.879 1.168 5.168 2.457A13.134 13.134 0 0 1 14.828 8c-.058.087-.122.183-.195.288-.335.48-.83 1.12-1.465 1.755-.165.165-.337.328-.517.486z" />
                <path d="M11.297 9.176a3.5 3.5 0 0 0-4.474-4.474l.823.823a2.5 2.5 0 0 1 2.829 2.829zm-2.943 1.299.822.822a3.5 3.5 0 0 1-4.474-4.474l.823.823a2.5 2.5 0 0 0 2.829 2.829" />
                <path d="M3.35 5.47c-.18.16-.353.322-.518.487A13.134 13.134 0 0 0 1.172 8l.195.288c.335.48.83 1.12 1.465 1.755C4.121 11.332 5.881 12.5 8 12.5c.716 0 1.39-.133 2.02-.36l.77.772A7.029 7.029 0 0 1 8 13.5C3 13.5 0 8 0 8s.939-1.721 2.641-3.238l.708.709zm10.296 8.884-12-12 .708-.708 12 12-.708.708z" />
              </svg>
            ) : (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                fill="currentColor"
                viewBox="0 0 16 16"
              >
                <path d="M16 8s-3-5.5-8-5.5S0 8 0 8s3 5.5 8 5.5S16 8 16 8M1.173 8a13.133 13.133 0 0 1 1.66-2.043C4.12 4.668 5.88 3.5 8 3.5c2.12 0 3.879 1.168 5.168 2.457A13.133 13.133 0 0 1 14.828 8c-.058.087-.122.183-.195.288-.335.48-.83 1.12-1.465 1.755C11.879 11.332 10.119 12.5 8 12.5c-2.12 0-3.879-1.168-5.168-2.457A13.134 13.134 0 0 1 1.172 8z" />
                <path d="M8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5M4.5 8a3.5 3.5 0 1 1 7 0 3.5 3.5 0 0 1-7 0" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* API Secret */}
      <div className="space-y-1.5">
        <label style={labelStyle} className="text-sm block">
          API Secret
        </label>
        <input
          type="password"
          value={apiSecret}
          onChange={(e) => setApiSecret(e.target.value)}
          placeholder={
            initialData?.hasSecret ? '저장됨 (변경하려면 입력)' : 'API Secret 입력'
          }
          style={inputStyle}
          className="w-full px-4 py-2.5 rounded-md text-sm outline-none focus:ring-1 focus:ring-yellow-500 placeholder-gray-600"
        />
      </div>

      {/* Passphrase (OKX 전용) */}
      {exchange === 'okx' && (
        <div className="space-y-1.5">
          <label style={labelStyle} className="text-sm block">
            Passphrase <span style={{ color: '#f7a600' }}>*</span>
          </label>
          <input
            type="password"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            placeholder={
              initialData?.hasPassphrase
                ? '저장됨 (변경하려면 입력)'
                : 'Passphrase 입력'
            }
            style={inputStyle}
            className="w-full px-4 py-2.5 rounded-md text-sm outline-none focus:ring-1 focus:ring-yellow-500 placeholder-gray-600"
          />
        </div>
      )}

      {/* Testnet 체크박스 */}
      <div className="flex items-center gap-3">
        <input
          id={`${exchange}-testnet`}
          type="checkbox"
          checked={isTestnet}
          onChange={(e) => setIsTestnet(e.target.checked)}
          className="w-4 h-4 rounded accent-yellow-500 cursor-pointer"
        />
        <label
          htmlFor={`${exchange}-testnet`}
          style={labelStyle}
          className="text-sm cursor-pointer select-none"
        >
          Testnet 사용
        </label>
      </div>

      {/* 저장 메시지 */}
      {saveMessage && (
        <p
          style={{
            color: saveMessage.type === 'success' ? '#4ade80' : '#f87171',
          }}
          className="text-sm"
        >
          {saveMessage.text}
        </p>
      )}

      {/* 버튼 영역 */}
      <div className="flex gap-3 pt-1">
        <button
          onClick={handleSave}
          disabled={isSaving}
          style={{
            backgroundColor: '#f7a600',
            color: '#000000',
          }}
          className="px-5 py-2.5 rounded-md text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSaving ? '저장 중...' : '저장'}
        </button>
        <button
          onClick={() => onTest(exchange)}
          style={{
            backgroundColor: '#252525',
            color: '#888888',
            border: '1px solid #333333',
          }}
          className="px-5 py-2.5 rounded-md text-sm font-medium hover:text-white hover:border-gray-500 transition-colors"
        >
          연결 테스트
        </button>
      </div>
    </div>
  )
}
