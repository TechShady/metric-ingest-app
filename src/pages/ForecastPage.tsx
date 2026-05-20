import React, { useEffect, useMemo, useState } from "react";
import { Card, Loader, Stat } from "../components/Common";
import { LineChart } from "../components/LineChart";
import { fetchTotalIngestSeries } from "../lib/queries";
import { fmtNum, linearForecast } from "../lib/forecast";
import { costUSD, fmtUSD } from "../lib/cost";
import { useSettings } from "../state/SettingsContext";

interface Props { timeframe: string; /* unused, forecasting always uses 30d */ }

export const ForecastPage: React.FC<Props> = () => {
  const { rateCentsPerDp } = useSettings();
  const [loading, setLoading] = useState(true);
  const [series, setSeries] = useState<{ start: number; interval: number; values: number[] } | null>(null);
  const [horizonDays, setHorizonDays] = useState(30);
  const [historyDays, setHistoryDays] = useState(30);

  useEffect(() => {
    let abort = false;
    setLoading(true);
    (async () => {
      const s = await fetchTotalIngestSeries(`now()-${historyDays}d`, "1d");
      if (abort) return;
      setSeries(s); setLoading(false);
    })();
    return () => { abort = true; };
  }, [historyDays]);

  const fc = useMemo(() => series ? linearForecast(series.values, horizonDays) : null, [series, horizonDays]);

  if (loading || !series || !fc) return <Loader msg="Building forecast..." />;

  const totalHistory = series.values.reduce((a, b) => a + b, 0);
  const totalForecast = fc.forecast.reduce((a, b) => a + b, 0);
  const dailyAvg = series.values.length ? totalHistory / series.values.length : 0;
  const projectedDaily = fc.forecast[fc.forecast.length - 1] ?? 0;
  const growthPct = dailyAvg > 0 ? ((projectedDaily - dailyAvg) / dailyAvg) * 100 : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Card>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
          <label style={{ fontSize: 12, display: "flex", flexDirection: "column", gap: 4 }}>
            History
            <select value={historyDays} onChange={(e) => setHistoryDays(Number(e.target.value))}
                    style={selStyle}>
              <option value={14}>14 days</option>
              <option value={30}>30 days</option>
              <option value={60}>60 days</option>
              <option value={90}>90 days</option>
            </select>
          </label>
          <label style={{ fontSize: 12, display: "flex", flexDirection: "column", gap: 4 }}>
            Forecast horizon
            <select value={horizonDays} onChange={(e) => setHorizonDays(Number(e.target.value))}
                    style={selStyle}>
              <option value={7}>7 days</option>
              <option value={14}>14 days</option>
              <option value={30}>30 days</option>
              <option value={60}>60 days</option>
              <option value={90}>90 days</option>
            </select>
          </label>
        </div>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
        <Stat label={`Datapoints (last ${historyDays}d)`} value={fmtNum(totalHistory)} sub={`Cost: ${fmtUSD(costUSD(totalHistory, rateCentsPerDp))}`} />
        <Stat label="Avg / day" value={fmtNum(dailyAvg)} sub={`${fmtUSD(costUSD(dailyAvg, rateCentsPerDp))}/day`} />
        <Stat label={`Projected (next ${horizonDays}d)`} value={fmtNum(totalForecast)} sub={`Cost: ${fmtUSD(costUSD(totalForecast, rateCentsPerDp))}`} />
        <Stat label="Daily growth (linear)"
              value={`${fc.slope >= 0 ? "+" : ""}${fmtNum(fc.slope)}/d`}
              sub={`Δ vs current avg: ${growthPct >= 0 ? "+" : ""}${growthPct.toFixed(1)}%`} />
        <Stat label="Est. monthly cost" value={fmtUSD(costUSD(dailyAvg, rateCentsPerDp) * 30)} sub={`${fmtUSD(costUSD(dailyAvg, rateCentsPerDp) * 365)}/yr`} />
      </div>

      <Card title={`Total metric ingest — ${historyDays}d history + ${horizonDays}d forecast`}>
        <LineChart
          history={fc.history}
          forecast={fc.forecast}
          upper={fc.upper}
          lower={fc.lower}
          height={320}
          startMs={series.start}
          intervalMs={series.interval / 1e6}
          yLabel="datapoints / day"
        />
        <div style={{ fontSize: 11, opacity: 0.65, marginTop: 8 }}>
          Solid line = actual ingest. Dashed line = linear projection. Shaded band = 95% prediction interval (linear-regression model).
        </div>
      </Card>

      <Card title="Methodology">
        <ul style={{ fontSize: 12, lineHeight: 1.6, margin: 0, paddingLeft: 18, opacity: 0.85 }}>
          <li>Source metric: <code>dt.sfm.server.metrics.ingest.external_datapoints</code> aggregated daily.</li>
          <li>Forecast: ordinary least-squares linear regression on daily totals; prediction interval = +/-1.96 * stddev, scaled by leverage.</li>
          <li>For non-linear / seasonal patterns the linear model is conservative — treat as a trend indicator, not a precise prediction.</li>
          <li>OneAgent built-in metrics (channel = <code>oneagent</code>) are typically minor in this counter; per-metric.key cardinality on the <em>Top Metrics</em> tab covers all metrics including built-ins.</li>
        </ul>
      </Card>
    </div>
  );
};

const selStyle: React.CSSProperties = {
  padding: "4px 8px",
  background: "rgba(128,128,128,0.1)",
  border: "1px solid rgba(128,128,128,0.3)",
  borderRadius: 4,
  color: "inherit",
};
