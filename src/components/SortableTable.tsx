import React, { useCallback, useMemo, useRef, useState } from "react";

export interface Column<T> {
  key: string;
  header: string;
  align?: "left" | "right" | "center";
  render: (row: T) => React.ReactNode;
  sortValue?: (row: T) => string | number;
  minWidth?: number;
}

interface Props<T> {
  columns: Column<T>[];
  data: T[];
  rowKey: (row: T) => string;
  maxHeight?: number;
  maxRows?: number;
  fontSize?: number;
  onRowClick?: (row: T) => void;
  rowStyle?: (row: T) => React.CSSProperties | undefined;
  footerRow?: React.ReactNode;
  defaultSortKey?: string;
  defaultSortDir?: "asc" | "desc";
}

export function SortableTable<T>({
  columns,
  data,
  rowKey,
  maxHeight = 600,
  maxRows,
  fontSize = 13,
  onRowClick,
  rowStyle,
  footerRow,
  defaultSortKey,
  defaultSortDir = "desc",
}: Props<T>) {
  const [sortKey, setSortKey] = useState<string | null>(defaultSortKey ?? null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">(defaultSortDir);
  const [colWidths, setColWidths] = useState<Record<string, number>>({});
  const dragRef = useRef<{ key: string; startX: number; startW: number } | null>(null);

  const handleSort = (key: string) => {
    const col = columns.find((c) => c.key === key);
    if (!col?.sortValue) return;
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const sorted = useMemo(() => {
    if (!sortKey) return data;
    const col = columns.find((c) => c.key === sortKey);
    if (!col?.sortValue) return data;
    const fn = col.sortValue;
    const dir = sortDir === "asc" ? 1 : -1;
    return [...data].sort((a, b) => {
      const va = fn(a);
      const vb = fn(b);
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
      return String(va).localeCompare(String(vb)) * dir;
    });
  }, [data, sortKey, sortDir, columns]);

  const displayed = maxRows ? sorted.slice(0, maxRows) : sorted;

  const onResizeStart = useCallback(
    (e: React.MouseEvent, key: string) => {
      e.preventDefault();
      e.stopPropagation();
      const th = (e.target as HTMLElement).closest("th");
      const startW = colWidths[key] ?? th?.offsetWidth ?? 100;
      dragRef.current = { key, startX: e.clientX, startW };

      const onMove = (ev: MouseEvent) => {
        if (!dragRef.current) return;
        const delta = ev.clientX - dragRef.current.startX;
        const col = columns.find((c) => c.key === dragRef.current!.key);
        const min = col?.minWidth ?? 50;
        const newW = Math.max(min, dragRef.current.startW + delta);
        setColWidths((prev) => ({ ...prev, [dragRef.current!.key]: newW }));
      };
      const onUp = () => {
        dragRef.current = null;
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [colWidths, columns],
  );

  const arrow = (key: string) => {
    if (sortKey !== key) return "↕";
    return sortDir === "asc" ? "↑" : "↓";
  };

  const hasFixedWidths = Object.keys(colWidths).length > 0;

  return (
    <div
      style={{
        maxHeight,
        overflowY: "auto",
        overflowX: "auto",
        border: "1px solid rgba(128,128,128,0.2)",
        borderRadius: 4,
      }}
    >
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize,
          tableLayout: hasFixedWidths ? "fixed" : undefined,
        }}
      >
        <thead style={{ position: "sticky", top: 0, background: "rgba(128,128,128,0.15)", zIndex: 1 }}>
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                onClick={() => handleSort(col.key)}
                style={{
                  padding: "8px 10px",
                  textAlign: col.align ?? "left",
                  fontWeight: 600,
                  fontSize: (fontSize ?? 13) - 1,
                  whiteSpace: "nowrap",
                  cursor: col.sortValue ? "pointer" : "default",
                  userSelect: "none",
                  position: "relative",
                  width: colWidths[col.key] ?? undefined,
                }}
              >
                {col.header}
                {col.sortValue && (
                  <span style={{ opacity: sortKey === col.key ? 1 : 0.4, fontSize: 10, marginLeft: 4 }}>
                    {arrow(col.key)}
                  </span>
                )}
                <div
                  onMouseDown={(e) => onResizeStart(e, col.key)}
                  style={{
                    position: "absolute",
                    right: 0,
                    top: 0,
                    bottom: 0,
                    width: 5,
                    cursor: "col-resize",
                    zIndex: 2,
                    borderRight: "2px solid transparent",
                  }}
                  onMouseEnter={(e) => {
                    (e.target as HTMLElement).style.borderRight = "2px solid rgba(128,128,128,0.5)";
                  }}
                  onMouseLeave={(e) => {
                    (e.target as HTMLElement).style.borderRight = "2px solid transparent";
                  }}
                />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {displayed.map((row) => (
            <tr
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              style={{
                borderBottom: "1px solid rgba(128,128,128,0.15)",
                cursor: onRowClick ? "pointer" : undefined,
                ...rowStyle?.(row),
              }}
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  style={{
                    padding: "6px 10px",
                    textAlign: col.align,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
          {footerRow}
        </tbody>
      </table>
      {maxRows && sorted.length > maxRows && (
        <div style={{ padding: 8, fontSize: 12, opacity: 0.7, textAlign: "center" }}>
          Showing first {maxRows} of {sorted.length}. Use filter to narrow.
        </div>
      )}
    </div>
  );
}
