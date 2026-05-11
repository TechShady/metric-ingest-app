import React from "react";

export const Card: React.FC<{ title?: string; children: React.ReactNode; style?: React.CSSProperties }> = ({
  title,
  children,
  style,
}) => (
  <div
    style={{
      background: "rgba(128,128,128,0.06)",
      border: "1px solid rgba(128,128,128,0.3)",
      borderRadius: 8,
      padding: 16,
      ...style,
    }}
  >
    {title && <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 14 }}>{title}</div>}
    {children}
  </div>
);

export const Stat: React.FC<{ label: string; value: string; sub?: string }> = ({ label, value, sub }) => (
  <Card>
    <div style={{ fontSize: 12, opacity: 0.7 }}>{label}</div>
    <div style={{ fontSize: 28, fontWeight: 700, marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value}</div>
    {sub && <div style={{ fontSize: 11, opacity: 0.6, marginTop: 4 }}>{sub}</div>}
  </Card>
);

export const Loader: React.FC<{ msg?: string }> = ({ msg }) => (
  <div style={{ padding: 24, textAlign: "center", opacity: 0.7 }}>
    <div className="spinner" style={{
      width: 24, height: 24, border: "3px solid rgba(128,128,128,0.3)",
      borderTopColor: "#1496ff", borderRadius: "50%", margin: "0 auto 8px",
      animation: "spin 1s linear infinite",
    }} />
    <div style={{ fontSize: 13 }}>{msg ?? "Loading..."}</div>
    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
  </div>
);
