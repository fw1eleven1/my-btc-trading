'use client'

import { useEffect, useRef, useState } from 'react'

type Exchange = 'bybit' | 'okx' | 'binance'

const WS_URLS: Record<Exchange, string> = {
  bybit: 'wss://stream.bybit.com/v5/public/linear',
  okx: 'wss://ws.okx.com:8443/ws/v5/public',
  binance: 'wss://fstream.binance.com/ws/btcusdt@markPrice@1s',
}

function parseMarkPrice(exchange: Exchange, event: MessageEvent): number | null {
  try {
    const data = JSON.parse(event.data as string)

    if (exchange === 'bybit') {
      if (data.topic === 'tickers.BTCUSDT' && data.data?.markPrice) {
        return parseFloat(data.data.markPrice)
      }
    }

    if (exchange === 'okx') {
      if (data.arg?.channel === 'mark-price' && data.data?.[0]?.markPx) {
        return parseFloat(data.data[0].markPx)
      }
    }

    if (exchange === 'binance') {
      // binance markPrice stream: { "p": "95000.00" }
      if (data.p) return parseFloat(data.p)
    }
  } catch {
    // 파싱 오류 무시
  }
  return null
}

/**
 * 거래소 공개 WebSocket으로 BTC 마크 프라이스를 수신한다.
 * React 상태는 5초마다 한 번씩 갱신해 불필요한 리렌더를 줄인다.
 */
export function useBtcMarkPrice(exchange: Exchange | null): {
  markPrice: number | null
  connected: boolean
} {
  const [markPrice, setMarkPrice] = useState<number | null>(null)
  const [connected, setConnected] = useState(false)

  // 5초 스로틀: 마지막 상태 업데이트 시각
  const lastFlushRef = useRef<number>(0)
  // WebSocket에서 받은 최신 가격 (상태와 별개로 ref에 유지)
  const latestPriceRef = useRef<number | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!exchange) {
      setMarkPrice(null)
      setConnected(false)
      return
    }

    let ws: WebSocket
    let destroyed = false

    function connect() {
      ws = new WebSocket(WS_URLS[exchange as Exchange])

      ws.onopen = () => {
        if (destroyed) return
        setConnected(true)

        if (exchange === 'bybit') {
          ws.send(JSON.stringify({ op: 'subscribe', args: ['tickers.BTCUSDT'] }))
        }
        if (exchange === 'okx') {
          ws.send(
            JSON.stringify({
              op: 'subscribe',
              args: [{ channel: 'mark-price', instId: 'BTC-USDT-SWAP' }],
            })
          )
        }
        // binance는 URL 구독 방식이라 send 불필요
      }

      ws.onmessage = (event) => {
        if (destroyed) return
        const price = parseMarkPrice(exchange as Exchange, event)
        if (price === null) return

        latestPriceRef.current = price

        // 첫 수신 또는 5초 경과 시 즉시 flush
        const now = Date.now()
        if (now - lastFlushRef.current >= 5000) {
          lastFlushRef.current = now
          setMarkPrice(price)
        }
      }

      ws.onerror = () => {
        if (!destroyed) setConnected(false)
      }

      ws.onclose = () => {
        if (!destroyed) {
          setConnected(false)
          // 5초 후 재연결
          setTimeout(connect, 5000)
        }
      }
    }

    connect()

    // 5초마다 최신 가격을 상태에 반영 (onmessage 스로틀 보완)
    timerRef.current = setInterval(() => {
      if (latestPriceRef.current !== null) {
        setMarkPrice(latestPriceRef.current)
        lastFlushRef.current = Date.now()
      }
    }, 5000)

    return () => {
      destroyed = true
      ws.close()
      if (timerRef.current) clearInterval(timerRef.current)
      setMarkPrice(null)
      setConnected(false)
      latestPriceRef.current = null
      lastFlushRef.current = 0
    }
  }, [exchange])

  return { markPrice, connected }
}
