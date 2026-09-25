// app/GraficoDiario.tsx
// Gráfico de línea simple (SVG puro, sin librerías) para la evolución diaria
// de facturación neta. Sin interactividad por ahora — se puede sumar un
// tooltip más adelante si hace falta.

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

export default function GraficoDiario({ datos }: { datos: Punto[] }) {
  if (!datos || datos.length === 0) {
    return <div className="py-8 text-center text-sm text-slate-400">Sin datos para este período.</div>;
  }

  const W = 900,
    H = 280,
    padL = 64,
    padR = 16,
    padT = 20,
    padB = 34;
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

  // Etiquetas de fecha: primera, mitad y última, para no amontonar texto.
  const idxLabels = Array.from(new Set([0, Math.floor(n / 2), n]));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Facturación diaria" style={{ display: "block", height: "auto" }}>
      {gridLines.map((v, i) => (
        <g key={i}>
          <line x1={padL} x2={W - padR} y1={y(v)} y2={y(v)} stroke="#e2e8f0" strokeWidth={1} />
          <text x={padL - 10} y={y(v) + 5} fontSize={16} textAnchor="end" fill="#64748b">
            {fmtEje(v)}
          </text>
        </g>
      ))}
      <line x1={padL} x2={W - padR} y1={zeroY} y2={zeroY} stroke="#cbd5e1" strokeWidth={1} />
      <path d={areaPath} fill="#6366f1" fillOpacity={0.12} stroke="none" />
      <path d={linePath} fill="none" stroke="#6366f1" strokeWidth={2.5} />
      {idxLabels.map((i) => (
        <text key={i} x={x(i)} y={H - 8} fontSize={16} textAnchor={i === 0 ? "start" : i === n ? "end" : "middle"} fill="#64748b">
          {fmtFechaCorta(datos[i].fecha)}
        </text>
      ))}
    </svg>
  );
}
