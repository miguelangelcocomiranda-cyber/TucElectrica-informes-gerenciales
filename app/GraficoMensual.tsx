// app/GraficoMensual.tsx
// Gráfico de barras (SVG puro) para comparar la facturación neta mes a mes.
// Mismo lienzo y tipografía que GraficoDiario para que las dos tarjetas
// (apiladas una debajo de la otra) se lean igual de grandes.
//
// Igual que GraficoDiario: el ancho se mide del contenedor real con
// ResizeObserver para que el texto y las barras no queden diminutos en
// celular (por eso ahora es Client Component, aunque no tenga tooltip).
"use client";

import { useEffect, useRef, useState } from "react";

type Punto = { mes: string; monto: number };

const ASPECT = 340 / 900;

function fmtEje(v: number) {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return (v / 1_000_000).toFixed(1) + "M";
  return Math.round(v / 1000) + "K";
}

function fmtMesCorto(mesStr: string) {
  const [anio, mes] = mesStr.split("-");
  const d = new Date(Number(anio), Number(mes) - 1, 1);
  const label = d.toLocaleDateString("es-AR", { month: "short", year: "2-digit" });
  return label.charAt(0).toUpperCase() + label.slice(1).replace(".", "");
}

export default function GraficoMensual({ datos }: { datos: Punto[] }) {
  const contRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(900);

  useEffect(() => {
    const el = contRef.current;
    if (!el) return;
    if (el.clientWidth > 0) setWidth(el.clientWidth);
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w && w > 0) setWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (!datos || datos.length === 0) {
    return <div className="py-8 text-center text-sm text-slate-400">Sin datos para este período.</div>;
  }

  const chico = width < 480;
  const W = Math.max(width, 220);
  const H = Math.max(Math.round(W * ASPECT), 140);
  const padL = chico ? 42 : 68,
    padR = 10,
    padT = chico ? 26 : 32,
    padB = 28;
  const plotW = W - padL - padR,
    plotH = H - padT - padB;
  const fsEje = chico ? 11 : 13;
  const maxV = Math.max(...datos.map((d) => d.monto), 1);
  const n = datos.length;
  const bandW = plotW / n;
  const barW = Math.min(bandW * (chico ? 0.6 : 0.5), 120);

  const steps = 4;
  const gridLines = Array.from({ length: steps + 1 }, (_, s) => (maxV * s) / steps);
  const y = (v: number) => padT + plotH - (v / maxV) * plotH;

  return (
    <div ref={contRef} style={{ width: "100%" }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Facturación por mes" style={{ display: "block", height: "auto" }}>
        {gridLines.map((v, i) => (
          <g key={i}>
            <line x1={padL} x2={W - padR} y1={y(v)} y2={y(v)} stroke="#e2e8f0" strokeWidth={1} />
            <text x={padL - 8} y={y(v) + 4} fontSize={fsEje} textAnchor="end" fill="#64748b">
              {fmtEje(v)}
            </text>
          </g>
        ))}
        {datos.map((d, i) => {
          const cx = padL + i * bandW + bandW / 2;
          const barH = Math.max((d.monto / maxV) * plotH, 2);
          const yTop = padT + plotH - barH;
          return (
            <g key={d.mes}>
              <rect x={cx - barW / 2} y={yTop} width={barW} height={barH} rx={6} fill="#6366f1" />
              <text x={cx} y={yTop - 10} fontSize={fsEje} fontWeight={700} textAnchor="middle" fill="#334155">
                {fmtEje(d.monto)}
              </text>
              <text x={cx} y={H - 8} fontSize={fsEje} textAnchor="middle" fill="#64748b">
                {fmtMesCorto(d.mes)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}