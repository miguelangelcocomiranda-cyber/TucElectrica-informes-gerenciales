// app/GraficoDiario.tsx
// Gráfico de línea (SVG puro) para la evolución diaria de facturación neta.
// Es Client Component porque tiene tooltip interactivo: al pasar el mouse
// (o el dedo) por arriba muestra el día exacto y el monto de ese día.
"use client";

import { useState, type PointerEvent } from "react";

type Punto = { fecha: string; monto: number };

function fmtEje(v: number) {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return (v / 1_000_000).toFixed(1) + "M";
  return Math.round(v / 1000) + "K";
}

function fmtFechaCorta(fstr: string) {
  const d = new Date(fstr + "T00:00:00");
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "short" });
}

function fmtFechaLarga(fstr: string) {
  const d = new Date(fstr + "T00:00:00");
  const label = d.toLocaleDateString("es-AR", { day: "2-digit", month: "long", year: "numeric" });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function fmtMoney(n: number) {
  return "$" + Math.round(n).toLocaleString("es-AR");
}

export default function GraficoDiario({ datos }: { datos: Punto[] }) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  if (!datos || datos.length === 0) {
    return <div className="py-8 text-center text-sm text-slate-400">Sin datos para este período.</div>;
  }

  const W = 900,
    H = 340,
    padL = 68,
    padR = 16,
    padT = 24,
    padB = 36;
  const plotW = W - padL - padR,
    plotH = H - padT - padB;
  const vals = datos.map((d) => d.monto);
  const maxV = Math.max(...vals, 0);
  const minV = Math.min(...vals, 0);
  const range = maxV - minV || 1;
  const n = Math.max(datos.length - 1, 1);
  const x = (i: number) => padL + (i / n) * plotW;
  const y = (v: number) => padT + plotH - ((v - minV) / range) * plotH;
  const zeroY = y(0);

  const linePath = datos.map((d, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(d.monto)}`).join(" ");
  const areaPath = `M ${x(0)} ${zeroY} ` + datos.map((d, i) => `L ${x(i)} ${y(d.monto)}`).join(" ") + ` L ${x(n)} ${zeroY} Z`;

  const steps = 4;
  const gridLines = Array.from({ length: steps + 1 }, (_, s) => minV + (range * s) / steps);
  const idxLabels = Array.from(new Set([0, Math.floor(n / 2), n]));

  function manejarMovimiento(e: PointerEvent<SVGRectElement>) {
    const svg = e.currentTarget.ownerSVGElement;
    if (!svg) return;
    const ctm = svg.getScreenCTM();
    if (!ctm) return;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const local = pt.matrixTransform(ctm.inverse());
    const posicion = ((local.x - padL) / plotW) * n;
    const idx = Math.min(Math.max(Math.round(posicion), 0), n);
    setHoverIdx(idx);
  }

  const activo = hoverIdx !== null ? datos[hoverIdx] : undefined;
  const tipW = 168,
    tipH = 50;
  let tipX = hoverIdx !== null ? x(hoverIdx) + 14 : 0;
  if (hoverIdx !== null && tipX + tipW > W - padR) tipX = x(hoverIdx) - tipW - 14;
  const tipY = padT + 6;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      role="img"
      aria-label="Facturación diaria"
      style={{ display: "block", height: "auto" }}
    >
      {gridLines.map((v, i) => (
        <g key={i}>
          <line x1={padL} x2={W - padR} y1={y(v)} y2={y(v)} stroke="#e2e8f0" strokeWidth={1} />
          <text x={padL - 10} y={y(v) + 5} fontSize={17} textAnchor="end" fill="#64748b">
            {fmtEje(v)}
          </text>
        </g>
      ))}
      <line x1={padL} x2={W - padR} y1={zeroY} y2={zeroY} stroke="#cbd5e1" strokeWidth={1} />
      <path d={areaPath} fill="#6366f1" fillOpacity={0.12} stroke="none" />
      <path d={linePath} fill="none" stroke="#6366f1" strokeWidth={3} />
      {idxLabels.map((i) => (
        <text
          key={i}
          x={x(i)}
          y={H - 10}
          fontSize={17}
          textAnchor={i === 0 ? "start" : i === n ? "end" : "middle"}
          fill="#64748b"
        >
          {fmtFechaCorta(datos[i].fecha)}
        </text>
      ))}

      {activo && hoverIdx !== null && (
        <g pointerEvents="none">
          <line x1={x(hoverIdx)} x2={x(hoverIdx)} y1={padT} y2={padT + plotH} stroke="#94a3b8" strokeWidth={1} strokeDasharray="4 4" />
          <circle cx={x(hoverIdx)} cy={y(activo.monto)} r={6} fill="#6366f1" stroke="white" strokeWidth={2.5} />
          <g transform={`translate(${tipX}, ${tipY})`}>
            <rect width={tipW} height={tipH} rx={8} fill="#1e293b" opacity={0.95} />
            <text x={12} y={20} fontSize={13} fill="#cbd5e1">
              {fmtFechaLarga(activo.fecha)}
            </text>
            <text x={12} y={39} fontSize={17} fontWeight={700} fill="#ffffff">
              {fmtMoney(activo.monto)}
            </text>
          </g>
        </g>
      )}

      <rect
        x={padL}
        y={padT}
        width={plotW}
        height={plotH}
        fill="transparent"
        onPointerMove={manejarMovimiento}
        onPointerLeave={() => setHoverIdx(null)}
      />
    </svg>
  );
}
