"use client";

/**
 * Gráficos em HTML/CSS puro, no lugar do Plotly (~3 MB de JS). Leves,
 * nítidos em qualquer resolução, seguem o tema pelas variáveis CSS e o
 * tooltip é o data-tip global (TooltipLayer).
 */
import { Fragment, type CSSProperties } from "react";

export interface BarItem {
  key?: string;
  label: string;
  value: number;
  text?: string;
  color?: string;
  tip?: string;
  onClick?: () => void;
}

export function HBars({ items, max }: { items: BarItem[]; max?: number }) {
  const m = max ?? Math.max(1, ...items.map((i) => i.value));
  return (
    <div className="hbars">
      {items.map((it) => (
        <div className="hb-row" key={it.key ?? it.label}>
          <div className="hb-label">{it.label}</div>
          <div className="hb-track">
            <div
              className={`hb-bar${it.onClick ? " clickable" : ""}`}
              style={{ width: `${Math.max(0, (it.value / m) * 86)}%`, background: it.color }}
              data-tip={it.tip}
              onClick={it.onClick}
            />
            <span className="hb-val">{it.text ?? it.value}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

export function VBars({ items, height = 220 }: { items: BarItem[]; height?: number }) {
  const maxV = Math.max(0, ...items.map((i) => i.value));
  const minV = Math.min(0, ...items.map((i) => i.value));
  const span = maxV - minV || 1;
  const zero = (-minV / span) * 100; // % a partir de baixo
  return (
    <div className="vbars">
      {items.map((it) => {
        const h = (Math.abs(it.value) / span) * 100;
        const neg = it.value < 0;
        const style: CSSProperties = {
          height: `${h}%`,
          bottom: neg ? `${zero - h}%` : `${zero}%`,
          background: it.color,
        };
        return (
          <div className="vb-col" key={it.key ?? it.label}>
            <div className="vb-plot" style={{ height }}>
              <div className="vb-zero" style={{ bottom: `${zero}%` }} />
              <div
                className={`vb-bar${neg ? " neg" : ""}${it.onClick ? " clickable" : ""}`}
                style={style}
                data-tip={it.tip}
                onClick={it.onClick}
              />
              <div
                className="vb-val"
                style={neg ? { bottom: `calc(${zero - h}% - 18px)` } : { bottom: `calc(${zero + h}% + 4px)` }}
              >
                {it.text ?? it.value}
              </div>
            </div>
            <div className="vb-label">{it.label}</div>
          </div>
        );
      })}
    </div>
  );
}

export function Funnel({ items }: { items: BarItem[] }) {
  const m = Math.max(1, ...items.map((i) => i.value));
  return (
    <div className="funnel">
      {items.map((it) => (
        <div className="fn-row" key={it.label}>
          <div className="hb-label">{it.label}</div>
          <div className="fn-track">
            <div className="fn-bar" style={{ width: `${Math.max(6, (it.value / m) * 100)}%` }} data-tip={it.tip}>
              {it.text ?? it.value}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---- heatmap --------------------------------------------------------------
const STOPS_LIGHT = ["#F1F3F8", "#8B93C7", "#273275", "#FF0066"];
const STOPS_DARK = ["#1B2B57", "#8B93C7", "#273275", "#FF0066"];
const POS = [0, 0.35, 0.65, 1];

function hex(h: string) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function heatColor(t: number, dark: boolean): { bg: string; fg: string } {
  const stops = dark ? STOPS_DARK : STOPS_LIGHT;
  const x = Math.min(1, Math.max(0, t));
  let i = 0;
  while (i < POS.length - 2 && x > POS[i + 1]) i++;
  const f = (x - POS[i]) / (POS[i + 1] - POS[i]);
  const a = hex(stops[i]), b = hex(stops[i + 1]);
  const rgb = a.map((v, k) => Math.round(v + (b[k] - v) * f));
  // texto pela luminância da própria célula, não pelo tema
  const lum = (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255;
  return { bg: `rgb(${rgb.join(",")})`, fg: lum > 0.55 ? "#0B1330" : "#FFFFFF" };
}

export function Heatmap({
  rows, cols, value, fmt, tip, dark, rowLabelWidth = 170,
}: {
  rows: string[];
  cols: string[];
  value: (r: string, c: string) => number | null | undefined;
  fmt: (v: number) => string;
  tip?: (r: string, c: string, v: number | null | undefined) => string;
  dark: boolean;
  rowLabelWidth?: number;
}) {
  const vals = rows.flatMap((r) => cols.map((c) => value(r, c))).filter((v): v is number => v != null);
  const min = Math.min(...vals), max = Math.max(...vals);
  const span = max - min || 1;
  return (
    <div>
      <div className="heat" style={{ gridTemplateColumns: `${rowLabelWidth}px repeat(${cols.length}, minmax(64px, 1fr))` }}>
        <div />
        {cols.map((c) => (
          <div className="heat-h" key={c}>{c}</div>
        ))}
        {rows.map((r) => (
          <Fragment key={r}>
            <div className="heat-r">{r}</div>
            {cols.map((c) => cell(r, c))}
          </Fragment>
        ))}
      </div>
      <div className="heat-scale">
        <span>{vals.length ? fmt(min) : ""}</span>
        <i />
        <span>{vals.length ? fmt(max) : ""}</span>
      </div>
    </div>
  );

  function cell(r: string, c: string) {
    {
          const v = value(r, c);
          if (v == null)
            return (
              <div key={c} className="heat-c" style={{ background: "var(--surface-2)", color: "var(--muted)" }} data-tip={tip?.(r, c, v)}>
                —
              </div>
            );
          const { bg, fg } = heatColor((v - min) / span, dark);
          return (
            <div
              key={c}
              className="heat-c"
              style={{ background: bg, color: fg }}
              data-tip={tip?.(r, c, v)}
            >
              {fmt(v)}
            </div>
          );
        }
  }
}
