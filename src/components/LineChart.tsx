import React, { useMemo } from "react";

interface Props {
  history: number[];
  forecast?: number[];
  upper?: number[];
  lower?: number[];
  height?: number;
  startMs?: number;
  intervalMs?: number;
  yLabel?: string;
}

/** Lightweight inline SVG line chart with optional forecast & confidence band. */
export const LineChart: React.FC<Props> = ({
  history,
  forecast = [],
  upper = [],
  lower = [],
  height = 220,
  startMs,
  intervalMs,
  yLabel,
}) => {
  const all = [...history, ...forecast, ...upper, ...lower];
  const max = Math.max(1, ...all);
  const min = Math.min(0, ...all);
  const total = history.length + forecast.length;
  const W = 800;
  const H = height;
  const padL = 56, padR = 16, padT = 12, padB = 32;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const x = (i: number) => padL + (total <= 1 ? 0 : (i / (total - 1)) * innerW);
  const y = (v: number) => padT + innerH - ((v - min) / (max - min || 1)) * innerH;

  const histPath = useMemo(() => {
    if (!history.length) return "";
    return history.map((v, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(v)}`).join(" ");
  }, [history, max, min, total]);

  const fcPath = useMemo(() => {
    if (!forecast.length) return "";
    const start = history.length - 1;
    const segs: string[] = [];
    if (history.length) segs.push(`M ${x(start)} ${y(history[history.length - 1])}`);
    forecast.forEach((v, i) => segs.push(`L ${x(start + 1 + i)} ${y(v)}`));
    return segs.join(" ");
  }, [forecast, history, max, min, total]);

  const bandPath = useMemo(() => {
    if (!upper.length || !lower.length) return "";
    const start = history.length;
    const top = upper.map((v, i) => `${i === 0 ? "M" : "L"} ${x(start + i)} ${y(v)}`).join(" ");
    const bot = lower
      .slice()
      .reverse()
      .map((v, i) => `L ${x(start + (lower.length - 1 - i))} ${y(v)}`)
      .join(" ");
    return `${top} ${bot} Z`;
  }, [upper, lower, history, max, min, total]);

  // Y ticks
  const ticks = 4;
  const tickVals = Array.from({ length: ticks + 1 }, (_, i) => min + ((max - min) * i) / ticks);

  const fmt = (v: number) => {
    if (Math.abs(v) >= 1e9) return (v / 1e9).toFixed(1) + "B";
    if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(1) + "M";
    if (Math.abs(v) >= 1e3) return (v / 1e3).toFixed(1) + "K";
    return v.toFixed(0);
  };

  const tsLabel = (i: number) => {
    if (!startMs || !intervalMs) return "";
    const ms = startMs + i * intervalMs;
    const d = new Date(ms);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  };

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: H }}>
      {tickVals.map((v, i) => (
        <g key={i}>
          <line
            x1={padL}
            x2={W - padR}
            y1={y(v)}
            y2={y(v)}
            stroke="rgba(128,128,128,0.2)"
            strokeDasharray={i === 0 ? "" : "2 3"}
          />
          <text x={padL - 6} y={y(v) + 4} fontSize="10" textAnchor="end" fill="currentColor" opacity={0.7}>
            {fmt(v)}
          </text>
        </g>
      ))}
      {/* x ticks: 5 evenly-spaced labels */}
      {startMs && intervalMs && total > 1 && Array.from({ length: 5 }, (_, i) => {
        const idx = Math.round((i / 4) * (total - 1));
        return (
          <text key={i} x={x(idx)} y={H - 10} fontSize="10" textAnchor="middle" fill="currentColor" opacity={0.7}>
            {tsLabel(idx)}
          </text>
        );
      })}
      {bandPath && <path d={bandPath} fill="rgba(20,150,255,0.15)" />}
      {histPath && <path d={histPath} fill="none" stroke="#1496ff" strokeWidth="2" />}
      {fcPath && <path d={fcPath} fill="none" stroke="#1496ff" strokeWidth="2" strokeDasharray="4 3" opacity={0.85} />}
      {/* divider between history & forecast */}
      {forecast.length > 0 && (
        <line
          x1={x(history.length - 1)}
          x2={x(history.length - 1)}
          y1={padT}
          y2={padT + innerH}
          stroke="rgba(128,128,128,0.5)"
          strokeDasharray="3 3"
        />
      )}
      {yLabel && (
        <text x={8} y={padT + innerH / 2} fontSize="10" fill="currentColor" opacity={0.6}
              transform={`rotate(-90 8 ${padT + innerH / 2})`} textAnchor="middle">
          {yLabel}
        </text>
      )}
    </svg>
  );
};
