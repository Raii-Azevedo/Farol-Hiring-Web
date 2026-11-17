"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { Dashboard } from "@/lib/model";
import { TODOS, dataBR, rotuloMes } from "@/lib/model";
import type { Usuario } from "@/lib/acesso";
import { sair } from "@/app/actions";
import { Note, Toast, TooltipLayer } from "./ui";
import { Gerencial } from "./tabs/Gerencial";
import { FarolExecutivo } from "./tabs/FarolExecutivo";
import { VisaoPipe } from "./tabs/VisaoPipe";
import { Comparacao } from "./tabs/Comparacao";
import { ComoLer } from "./tabs/ComoLer";

const TABS = [
  { id: "gerencial", label: "Visão Gerencial" },
  { id: "farol", label: "Farol Executivo" },
  { id: "pipe", label: "Visão do Pipe" },
  { id: "comparacao", label: "Comparação entre carreiras" },
  { id: "como-ler", label: "Como ler" },
] as const;
type TabId = (typeof TABS)[number]["id"];

interface Ctx {
  data: Dashboard;
  dark: boolean;
  pipeChapter: string;
  pipeSen: string;
  setPipe: (chapter: string, sen: string) => void;
  irPara: (tab: TabId, toast?: string) => void;
}
const AppCtx = createContext<Ctx | null>(null);
export const useApp = () => {
  const c = useContext(AppCtx);
  if (!c) throw new Error("fora do App");
  return c;
};

export function App({ data, usuario }: { data: Dashboard; usuario: Usuario }) {
  const [tab, setTab] = useState<TabId>("gerencial");
  const [dark, setDark] = useState(false);
  const [pipeChapter, setPipeChapter] = useState(TODOS);
  const [pipeSen, setPipeSen] = useState(TODOS);
  const [toast, setToast] = useState<string | null>(null);

  // aba na URL (#pipe): dá para mandar o link direto de uma aba
  useEffect(() => {
    const ler = () => {
      const h = window.location.hash.slice(1) as TabId;
      if (TABS.some((t) => t.id === h)) setTab(h);
    };
    ler();
    window.addEventListener("hashchange", ler);
    setDark(document.documentElement.dataset.theme === "dark");
    return () => window.removeEventListener("hashchange", ler);
  }, []);

  const irPara = useCallback((t: TabId, msg?: string) => {
    setTab(t);
    history.replaceState(null, "", `#${t}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
    if (msg) setToast(msg);
  }, []);

  const setPipe = useCallback((c: string, s: string) => {
    setPipeChapter(c);
    setPipeSen(s);
  }, []);

  const alternarTema = () => {
    const novo = dark ? "light" : "dark";
    document.documentElement.dataset.theme = novo;
    try { localStorage.setItem("farol-tema", novo); } catch {}
    setDark(!dark);
  };

  const iniciais = usuario.name.split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase();

  return (
    <AppCtx.Provider value={{ data, dark, pipeChapter, pipeSen, setPipe, irPara }}>
      <header className="topbar">
        <div className="wrap topbar-in">
          <div className="brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/artefact_a_white.png" alt="Artefact" />
            <div>
              <div className="brand-title">Farol de Hiring</div>
              <div className="brand-sub">Artefact · People &amp; Talent</div>
            </div>
          </div>
          <div className="top-actions">
            <div className="data-badge">
              <span>Pipe de <b>{dataBR(data.dataCarga)}</b></span>
              <span>Greenhouse + Artefactory</span>
            </div>
            <button className="icon-btn" onClick={alternarTema} aria-label="Alternar tema claro/escuro" title="Alternar tema">
              {dark ? "☀" : "☾"}
            </button>
            <div className="user-chip" title={`${usuario.email}${usuario.role ? ` · perfil: ${usuario.role}` : ""}`}>
              <span className="user-name">{usuario.name}</span>
              {!usuario.modoAberto && (
                <form action={sair}>
                  <button type="submit">Sair</button>
                </form>
              )}
              <span className="avatar">{iniciais}</span>
            </div>
          </div>
        </div>
      </header>

      <nav className="tabs-bar" aria-label="Seções">
        <div className="wrap tabs" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              className="tab"
              aria-selected={tab === t.id}
              onClick={() => irPara(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </nav>

      <main className="wrap">
        {usuario.modoAberto && (
          <Note variant="warn">
            🔓 Autenticação Google não configurada (<code>AUTH_GOOGLE_ID</code> ausente). Rodando em <b>modo aberto</b>,
            só permitido em desenvolvimento local. Em produção o app bloqueia o acesso.
          </Note>
        )}
        <Note variant="neutral">
          Dados oficiais do BigQuery. Pipe: foto de <b>{rotuloMes(data.mesSnapshot)}</b>; nenhuma view do Greenhouse
          tem data, então o funil não tem histórico. Demanda: forecast de <b>{rotuloMes(data.meses[0] ?? data.mesSnapshot)}</b> a{" "}
          <b>{rotuloMes(data.meses[data.meses.length - 1] ?? data.mesSnapshot)}</b> (o Artefactory projeta até{" "}
          {rotuloMes(data.fimForecast)}, mas comparar o pipe de hoje com demanda tão distante não ajuda a decidir agora).
          {data.chaptersSemDemanda.length > 0 && (
            <> Sem demanda cadastrada: <b>{data.chaptersSemDemanda.join(", ")}</b>; aparecem no funil, mas não têm farol.</>
          )}
        </Note>

        <div key={tab} className="fade-in">
          {tab === "gerencial" && <Gerencial />}
          {tab === "farol" && <FarolExecutivo />}
          {tab === "pipe" && <VisaoPipe />}
          {tab === "comparacao" && <Comparacao />}
          {tab === "como-ler" && <ComoLer />}
        </div>
      </main>

      <footer className="footer">
        Farol de Hiring · Artefact People &amp; Talent · Greenhouse (pipe) + Artefactory (demanda) · atualizado{" "}
        {new Date(data.geradoEm).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" })}
      </footer>

      <TooltipLayer />
      {toast && <Toast text={toast} onDone={() => setToast(null)} />}
    </AppCtx.Provider>
  );
}
