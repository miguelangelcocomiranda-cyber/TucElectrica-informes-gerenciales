// app/comisiones/GraficoHistorialComisiones.tsx
//
// Evolución mes a mes de la comisión de cada vendedor (con su % actual
// aplicado a las ventas históricas de cada mes). Una línea por vendedor,
// con el mismo lienzo responsive (ResizeObserver + viewBox) que los otros
// gráficos de la app, más una capa de hover (crosshair + tooltip) y una
// tabla equivalente como alternativa accesible, siguiendo el estándar de
// gráficos de la casa.
"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";

type Serie = { vendedor: string; valores: number[] };
type Datos = { meses: string[]; series: Serie[] };

const ASPECT = 340 / 900;

// Paleta categórica validada (orden fijo, nunca rotado): azul, naranja, agua,
// amarillo, magenta, verde, violeta, rojo — alcanza para los 7 vendedores
// actuales sin repetir color.
const PALETTE = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948"];

function fmtEje(v: number) {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return (v / 1_000_000).toFixed(1) + "M";
  if (abs >= 1000) return Math.round(v / 1000) + "K";
  return String(Math.round(v));
}

function fmtMoney(n: number) {
  return "$" + Math.round(n).toLocaleString("es-AR");
}

function fmtMesCorto(mesStr: string) {
  const [anio, mes] = mesStr.split("-");
  const d = new Date(Number(anio), Number(mes) - 1, 1);
  const label = d.toLocaleDateString("es-AR", { month: "short", year: "2-digit" });
  return label.charAt(0).toUpperCase() + label.slice(1).replace(".", "");
}

export default function GraficoHistorialComisiones({ datos }: { datos: Datos }) {
  const contRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(900);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [verTabla, setVerTabla] = useState(false);

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

  const { meses, series } = datos;

  if (!meses || meses.length === 0 || !series || series.length === 0) {
    return <div className="py-8 text-center text-sm text-slate-400">Todavía no hay suficientes meses cargados para ver una evolución.</div>;
  }

  const chico = width < 480;
  const W = Math.max(width, 220);
  const H = Math.max(Math.round(W * ASPECT), 180);
  const padL = chico ? 40 : 54,
    padR = 14,
    padT = 16,
    padB = 26;
  const plotW = W - padL - padR,
    plotH = H - padT - padB;
  const fsEje = chico ? 10 : 12;

  const n = meses.length;
  const maxV = Math.max(1, ...series.flatMap((s) => s.valores));
  const x = (i: number) => (n === 1 ? padL + plotW / 2 : padL + (i / (n - 1)) * plotW);
  const y = (v: number) => padT + plotH - (v / maxV) * plotH;

  const steps = 4;
  const gridLines = Array.from({ length: steps + 1 }, (_, s) => (maxV * s) / steps);

  function onMove(e: PointerEvent<SVGRectElement>) {
    const svg = e.currentTarget.ownerSVGElement;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    let closest = 0;
    let closestDist = Infinity;
    for (let i = 0; i < n; i++) {
      const d = Math.abs(x(i) - px);
      if (d < closestDist) {
        closestDist = d;
        closest = i;
      }
    }
    setHoverIdx(closest);
  }

  const hoveredValores =
    hoverIdx !== null ? series.map((s, i) => ({ vendedor: s.vendedor, color: PALETTE[i % PALETTE.length], valor: s.valores[hoverIdx] })).sort((a, b) => b.valor - a.valor) : [];

  const tooltipLeftPct = hoverIdx !== null ? Math.min(Math.max((x(hoverIdx) / W) * 100, 16), 84) : 50;

  return (
    <div>
      <div className="flex items-start justify-between gap-3 px-1 pb-3">
        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
          {series.map((s, i) => (
            <div key={s.vendedor} className="flex items-center gap-1.5 text-xs text-slate-600">
              <span className="inline-block h-0.5 w-3.5 rounded-full" style={{ backgroundColor: PALETTE[i % PALETTE.length] }} />
              {s.vendedor}
            </div>
          ))}
        </div>
        <button
          onClick={() => setVerTabla((v) => !v)}
          className="shrink-0 whitespace-nowrap text-xs font-medium text-slate-500 underline decoration-slate-300 underline-offset-2 hover:text-slate-700"
        >
          {verTabla ? "Ver gráfico" : "Ver como tabla"}
        </button>
      </div>

      {!verTabla && (
        <div ref={contRef} style={{ width: "100%", position: "relative" }}>
          <svg
            viewBox={`0 0 ${W} ${H}`}
            width="100%"
            role="img"
            aria-label="Evolución mensual de la comisión por vendedor"
            style={{ display: "block", height: "auto" }}
          >
            {gridLines.map((v, i) => (
              <g key={i}>
                <line x1={padL} x2={W - padR} y1={y(v)} y2={y(v)} stroke="#e1e0d9" strokeWidth={1} />
                <text x={padL - 8} y={y(v) + 4} fontSize={fsEje} textAnchor="end" fill="#898781">
                  {fmtEje(v)}
                </text>
              </g>
            ))}
            {meses.map((mes, i) => (
              <text key={mes} x={x(i)} y={H - 8} fontSize={fsEje} textAnchor="middle" fill="#898781">
                {fmtMesCorto(mes)}
              </text>
            ))}
            {hoverIdx !== null && <line x1={x(hoverIdx)} x2={x(hoverIdx)} y1={padT} y2={padT + plotH} stroke="#c3c2b7" strokeWidth={1} />}
            {series.map((s, si) => {
              const color = PALETTE[si % PALETTE.length];
              const path = s.valores.map((v, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(v)}`).join(" ");
              return (
                <g key={s.vendedor}>
                  <path d={path} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                  {hoverIdx !== null && <circle cx={x(hoverIdx)} cy={y(s.valores[hoverIdx])} r={4} fill={color} stroke="#fcfcfb" strokeWidth={2} />}
                </g>
              );
            })}
            <rect
              x={padL}
              y={padT}
              width={Math.max(plotW, 1)}
              height={Math.max(plotH, 1)}
              fill="transparent"
              onPointerMove={onMove}
              onPointerLeave={() => setHoverIdx(null)}
            />
          </svg>
          {hoverIdx !== null && (
            <div
              className="pointer-events-none absolute top-1 z-10 min-w-[9rem] rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-md"
              style={{ left: `${tooltipLeftPct}%`, transform: "translateX(-50%)" }}
            >
              <div className="mb-1 font-semibold text-slate-700">{fmtMesCorto(meses[hoverIdx])}</div>
              {hoveredValores.map((h) => (
                <div key={h.vendedor} className="flex items-center gap-2 whitespace-nowrap">
                  <span className="inline-block h-0.5 w-3 shrink-0 rounded-full" style={{ backgroundColor: h.color }} />
                  <span className="text-slate-500">{h.vendedor}</span>
                  <span className="ml-auto font-medium text-slate-900">{fmtMoney(h.valor)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {verTabla && (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-left font-medium uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">Vendedor</th>
                {meses.map((mes) => (
                  <th key={mes} className="px-3 py-2 text-right">
                    {fmtMesCorto(mes)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {series.map((s, i) => (
                <tr key={s.vendedor} className="border-t border-slate-100">
                  <td className="flex items-center gap-1.5 px-3 py-2 font-medium text-slate-700">
                    <span className="inline-block h-0.5 w-3 shrink-0 rounded-full" style={{ backgroundColor: PALETTE[i % PALETTE.length] }} />
                    {s.vendedor}
                  </td>
                  {s.valores.map((v, j) => (
                    <td key={j} className="px-3 py-2 text-right text-slate-600">
                      {fmtMoney(v)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
