import React, { useEffect, useMemo, useState } from "react";
import { Card, Loader, Stat } from "../components/Common";
import { SortableTable } from "../components/SortableTable";
import { LineChart } from "../components/LineChart";
import { BarList } from "../components/BarList";
import { runDqlChunks, N } from "../lib/dql";
import { fetchAllMetricCardinality, fetchTotalIngestSeries } from "../lib/queries";
import { fmtNum, linearForecast } from "../lib/forecast";
import { costUSD, fmtUSD } from "../lib/cost";
import { useSettings } from "../state/SettingsContext";

interface Props { topN: number; }

interface MetricCost {
  metric_key: string;
  series: number;
  history: number[];
  forecast: number[];
  upper: number[];
  lower: number[];
  totalDp: number;
  projectedDp: number;
}

const HISTORY_DAYS = 30;
const HORIZON_DAYS = 30;

export const CostForecastPage: React.FC<Props> = ({ topN }) => {
  const { rateCentsPerDp, monthlyBudgetUSD } = useSettings();
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState("Fetching total ingest history...");
  const [totalSeries, setTotalSeries] = useState<{ start: number; interval: number; values: number[] } | null>(null);
  const [metrics, setMetrics] = useState<MetricCost[]>([]);

  useEffect(() => {
    let abort = false;
    setLoading(true);
    setProgress("Fetching total ingest history...");
    (async () => {
      const total = await fetchTotalIngestSeries(`now()-${HISTORY_DAYS}d`, "1d");
      if (abort) return;
      setTotalSeries(total);

      setProgress(`Identifying top ${topN} metrics by cardinality...`);
      const all = await fetchAllMetricCardinality("now()-2h");
      if (abort) return;
      const top = all.slice(0, topN);

      setProgress(`Fetching ${HISTORY_DAYS}d daily datapoints for ${top.length} metrics (chunked)...`);
      const queries = top.map(
        (m) =>
          `timeseries dp = count(\`${m.metric_key}\`), from:now()-${HISTORY_DAYS}d, interval:1d
| fieldsAdd metric_key = "${m.metric_key}"`
      );
      const recs = await runDqlChunks(queries, 4);
      if (abort) return;

      const byKey = new Map<string, number[]>();
      for (const r of recs) {
        const k = r.metric_key as string;
        if (!k) continue;
        byKey.set(k, (r.dp || []).map((v: any) => N(v)));
      }

      const out: MetricCost[] = top.map((m) => {
        const history = byKey.get(m.metric_key) ?? [];
        const fc = linearForecast(history, HORIZON_DAYS);
        return {
          metric_key: m.metric_key,
          series: m.series,
          history: fc.history,
          forecast: fc.forecast,
          upper: fc.upper,
          lower: fc.lower,
          totalDp: history.reduce((a, b) => a + b, 0),
          projectedDp: fc.forecast.reduce((a, b) => a + b, 0),
        };
      });
      out.sort((a, b) => b.projectedDp - a.projectedDp);
      setMetrics(out);
      setLoading(false);
    })();
    return () => { abort = true; };
  }, [topN]);

  const totalFc = useMemo(
    () => totalSeries ? linearForecast(totalSeries.values, HORIZON_DAYS) : null,
    [totalSeries]
  );

  if (loading || !totalFc || !totalSeries) return <Loader msg={progress} />;

  const totalCurrentDp = totalSeries.values.reduce((a, b) => a + b, 0);
  const totalProjectedDp = totalFc.forecast.reduce((a, b) => a + b, 0);
  const currentCost = costUSD(totalCurrentDp, rateCentsPerDp);
  const projectedCost = costUSD(totalProjectedDp, rateCentsPerDp);
  const dailyAvgCost = costUSD(totalCurrentDp / Math.max(1, totalSeries.values.length), rateCentsPerDp);
  const monthlyRunRate = dailyAvgCost * 30;
  const annualRunRate = dailyAvgCost * 365;
  const projectedDaily = totalFc.forecast[totalFc.forecast.length - 1] ?? 0;
  const projectedMonthlyAtEnd = costUSD(projectedDaily, rateCentsPerDp) * 30;
  const projectedAnnualAtEnd = costUSD(projectedDaily, rateCentsPerDp) * 365;
  const growthPct = totalCurrentDp > 0
    ? ((totalProjectedDp - totalCurrentDp) / totalCurrentDp) * 100
    : 0;

  // Per-metric cost breakdown (top metrics)
  const topMetricsCurrentCost = metrics.reduce((a, m) => a + costUSD(m.totalDp, rateCentsPerDp), 0);
  const topShare = currentCost > 0 ? (topMetricsCurrentCost / currentCost) * 100 : 0;

  // Build cost time series: convert dp arrays to $ arrays
  const histCost = totalFc.history.map((v) => costUSD(v, rateCentsPerDp));
  const fcCost = totalFc.forecast.map((v) => costUSD(v, rateCentsPerDp));
  const upCost = totalFc.upper.map((v) => costUSD(v, rateCentsPerDp));
  const lowCost = totalFc.lower.map((v) => costUSD(v, rateCentsPerDp));

  // Budget logic
  const dailyBudget = monthlyBudgetUSD > 0 ? monthlyBudgetUSD / 30 : 0;
  const overBudgetToday = dailyBudget > 0 && dailyAvgCost > dailyBudget;
  // Days until forecast crosses dailyBudget
  let daysUntilBudgetExceeded: number | null = null;
  if (dailyBudget > 0) {
    if (overBudgetToday) {
      daysUntilBudgetExceeded = 0;
    } else {
      for (let i = 0; i < fcCost.length; i++) {
        if (fcCost[i] > dailyBudget) { daysUntilBudgetExceeded = i + 1; break; }
      }
    }
  }
  const budgetUtilPct = monthlyBudgetUSD > 0 ? (monthlyRunRate / monthlyBudgetUSD) * 100 : 0;
  const projBudgetUtilPct = monthlyBudgetUSD > 0 ? (projectedMonthlyAtEnd / monthlyBudgetUSD) * 100 : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {monthlyBudgetUSD > 0 && (
        <Card title="Monthly budget tracking" style={{
          borderLeft: `4px solid ${budgetUtilPct >= 100 ? "#ff6b35" : budgetUtilPct >= 80 ? "#f59e0b" : "#10b981"}`,
        }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
            <Stat label="Monthly budget" value={fmtUSD(monthlyBudgetUSD)}
                  sub={`Daily target: ${fmtUSD(dailyBudget)}`} />
            <Stat label="Current burn-rate vs budget"
                  value={`${budgetUtilPct.toFixed(1)}%`}
                  sub={budgetUtilPct >= 100 ? "⚠ over budget today" : "of monthly budget"} />
            <Stat label={`Projected month-end (in ${HORIZON_DAYS}d)`}
                  value={`${projBudgetUtilPct.toFixed(1)}%`}
                  sub={`= ${fmtUSD(projectedMonthlyAtEnd)} / ${fmtUSD(monthlyBudgetUSD)}`} />
            <Stat label="Days until budget exceeded"
                  value={
                    daysUntilBudgetExceeded === null
                      ? `> ${HORIZON_DAYS}d`
                      : daysUntilBudgetExceeded === 0
                      ? "🚨 today"
                      : `${daysUntilBudgetExceeded}d`
                  }
                  sub={daysUntilBudgetExceeded === null ? "within horizon" : "based on linear forecast"} />
          </div>
          {/* Burn-down progress bar */}
          <div style={{ marginTop: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 4, opacity: 0.75 }}>
              <span>$0</span>
              <span>{fmtUSD(monthlyBudgetUSD)} budget</span>
            </div>
            <div style={{ height: 14, background: "rgba(128,128,128,0.15)", borderRadius: 4, overflow: "hidden", position: "relative" }}>
              <div style={{
                width: `${Math.min(100, projBudgetUtilPct)}%`,
                height: "100%",
                background: projBudgetUtilPct >= 100 ? "#ff6b35" : projBudgetUtilPct >= 80 ? "#f59e0b" : "#10b981",
                transition: "width 0.3s",
              }} />
              {projBudgetUtilPct > 100 && (
                <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
                              fontSize: 10, fontWeight: 700, color: "#fff" }}>
                  +{(projBudgetUtilPct - 100).toFixed(0)}% over
                </div>
              )}
            </div>
          </div>
        </Card>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
        <Stat label={`Cost (last ${HISTORY_DAYS}d)`} value={fmtUSD(currentCost)}
              sub={`${fmtNum(totalCurrentDp)} datapoints @ ${rateCentsPerDp}¢/DP`} />
        <Stat label="Daily avg cost" value={fmtUSD(dailyAvgCost)} />
        <Stat label="Monthly run-rate" value={fmtUSD(monthlyRunRate)} sub="current daily avg × 30" />
        <Stat label="Annual run-rate" value={fmtUSD(annualRunRate)} sub="current daily avg × 365" />
        <Stat label={`Projected cost (next ${HORIZON_DAYS}d)`} value={fmtUSD(projectedCost)}
              sub={`Δ ${growthPct >= 0 ? "+" : ""}${growthPct.toFixed(1)}%`} />
        <Stat label="Projected monthly @ horizon end" value={fmtUSD(projectedMonthlyAtEnd)} />
        <Stat label="Projected annual @ horizon end" value={fmtUSD(projectedAnnualAtEnd)} />
        <Stat label={`Top ${topN} share`} value={`${topShare.toFixed(1)}%`}
              sub={`${fmtUSD(topMetricsCurrentCost)} of total`} />
      </div>

      <Card title={`Total metric ingest cost — ${HISTORY_DAYS}d history + ${HORIZON_DAYS}d forecast`}>
        <LineChart
          history={histCost}
          forecast={fcCost}
          upper={upCost}
          lower={lowCost}
          height={280}
          startMs={totalSeries.start}
          intervalMs={totalSeries.interval / 1e6}
          yLabel="USD / day"
        />
        <div style={{ fontSize: 11, opacity: 0.65, marginTop: 8 }}>
          Daily $ = daily datapoints × {rateCentsPerDp}¢ ÷ 100. Shaded band = 95% prediction interval.
        </div>
      </Card>

      <Card title={`Top ${metrics.length} metrics — current cost (last ${HISTORY_DAYS}d)`}>
        <BarList
          rows={metrics
            .slice()
            .sort((a, b) => b.totalDp - a.totalDp)
            .map((m) => ({
              label: m.metric_key,
              value: costUSD(m.totalDp, rateCentsPerDp),
              pct: currentCost > 0 ? (costUSD(m.totalDp, rateCentsPerDp) / currentCost) * 100 : 0,
            }))}
          valueFmt={fmtUSD}
        />
      </Card>

      <Card title={`Top ${metrics.length} metrics — cost breakdown & ${HORIZON_DAYS}d projection`}>
        <SortableTable
          columns={[
            { key: "metric_key", header: "Metric key", render: (m: MetricCost) => <code>{m.metric_key}</code>, sortValue: (m: MetricCost) => m.metric_key },
            { key: "series", header: "Series", align: "right", render: (m: MetricCost) => fmtNum(m.series), sortValue: (m: MetricCost) => m.series },
            { key: "dp", header: "DP (30d)", align: "right", render: (m: MetricCost) => fmtNum(m.totalDp), sortValue: (m: MetricCost) => m.totalDp },
            { key: "cost30", header: "Cost (30d)", align: "right", render: (m: MetricCost) => fmtUSD(costUSD(m.totalDp, rateCentsPerDp)), sortValue: (m: MetricCost) => m.totalDp },
            { key: "dailyAvg", header: "Daily avg $", align: "right", render: (m: MetricCost) => fmtUSD(costUSD(m.totalDp, rateCentsPerDp) / (m.history.length || 1)), sortValue: (m: MetricCost) => m.totalDp / (m.history.length || 1) },
            { key: "monthly", header: "Monthly $", align: "right", render: (m: MetricCost) => fmtUSD(costUSD(m.totalDp, rateCentsPerDp) / (m.history.length || 1) * 30), sortValue: (m: MetricCost) => m.totalDp / (m.history.length || 1) },
            { key: "annual", header: "Annual $", align: "right", render: (m: MetricCost) => fmtUSD(costUSD(m.totalDp, rateCentsPerDp) / (m.history.length || 1) * 365), sortValue: (m: MetricCost) => m.totalDp / (m.history.length || 1) },
            { key: "projected", header: "Projected (next 30d)", align: "right", render: (m: MetricCost) => fmtUSD(costUSD(m.projectedDp, rateCentsPerDp)), sortValue: (m: MetricCost) => m.projectedDp },
            { key: "delta", header: "Δ%", align: "right", render: (m: MetricCost) => {
              const delta = m.totalDp > 0 ? ((m.projectedDp - m.totalDp) / m.totalDp) * 100 : 0;
              return <span style={{ fontWeight: 600, color: delta > 5 ? "#ff6b35" : delta < -5 ? "#10b981" : undefined }}>{delta >= 0 ? "+" : ""}{delta.toFixed(1)}%</span>;
            }, sortValue: (m: MetricCost) => m.totalDp > 0 ? ((m.projectedDp - m.totalDp) / m.totalDp) * 100 : 0 },
          ]}
          data={metrics}
          rowKey={(m) => m.metric_key}
          maxHeight={520}
          defaultSortKey="projected"
          defaultSortDir="desc"
          footerRow={
            <tr style={{ background: "rgba(128,128,128,0.1)", fontWeight: 700 }}>
              <td style={{ padding: "6px 10px" }}>Top {metrics.length} subtotal</td>
              <td style={{ padding: "6px 10px", textAlign: "right" }}>—</td>
              <td style={{ padding: "6px 10px", textAlign: "right" }}>{fmtNum(metrics.reduce((a, m) => a + m.totalDp, 0))}</td>
              <td style={{ padding: "6px 10px", textAlign: "right" }}>{fmtUSD(topMetricsCurrentCost)}</td>
              <td style={{ padding: "6px 10px", textAlign: "right" }}>—</td>
              <td style={{ padding: "6px 10px", textAlign: "right" }}>—</td>
              <td style={{ padding: "6px 10px", textAlign: "right" }}>—</td>
              <td style={{ padding: "6px 10px", textAlign: "right" }}>{fmtUSD(metrics.reduce((a, m) => a + costUSD(m.projectedDp, rateCentsPerDp), 0))}</td>
              <td style={{ padding: "6px 10px", textAlign: "right" }}>—</td>
            </tr>
          }
        />
      </Card>

      <Card>
        <div style={{ fontSize: 11, opacity: 0.65 }}>
          Cost rate: <strong>{rateCentsPerDp}¢ per datapoint</strong> (${(rateCentsPerDp / 100).toExponential(3)}/DP).
          Adjust in the Settings dialog (gear icon, top-right). All forecasts use OLS linear regression with a 95% prediction interval; treat as conservative trend indicators.
        </div>
      </Card>
    </div>
  );
};
