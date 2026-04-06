'use client'

import { useState, useEffect, useCallback } from 'react'

type Exchange = 'bybit' | 'okx' | 'binance'

interface Position {
  symbol: string
  side: 'long' | 'short' | null
  entryPrice: number | null
  notional: number | null
  leverage: number | null
  contracts: number | null
  unrealizedPnl: number | null
  percentage: number | null
  marginMode: 'cross' | 'isolated'
}

interface ExchangeResult {
  exchange: Exchange
  positions: Position[]
  error?: string
  loading: boolean
}

const EXCHANGE_LABELS: Record<Exchange, string> = {
  bybit: 'ByBit',
  okx: 'OKX',
  binance: 'Binance',
}

const s = {
  card: { backgroundColor: '#1a1a1a', border: '1px solid #252525' },
  label: { color: '#888888' },
}

export default function PositionsClient() {
  const [exchanges, setExchanges] = useState<Exchange[]>([])
  const [keysLoading, setKeysLoading] = useState(true)
  const [results, setResults] = useState<ExchangeResult[]>([])

  useEffect(() => {
    fetch('/api/settings/exchange-keys')
      .then((r) => r.json())
      .then((json) => {
        const registered: Exchange[] = (json.data ?? []).map((row: { exchange: Exchange }) => row.exchange)
        setExchanges(registered)
      })
      .catch(() => setExchanges([]))
      .finally(() => setKeysLoading(false))
  }, [])

  const fetchAll = useCallback(async () => {
    if (exchanges.length === 0) return
    setResults(exchanges.map((ex) => ({ exchange: ex, positions: [], loading: true })))

    await Promise.all(
      exchanges.map(async (exchange) => {
        try {
          const res = await fetch(`/api/trade/positions?exchange=${exchange}`)
          const json = await res.json()
          setResults((prev) =>
            prev.map((r) =>
              r.exchange === exchange
                ? { exchange, positions: json.positions ?? [], error: json.error, loading: false }
                : r
            )
          )
        } catch {
          setResults((prev) =>
            prev.map((r) =>
              r.exchange === exchange
                ? { exchange, positions: [], error: '요청 실패', loading: false }
                : r
            )
          )
        }
      })
    )
  }, [])

  useEffect(() => {
    if (!keysLoading) fetchAll()
  }, [fetchAll, keysLoading])

  const fmt = (n: number) =>
    n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  const totalPnl = results
    .flatMap((r) => r.positions)
    .reduce((sum, p) => sum + (p.unrealizedPnl ?? 0), 0)

  const hasAnyPosition = results.some((r) => r.positions.length > 0)
  const allDone = !keysLoading && results.every((r) => !r.loading)

  if (keysLoading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <p style={s.label} className="text-sm">불러오는 중...</p>
      </div>
    )
  }

  if (exchanges.length === 0) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div style={s.card} className="rounded-xl p-10 text-center space-y-2">
          <p className="text-white text-sm">등록된 API 키가 없습니다.</p>
          <p style={s.label} className="text-xs">설정에서 거래소 API 키를 등록해 주세요.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-4">

      {/* 요약 헤더 */}
      <div style={s.card} className="rounded-xl p-5 flex items-center justify-between">
        <div>
          <p style={s.label} className="text-xs font-medium uppercase tracking-wider mb-1">전체 미실현 손익</p>
          <p
            style={{ color: totalPnl >= 0 ? '#4ade80' : '#f87171' }}
            className="text-2xl font-mono font-bold"
          >
            {totalPnl >= 0 ? '+' : ''}{fmt(totalPnl)} USDT
          </p>
        </div>
        <button
          onClick={fetchAll}
          style={{ backgroundColor: '#252525', border: '1px solid #333333', color: '#888888' }}
          className="px-4 py-2 rounded text-xs font-medium hover:text-white hover:brightness-125 transition-all"
        >
          새로고침
        </button>
      </div>

      {/* 거래소별 포지션 */}
      {results.map(({ exchange, positions, error, loading }) => (
        <div key={exchange} style={s.card} className="rounded-xl overflow-hidden">
          {/* 거래소 헤더 */}
          <div
            style={{ borderBottom: '1px solid #252525', backgroundColor: '#252525' }}
            className="px-5 py-3 flex items-center justify-between"
          >
            <p className="text-sm font-semibold text-white">{EXCHANGE_LABELS[exchange]}</p>
            {!loading && !error && (
              <p style={s.label} className="text-xs">
                {positions.length === 0 ? '포지션 없음' : `${positions.length}개 포지션`}
              </p>
            )}
          </div>

          {loading ? (
            <div className="px-5 py-6">
              <p style={s.label} className="text-xs">불러오는 중...</p>
            </div>
          ) : error ? (
            <div className="px-5 py-6">
              <p style={{ color: '#f87171' }} className="text-xs">{error}</p>
            </div>
          ) : positions.length === 0 ? (
            <div className="px-5 py-6">
              <p style={s.label} className="text-xs">오픈 포지션이 없습니다.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ backgroundColor: '#1e1e1e', borderBottom: '1px solid #333333' }}>
                    {['방향', '심볼', '진입가', '수량', '증거금', '레버리지', '마진모드', '미실현 PnL', '수익률'].map((h) => (
                      <th
                        key={h}
                        style={s.label}
                        className="px-4 py-3 text-left text-xs font-medium whitespace-nowrap"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {positions.map((p, i) => {
                    const pnlPos = (p.unrealizedPnl ?? 0) >= 0
                    return (
                      <tr
                        key={i}
                        style={{
                          borderBottom: '1px solid #252525',
                          backgroundColor: i % 2 === 0 ? 'transparent' : '#1e1e1e',
                        }}
                        className="hover:brightness-110 transition-all"
                      >
                        {/* 방향 */}
                        <td className="px-4 py-3">
                          <span
                            style={{
                              backgroundColor: p.side === 'long' ? '#16a34a' : '#dc2626',
                              color: '#ffffff',
                              fontSize: '11px',
                              padding: '2px 8px',
                              borderRadius: '4px',
                              fontWeight: 700,
                            }}
                          >
                            {p.side === 'long' ? '롱' : '숏'}
                          </span>
                        </td>

                        {/* 심볼 */}
                        <td className="px-4 py-3">
                          <span style={{ color: '#cccccc' }} className="font-mono text-xs">
                            {p.symbol}
                          </span>
                        </td>

                        {/* 진입가 */}
                        <td className="px-4 py-3">
                          <span className="text-white font-mono">
                            ${p.entryPrice != null ? fmt(p.entryPrice) : '—'}
                          </span>
                        </td>

                        {/* 수량 */}
                        <td className="px-4 py-3">
                          <span style={{ color: '#cccccc' }} className="font-mono">
                            {p.contracts != null ? p.contracts.toFixed(4) : '—'} BTC
                          </span>
                        </td>

                        {/* 증거금(notional) */}
                        <td className="px-4 py-3">
                          <span style={{ color: '#cccccc' }} className="font-mono">
                            {p.notional != null ? `$${fmt(p.notional)}` : '—'}
                          </span>
                        </td>

                        {/* 레버리지 */}
                        <td className="px-4 py-3">
                          <span style={{ color: '#f7a600' }} className="font-mono font-semibold">
                            {p.leverage != null ? `${p.leverage}x` : '—'}
                          </span>
                        </td>

                        {/* 마진모드 */}
                        <td className="px-4 py-3">
                          <span
                            style={{
                              color: p.marginMode === 'isolated' ? '#a78bfa' : '#60a5fa',
                              fontSize: '11px',
                            }}
                            className="font-semibold"
                          >
                            {p.marginMode === 'isolated' ? '격리' : '교차'}
                          </span>
                        </td>

                        {/* 미실현 PnL */}
                        <td className="px-4 py-3">
                          <span
                            style={{ color: pnlPos ? '#4ade80' : '#f87171' }}
                            className="font-mono font-semibold"
                          >
                            {p.unrealizedPnl != null
                              ? `${pnlPos ? '+' : ''}${fmt(p.unrealizedPnl)}`
                              : '—'}
                          </span>
                        </td>

                        {/* 수익률 */}
                        <td className="px-4 py-3">
                          <span
                            style={{ color: pnlPos ? '#4ade80' : '#f87171' }}
                            className="font-mono"
                          >
                            {p.percentage != null
                              ? `${pnlPos ? '+' : ''}${p.percentage.toFixed(2)}%`
                              : '—'}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}

      {allDone && !hasAnyPosition && (
        <div style={s.card} className="rounded-xl p-10 text-center space-y-2">
          <p className="text-white text-sm">오픈 포지션이 없습니다.</p>
          <p style={s.label} className="text-xs">모든 거래소에 포지션이 없거나 API 키가 등록되지 않았습니다.</p>
        </div>
      )}
    </div>
  )
}
