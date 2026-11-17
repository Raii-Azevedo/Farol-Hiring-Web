"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Status, StatusSla } from "@/lib/model";
import { STATUS_LABEL } from "@/lib/model";

export function Sec({ eyebrow, title, sub }: { eyebrow?: string; title: string; sub?: string }) {
  return (
    <div className="sec">
      {eyebrow && <span className="sec-eyebrow">{eyebrow}</span>}
      <span className="sec-title">{title}</span>
      {sub && <span className="sec-sub">· {sub}</span>}
    </div>
  );
}

export function Kpi({ label, value, unit, note }: { label: string; value: string; unit?: string; note?: ReactNode }) {
  return (
    <div className="card kpi">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">
        {value}
        {unit && value !== "—" && <small>{unit}</small>}
      </div>
      {note && <div className="kpi-note">{note}</div>}
    </div>
  );
}

export function Note({ children, variant = "info" }: { children: ReactNode; variant?: "info" | "neutral" | "warn" | "critical" }) {
  return <div className={`note note-${variant}`}>{children}</div>;
}

export function Finding({ children }: { children: ReactNode }) {
  return (
    <div className="finding">
      <span className="finding-eyebrow">Achado</span>
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

export function Tiles({ items }: { items: { n: number | string; label: string; status: Status | StatusSla }[] }) {
  return (
    <div className="tiles">
      {items.map((t) => (
        <div key={t.label} className={`tile s-${t.status}`}>
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
  const comAjuda = cols.filter((c) => c.help);
  return (
    <>
      <div className="table-wrap">
        <table className="t">
          <thead>
            <tr>
              {cols.map((c) => (
                <th key={c.key} className={c.align} title={c.help}>
                  {c.label}
                  {c.help && <span style={{ opacity: 0.6, marginLeft: 4 }}>ⓘ</span>}
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
      {/* a explicação fica VISÍVEL: o ⓘ sozinho quase ninguém descobria */}
      {comAjuda.length > 0 && (
        <div className="legend">
          {comAjuda.map((c) => (
            <div key={c.key}>
              <b>{c.label}:</b> {c.help}
            </div>
          ))}
        </div>
      )}
    </>
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

export function Hint({ children }: { children: ReactNode }) {
  return (
    <div className="hint">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51z" />
        <path d="M13 13l6 6" />
      </svg>
      {children}
    </div>
  );
}

/** Um tooltip só para a página inteira: qualquer elemento com data-tip
 * mostra o texto ao passar o mouse (delegação de eventos, sem listener
 * por elemento). */
export function TooltipLayer() {
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null);
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const el = (e.target as HTMLElement | null)?.closest?.("[data-tip]") as HTMLElement | null;
      const text = el?.dataset.tip;
      setTip(text ? { x: e.clientX, y: e.clientY, text } : null);
    };
    const leave = () => setTip(null);
    document.addEventListener("pointermove", move);
    document.addEventListener("scroll", leave, true);
    return () => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("scroll", leave, true);
    };
  }, []);
  if (!tip) return null;
  const x = Math.min(Math.max(tip.x, 160), (typeof window !== "undefined" ? window.innerWidth : 1000) - 160);
  return (
    <div className="tip" style={{ left: x, top: tip.y }}>
      {tip.text}
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
