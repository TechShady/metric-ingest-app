import React, { useEffect, useMemo, useState } from "react";
import { Card, Loader, Stat } from "../components/Common";
import { LineChart } from "../components/LineChart";
import { BarList } from "../components/BarList";
import { fetchSourceSeries } from "../lib/queries";
import { fmtNum, linearForecast } from "../lib/forecast";
import { costUSD, fmtUSD } from "../lib/cost";
import { useSettings } from "../state/SettingsContext";

interface Props { timeframe: string; }

function intervalForTf(tf: string): string {
  if (tf.includes("1h")) return "1m";
  if (tf.includes("6h")) return "5m";
  if (tf.includes("1d")) return "30m";
  if (tf.includes("7d")) return "1h";
  if (tf.includes("14d")) return "3h";
  if (tf.includes("30d")) return "6h";
  return "1h";
}

export const SourcesPage: React.FC<Props> = ({ timeframe }) => {
  const { rateCentsPerDp } = useSettings();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<{ source: string; values: number[]; total: number }[]>([]);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    let abort = false;
    setLoading(true);
    (async () => {
      const r = await fetchSourceSeries(timeframe, intervalForTf(timeframe), 50);
      if (abort) return;
      setData(r); setLoading(false);
      if (r.length) setSelected(r[0].source);
    })();
    return () => { abort = true; };
  }, [timeframe]);

  const totals = data.reduce((a, b) => a + b.total, 0);
  const sel = data.find((d) => d.source === selected) || null;
  const fc = useMemo(() => sel ? linearForecast(sel.values, Math.max(8, Math.floor(sel.values.length / 4))) : null, [sel]);

  if (loading) return <Loader msg="Loading source ingest..." />;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 12 }}>
        <Card title={`Ingest sources (${data.length})`}>
          <div style={{ maxHeight: 520, overflowY: "auto" }}>
            {data.map((d) => (
              <div
                key={d.source}
                onClick={() => setSelected(d.source)}
                style={{
                  padding: "8px 10px",
                  cursor: "pointer",
                  background: selected === d.source ? "rgba(20,150,255,0.12)" : "transparent",
                  borderBottom: "1px solid rgba(128,128,128,0.15)",
                  fontSize: 12,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "70%" }}>
                    {d.source}
                  </span>
                  <span style={{ opacity: 0.85 }}>{fmtNum(d.total)}</span>
                </div>
                <div style={{ background: "rgba(128,128,128,0.15)", height: 4, borderRadius: 2, marginTop: 4 }}>
                  <div style={{
                    width: `${totals ? (d.total / data[0].total) * 100 : 0}%`,
                    height: "100%", background: "#1496ff", borderRadius: 2,
                  }} />
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card title={sel ? `Source: ${sel.source}` : "Select a source"}>
          {sel && fc && (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 12 }}>
                <Stat label="Datapoints (timeframe)" value={fmtNum(sel.total)} sub={`Cost: ${fmtUSD(costUSD(sel.total, rateCentsPerDp))}`} />
                <Stat label="% of all sources" value={totals ? `${((sel.total / totals) * 100).toFixed(1)}%` : "—"} />
                <Stat label="Trend / interval"
                      value={`${fc.slope >= 0 ? "+" : ""}${fmtNum(fc.slope)}`}
                      sub={`R²=${fc.r2.toFixed(2)}`} />
                <Stat label="Est. monthly cost"
                      value={fmtUSD(costUSD(sel.total, rateCentsPerDp) * 30)}
                      sub={`${fmtUSD(costUSD(sel.total, rateCentsPerDp) * 365)}/yr`} />
              </div>
              <LineChart
                history={fc.history}
                forecast={fc.forecast}
                upper={fc.upper}
                lower={fc.lower}
                yLabel="datapoints / interval"
              />
            </>
          )}
        </Card>
      </div>

      <Card title="Source share of total ingest">
        <BarList rows={data.slice(0, 20).map((d) => ({
          label: d.source, value: d.total,
          pct: totals ? (d.total / totals) * 100 : 0,
        }))} />
      </Card>
    </div>
  );
};
