import type { Metadata } from "next";
import { Roboto, Roboto_Mono } from "next/font/google";
import "./globals.css";

// Roboto é a fonte oficial da Artefact para ativos digitais
const roboto = Roboto({ subsets: ["latin"], weight: ["400", "500", "700", "900"], variable: "--font-roboto" });
const mono = Roboto_Mono({ subsets: ["latin"], weight: ["500", "700"], variable: "--font-roboto-mono" });

export const metadata: Metadata = {
  title: "Farol de Hiring · Artefact",
  description: "Ritmo de contratação por chapter e senioridade: acelerar, manter ou pausar.",
  icons: { icon: "/artefact_a_gradient.png" },
  robots: { index: false, follow: false },
};

// Aplica o tema salvo (ou o do sistema) antes da primeira pintura, para
// não piscar claro ao abrir no escuro.
const temaInicial = `(function(){try{var t=localStorage.getItem('farol-tema');if(!t)t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';document.documentElement.dataset.theme=t}catch(e){}})()`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${roboto.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: temaInicial }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
