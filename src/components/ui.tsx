"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { Status, StatusSla } from "@/lib/model";
import { STATUS_LABEL } from "@/lib/model";

// ---------------------------------------------------------------------------
// Tooltip
// ---------------------------------------------------------------------------

/** Conteúdo estruturado de tooltip. Vai serializado no atributo data-tip
 * (via `tip()`); texto puro também funciona: 1ª linha vira título,
 * "Rótulo: valor" vira linha, linha em branco vira divisória. */
export interface TipData {
  t?: string; // título
  s?: string; // subtítulo
  rows?: { l: string; v: string; bar?: number; c?: string; flag?: string }[];
  n?: string; // nota / parágrafo
}
export const tip = (d: TipData) => JSON.stringify(d);

function parseTip(raw: string): TipData {
  if (raw.startsWith("{")) {
    try { return JSON.parse(raw); } catch { /* cai no texto puro */ }
  }
  const [t, ...resto] = raw.split("\n");
  const rows: NonNullable<TipData["rows"]> = [];
  const notas: string[] = [];
  for (const linha of resto) {
    const m = linha.match(/^([^:]{1,40}):\s(.+)$/);
    if (m) rows.push({ l: m[1], v: m[2] });
    else if (linha.trim()) notas.push(linha);
  }
  return { t, rows, n: notas.join(" ") || undefined };
}

/** Um tooltip só para a página inteira: qualquer elemento com data-tip
 * mostra o conteúdo ao passar o mouse (delegação de eventos). */
export function TooltipLayer() {
  const [tipState, setTip] = useState<{ x: number; y: number; raw: string } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const el = (e.target as HTMLElement | null)?.closest?.("[data-tip]") as HTMLElement | null;
      const raw = el?.dataset.tip;
      setTip(raw ? { x: e.clientX, y: e.clientY, raw } : null);
    };
    const leave = () => setTip(null);
    document.addEventListener("pointermove", move);
    document.addEventListener("scroll", leave, true);
    return () => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("scroll", leave, true);
    };
  }, []);

  // posiciona ao lado do cursor, virando para dentro da tela perto das bordas
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !tipState) return;
    const { width: w, height: h } = el.getBoundingClientRect();
    let left = tipState.x + 16;
    let top = tipState.y + 18;
    if (left + w > window.innerWidth - 8) left = tipState.x - w - 16;
    if (top + h > window.innerHeight - 8) top = tipState.y - h - 14;
    el.style.left = `${Math.max(8, left)}px`;
    el.style.top = `${Math.max(8, top)}px`;
  });

  if (!tipState) return null;
  const d = parseTip(tipState.raw);
  return (
    <div className="tip" ref={ref} role="tooltip">
      {d.t && <div className="tip-t">{d.t}</div>}
      {d.s && <div className="tip-s">{d.s}</div>}
      {d.rows && d.rows.length > 0 && (
        <div className="tip-rows">
          {d.rows.map((r, i) =>
            r.l === "—" ? (
              <div className="tip-hr" key={i} />
            ) : (
              <div className="tip-row" key={i}>
                <span className="l">
                  {r.c && <i style={{ background: r.c }} />}
                  {r.l}
                </span>
                <span className="v">
                  {r.v}
                  {r.flag && <em>{r.flag}</em>}
                </span>
                {r.bar != null && (
                  <span className="tip-bar">
                    <b style={{ width: `${Math.max(2, Math.min(1, r.bar) * 100)}%`, background: r.c }} />
                  </span>
                )}
              </div>
            ),
          )}
        </div>
      )}
      {d.n && <div className={d.t || d.rows?.length ? "tip-n" : "tip-p"}>{d.n}</div>}
    </div>
  );
}

/** Ícone ⓘ que guarda a explicação no tooltip, em vez de texto na página. */
export function InfoTip({ text, title }: { text: string; title?: string }) {
  return (
    <span className="info" data-tip={tip({ t: title, n: text })} aria-label={text} tabIndex={0}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <circle cx="12" cy="12" r="9.5" />
        <path d="M12 11v5.5M12 7.6v.1" />
      </svg>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Blocos de página
// ---------------------------------------------------------------------------
export function Sec({ eyebrow, title, info, sub }: { eyebrow?: string; title: string; info?: string; sub?: string }) {
  return (
    <div className="sec">
      {eyebrow && <span className="sec-eyebrow">{eyebrow}</span>}
      <span className="sec-title">{title}</span>
      {sub && <span className="sec-sub">{sub}</span>}
      {info && <InfoTip text={info} title={title} />}
    </div>
  );
}

export function CardHead({ title, info, right }: { title: string; info?: string; right?: ReactNode }) {
  return (
    <div className="card-head">
      <div className="card-title">
        {title}
        {info && <InfoTip text={info} title={title} />}
      </div>
      {right}
    </div>
  );
}

export function Kpi({
  label, value, unit, detail, info, progress, onClick,
}: {
  label: string;
  value: string;
  unit?: string;
  detail?: ReactNode;
  info?: string;
  progress?: number | null;
  onClick?: () => void;
}) {
  return (
    <div className={`card kpi${onClick ? " kpi-click" : ""}`} onClick={onClick} role={onClick ? "button" : undefined}>
      <div className="kpi-label">
        {label}
        {info && <InfoTip text={info} title={label} />}
      </div>
      <div className="kpi-value">
        {value}
        {unit && value !== "—" && <small>{unit}</small>}
      </div>
      {progress != null && (
        <div className="kpi-progress">
          <i style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} />
        </div>
      )}
      {detail && <div className="kpi-detail">{detail}</div>}
    </div>
  );
}

export function Note({ children, variant = "info" }: { children: ReactNode; variant?: "info" | "neutral" | "warn" | "critical" }) {
  return <div className={`note note-${variant}`}>{children}</div>;
}

export function Finding({ children }: { children: ReactNode }) {
  return (
    <div className="finding">
      <span className="finding-ico" aria-hidden>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.3h6c0-1 .4-1.8 1-2.3A7 7 0 0 0 12 2z" />
        </svg>
      </span>
      <p>{children}</p>
    </div>
  );
}

export function Pill({ status, label }: { status: Status | StatusSla; label?: string }) {
  const txt = label ?? (status in STATUS_LABEL ? STATUS_LABEL[status as Status] : status);
  return (
    <span className={`pill s-${status}`}>
      <span className="dot" />
      {txt}
    </span>
  );
}

export function Tiles({ items }: { items: { n: number | string; label: string; status: Status | StatusSla; tip?: string }[] }) {
  return (
    <div className="tiles">
      {items.map((t) => (
        <div key={t.label} className={`tile s-${t.status}`} data-tip={t.tip}>
          <span className="dot" />
          <div>
            <div className="tile-num">{t.n}</div>
            <div className="tile-lbl">{t.label}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

export interface Col<T> {
  key: string;
  label: string;
  help?: string;
  align?: "r" | "c";
  render: (row: T) => ReactNode;
}

export function Table<T>({ cols, rows, rowKey }: { cols: Col<T>[]; rows: T[]; rowKey: (r: T, i: number) => string }) {
  return (
    <div className="table-wrap">
      <table className="t">
        <thead>
          <tr>
            {cols.map((c) => (
              <th key={c.key} className={c.align}>
                {c.label}
                {c.help && <InfoTip text={c.help} title={c.label} />}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={rowKey(r, i)}>
              {cols.map((c) => (
                <td key={c.key} className={c.align}>
                  {c.render(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Drawer({
  title, sub, onClose, children,
}: { title: string; sub?: ReactNode; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="drawer" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref}>
        <div className="drawer-head">
          <div>
            <h3>{title}</h3>
            {sub && <p>{sub}</p>}
          </div>
          <button className="close-btn" onClick={onClose} aria-label="Fechar">✕</button>
        </div>
        <div className="drawer-body">{children}</div>
      </div>
    </div>
  );
}

export function Toast({ text, onDone }: { text: string; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2600);
    return () => clearTimeout(t);
  }, [text, onDone]);
  return <div className="toast" role="status">{text}</div>;
}

export function Select({
  label, value, options, onChange, id,
}: { label: string; value: string; options: string[]; onChange: (v: string) => void; id: string }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select id={id} className="select" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </div>
  );
}

export function Seg({ value, options, onChange, label }: { value: string; options: string[]; onChange: (v: string) => void; label: string }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o} aria-pressed={o === value} onClick={() => onChange(o)}>
          {o}
        </button>
      ))}
    </div>
  );
}
