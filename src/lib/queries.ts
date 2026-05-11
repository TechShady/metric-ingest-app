import { runDql, runDqlChunks, N } from "./dql";

export interface MetricKeyRow {
  metric_key: string;
  series: number;
  // estimated daily datapoints assuming 1-min resolution = 1440/day per series (heuristic)
  estDailyDatapoints: number;
}

export interface SourceRow {
  source: string;
  total: number;
}

export interface ChannelRow {
  channel: string;
  total: number;
}

const PREFIXES = [
  "dt.",
  "a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m",
  "n", "o", "p", "q", "r", "s", "t", "u", "v", "w", "x", "y", "z",
  "0", "1", "2", "3", "4", "5", "6", "7", "8", "9",
  "_",
];

/**
 * Fetch series cardinality grouped by metric.key, chunked by metric-key prefix
 * to avoid the per-query scan/result limit and merge results.
 *
 * `dt.` is queried as one chunk (huge), then a-z, 0-9 individually for the rest.
 * Any metric.key that does NOT start with "dt." and starts with a single letter is
 * captured by its first-character bucket. We dedupe by metric.key just in case.
 */
export async function fetchAllMetricCardinality(
  timeframe: string = "now()-2h",
  to?: string
): Promise<MetricKeyRow[]> {
  const range = to ? `from:${timeframe}, to:${to}` : `from:${timeframe}`;
  const queries = PREFIXES.map(
    (p) => `fetch metric.series, ${range}
| filter startsWith(metric.key, "${p}")
| summarize series = count(), by:{metric.key}`
  );
  const recs = await runDqlChunks(queries, 4);
  const map = new Map<string, number>();
  for (const r of recs) {
    const key = r["metric.key"] as string;
    if (!key) continue;
    const s = N(r.series);
    // keep max — duplicates across overlapping prefixes shouldn't happen but be safe
    if ((map.get(key) ?? 0) < s) map.set(key, s);
  }
  const out: MetricKeyRow[] = [];
  map.forEach((series, metric_key) => {
    out.push({
      metric_key,
      series,
      estDailyDatapoints: series * 1440,
    });
  });
  out.sort((a, b) => b.series - a.series);
  return out;
}

/** Total ingested datapoints over a timeframe (using SFM metric — actual measurement). */
export async function fetchTotalIngestSeries(
  timeframe: string,
  intervalLabel: string
): Promise<{ start: number; interval: number; values: number[] } | null> {
  const recs = await runDql(
    `timeseries dp = sum(dt.sfm.server.metrics.ingest.external_datapoints), from:${timeframe}, interval:${intervalLabel}`
  );
  if (!recs.length) return null;
  const r = recs[0];
  const tf = r.timeframe;
  const interval = N(r.interval);
  return {
    start: tf?.start ? new Date(tf.start).getTime() : Date.now(),
    interval,
    values: (r.dp || []).map((v: any) => N(v)),
  };
}

/** Top sources by ingested datapoints over the timeframe. */
export async function fetchTopSources(timeframe: string): Promise<SourceRow[]> {
  const recs = await runDql(
    `timeseries dp = sum(dt.sfm.server.metrics.ingest.external_datapoints), by:{source}, from:${timeframe}
| fieldsAdd total = arraySum(dp)
| fields source, total
| sort total desc`
  );
  return recs.map((r) => ({ source: String(r.source ?? "unknown"), total: N(r.total) }));
}

/** Datapoints by ingest channel. */
export async function fetchByChannel(timeframe: string): Promise<ChannelRow[]> {
  const recs = await runDql(
    `timeseries dp = sum(dt.sfm.server.metrics.ingest.external_datapoints), by:{dt.ingest.channel}, from:${timeframe}
| fieldsAdd total = arraySum(dp)
| fields channel = dt.ingest.channel, total
| sort total desc`
  );
  return recs.map((r) => ({ channel: String(r.channel ?? "unknown"), total: N(r.total) }));
}

/** Time series per source (for forecasting per source). */
export async function fetchSourceSeries(
  timeframe: string,
  intervalLabel: string,
  topN: number
): Promise<{ source: string; values: number[]; total: number }[]> {
  const recs = await runDql(
    `timeseries dp = sum(dt.sfm.server.metrics.ingest.external_datapoints), by:{source}, from:${timeframe}, interval:${intervalLabel}
| fieldsAdd total = arraySum(dp)
| sort total desc
| limit ${topN}`
  );
  return recs.map((r) => ({
    source: String(r.source ?? "unknown"),
    total: N(r.total),
    values: (r.dp || []).map((v: any) => N(v)),
  }));
}

/** For a SPECIFIC metric.key, fetch real daily datapoint count. Used in detail panel. */
export async function fetchMetricDailyDatapoints(
  metricKey: string,
  timeframe: string
): Promise<{ values: number[]; total: number }> {
  // count(metricKey) gives number of datapoints per interval
  const recs = await runDql(
    `timeseries dp = count(${metricKey}), from:${timeframe}, interval:1d`
  );
  if (!recs.length) return { values: [], total: 0 };
  const values: number[] = (recs[0].dp || []).map((v: any) => N(v));
  return { values, total: values.reduce((a, b) => a + b, 0) };
}

/** Series count per source/extension for a given metric key. */
export async function fetchMetricBySource(
  metricKey: string,
  timeframe: string
): Promise<{ source: string; series: number }[]> {
  const recs = await runDql(
    `fetch metric.series, from:${timeframe}
| filter metric.key == "${metricKey}"
| summarize s = count(), by:{dt.metrics.source}
| sort s desc`
  );
  return recs.map((r) => ({ source: String(r["dt.metrics.source"] ?? "unknown"), series: N(r.s) }));
}

/** Fetch ALL series records for a specific metric.key (with all dimension fields inline). */
export async function fetchAllSeriesFor(
  metricKey: string,
  timeframe: string,
  maxRecords = 100000
): Promise<any[]> {
  return runDql(
    `fetch metric.series, from:${timeframe}
| filter metric.key == "${metricKey}"`,
    { maxRecords }
  );
}

/**
 * Fetch all distinct DQL query strings executed against the metrics table.
 * Used to detect "idle" metrics (in ingest but never queried).
 */
export async function fetchMetricQueryStrings(timeframe: string = "now()-30d"): Promise<string[]> {
  const recs = await runDql(
    `fetch dt.system.events, from:${timeframe}
| filter event.kind == "QUERY_EXECUTION_EVENT" and table == "metrics" and isNotNull(query_string)
| summarize cnt = count(), by:{query_string}`,
    { maxRecords: 100000 }
  );
  return recs.map((r) => String(r.query_string ?? "")).filter(Boolean);
}
