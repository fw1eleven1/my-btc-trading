import { bybit, okx, binanceusdm, type Exchange } from 'ccxt'

export type ExchangeId = 'bybit' | 'okx' | 'binance'

interface ExchangeCredentials {
  apiKey: string
  apiSecret: string
  passphrase?: string | null
  isTestnet?: boolean
}

export function createExchangeInstance(
  exchange: ExchangeId,
  credentials: ExchangeCredentials
): Exchange {
  const { apiKey, apiSecret, passphrase, isTestnet } = credentials

  switch (exchange) {
    case 'bybit': {
      const ex = new bybit({
        apiKey,
        secret: apiSecret,
        options: { defaultType: 'linear' },
      })
      if (isTestnet) ex.setSandboxMode(true)
      return ex
    }
    case 'okx': {
      const ex = new okx({
        apiKey,
        secret: apiSecret,
        password: passphrase ?? '',
        options: { defaultType: 'swap' },
      })
      if (isTestnet) ex.setSandboxMode(true)
      return ex
    }
    case 'binance': {
      const ex = new binanceusdm({
        apiKey,
        secret: apiSecret,
      })
      if (isTestnet) ex.setSandboxMode(true)
      return ex
    }
  }
}

export function getSymbol(exchange: ExchangeId): string {
  switch (exchange) {
    case 'bybit':
    case 'okx':
      return 'BTC/USDT:USDT'
    case 'binance':
      return 'BTC/USDT:USDT'
  }
}
