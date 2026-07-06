export interface ResolvedFxRate {
  rate: string; // decimal string, JPY per 1 USD
  source: 'api' | 'env' | 'manual';
  fetchedAt: Date | null;
  isManual: boolean;
}

export interface ExchangeRateProvider {
  readonly name: string;
  fetchUsdJpyRate(): Promise<string>;
}
