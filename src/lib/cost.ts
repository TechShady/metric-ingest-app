/**
 * Cost utilities. Cost rate is expressed in CENTS per datapoint.
 * Default: 0.000000455 cents/datapoint (= $0.00000000455).
 */

export const DEFAULT_RATE_CENTS_PER_DP = 0.000000455;

export function costUSD(datapoints: number, ratePerDpCents: number): number {
  return (datapoints * ratePerDpCents) / 100;
}

export function fmtUSD(v: number): string {
  if (!Number.isFinite(v)) return "—";
  const abs = Math.abs(v);
  if (abs >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `$${(v / 1e3).toFixed(2)}K`;
  if (abs >= 1) return `$${v.toFixed(2)}`;
  if (abs >= 0.01) return `$${v.toFixed(4)}`;
  if (abs >= 0.0001) return `$${v.toFixed(6)}`;
  if (abs === 0) return "$0.00";
  // very small — show in cents
  const cents = v * 100;
  if (Math.abs(cents) >= 0.01) return `${cents.toFixed(4)}¢`;
  return `${cents.toExponential(2)}¢`;
}
