/**
 * Simple linear regression forecast with prediction interval.
 * Given an array of historical y-values (evenly spaced in time), predict the next n points.
 */
export interface ForecastResult {
  history: number[];
  forecast: number[];
  upper: number[];
  lower: number[];
  slope: number;
  intercept: number;
  r2: number;
}

export function linearForecast(history: number[], horizon: number): ForecastResult {
  const xs = history.map((_, i) => i);
  const ys = history.slice();
  const n = ys.length;
  if (n < 2) {
    const last = ys[n - 1] ?? 0;
    return {
      history: ys,
      forecast: Array(horizon).fill(last),
      upper: Array(horizon).fill(last),
      lower: Array(horizon).fill(last),
      slope: 0,
      intercept: last,
      r2: 0,
    };
  }
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - meanX) * (ys[i] - meanY);
    den += (xs[i] - meanX) ** 2;
  }
  const slope = den === 0 ? 0 : num / den;
  const intercept = meanY - slope * meanX;

  // residuals & stderr
  let ssRes = 0, ssTot = 0;
  for (let i = 0; i < n; i++) {
    const yhat = slope * xs[i] + intercept;
    ssRes += (ys[i] - yhat) ** 2;
    ssTot += (ys[i] - meanY) ** 2;
  }
  const r2 = ssTot === 0 ? 1 : 1 - ssRes / ssTot;
  const sigma = Math.sqrt(ssRes / Math.max(1, n - 2));

  const forecast: number[] = [];
  const upper: number[] = [];
  const lower: number[] = [];
  for (let h = 1; h <= horizon; h++) {
    const x = n - 1 + h;
    const yhat = slope * x + intercept;
    // 95% prediction interval (simple, 1.96*sigma; not full PI formula but illustrative)
    const band = 1.96 * sigma * Math.sqrt(1 + 1 / n + ((x - meanX) ** 2) / Math.max(1, den));
    forecast.push(Math.max(0, yhat));
    upper.push(Math.max(0, yhat + band));
    lower.push(Math.max(0, yhat - band));
  }
  return { history: ys, forecast, upper, lower, slope, intercept, r2 };
}

export function fmtNum(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1e12) return (n / 1e12).toFixed(2) + "T";
  if (abs >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (abs >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (abs >= 1e3) return (n / 1e3).toFixed(2) + "K";
  return n.toFixed(0);
}

export function fmtBytes(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const u = ["B", "KB", "MB", "GB", "TB", "PB"];
  let i = 0; let v = n;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return v.toFixed(2) + " " + u[i];
}
