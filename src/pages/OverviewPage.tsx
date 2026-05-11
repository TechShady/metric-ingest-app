import React, { useEffect, useState } from "react";
import { Card, Stat, Loader } from "../components/Common";
import { LineChart } from "../components/LineChart";
import { BarList } from "../components/BarList";
import {
  fetchTotalIngestSeries,
  fetchTopSources,
  fetchByChannel,
  SourceRow,
  ChannelRow,
} from "../lib/queries";
import { fmtNum } from "../lib/forecast";

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

export const OverviewPage: React.FC<Props> = ({ timeframe }) => {
  const [loading, setLoading] = useState(true);
  const [series, setSeries] = useState<{ start: number; interval: number; values: number[] } | null>(null);
  const [sources, setSources] = useState<SourceRow[]>([]);
  const [channels, setChannels] = useState<ChannelRow[]>([]);

  useEffect(() => {
    let abort = false;
    setLoading(true);
    (async () => {
      const [s, src, ch] = await Promise.all([
        fetchTotalIngestSeries(timeframe, intervalForTf(timeframe)),
        fetchTopSources(timeframe),
        fetchByChannel(timeframe),
      ]);
      if (abort) return;
      setSeries(s);
      setSources(src);
      setChannels(ch);
      setLoading(false);
    })();
    return () => { abort = true; };
  }, [timeframe]);

  if (loading) return <Loader msg="Loading metric ingest..." />;

  const total = (series?.values || []).reduce((a, b) => a + b, 0);
  const sourceTotal = sources.reduce((a, b) => a + b.total, 0);
  const channelTotal = channels.reduce((a, b) => a + b.total, 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
        <Stat label="Total ingested datapoints" value={fmtNum(total)} sub={`Timeframe: ${timeframe}`} />
        <Stat label="Distinct ingest sources" value={String(sources.length)} />
        <Stat label="Distinct ingest channels" value={String(channels.length)} />
        <Stat label="Top source share" value={
          sourceTotal > 0 ? `${(((sources[0]?.total ?? 0) / sourceTotal) * 100).toFixed(1)}%` : "—"
        } sub={sources[0]?.source ?? "—"} />
      </div>

      <Card title="Ingested datapoints over time">
        {series && series.values.length > 0 ? (
          <LineChart
            history={series.values}
            startMs={series.start}
            intervalMs={series.interval / 1e6}
            yLabel="datapoints / interval"
          />
        ) : <div style={{ opacity: 0.7 }}>No data.</div>}
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Card title="Top sources by ingested datapoints">
          <BarList
            rows={sources.slice(0, 15).map((s) => ({
              label: s.source, value: s.total,
              pct: sourceTotal > 0 ? (s.total / sourceTotal) * 100 : 0,
            }))}
          />
        </Card>
        <Card title="Datapoints by ingest channel">
          <BarList
            rows={channels.map((c) => ({
              label: c.channel, value: c.total,
              pct: channelTotal > 0 ? (c.total / channelTotal) * 100 : 0,
            }))}
          />
        </Card>
      </div>

      <Card>
        <div style={{ fontSize: 12, opacity: 0.7 }}>
          Source: <code>dt.sfm.server.metrics.ingest.external_datapoints</code> (actual ingested datapoints from custom/extension/OTLP sources, not OneAgent built-ins).
        </div>
      </Card>
    </div>
  );
};
