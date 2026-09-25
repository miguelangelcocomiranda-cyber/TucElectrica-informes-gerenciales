// app/GraficoMensual.tsx
// Gráfico de barras simple (SVG puro) para comparar la facturación neta
// mes a mes dentro del período elegido. Misma paleta y estilo que
// GraficoDiario para que se vean como parte del mismo sistema.

type Punto = { mes: string; monto: number };

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
  if (!datos || datos.length === 0) {
    return <div className="py-8 text-center text-sm text-slate-400">Sin datos para este período.</div>;
  }

  const W = 420,
    H = 240,
    padL = 56,
    padR = 12,
    padT = 16,
    padB = 28;
  const plotW = W - padL - padR,
    plotH = H - padT - padB;
  const maxV = Math.max(...datos.map((d) => d.monto), 1);
  const n = datos.length;
  const bandW = plotW / n;
  const barW = Math.min(bandW * 0.7, 160);

  const steps = 4;
  const gridLines = Array.from({ length: steps + 1 }, (_, s) => (maxV * s) / steps);
  const y = (v: number) => padT + plotH - (v / maxV) * plotH;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Facturación por mes" style={{ display: "block", height: "auto" }}>
      {gridLines.map((v, i) => (
        <g key={i}>
          <line x1={padL} x2={W - padR} y1={y(v)} y2={y(v)} stroke="#e2e8f0" strokeWidth={1} />
          <text x={padL - 8} y={y(v) + 3} fontSize={10} textAnchor="end" fill="#94a3b8">
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
            <rect x={cx - barW / 2} y={yTop} width={barW} height={barH} rx={4} fill="#6366f1" />
            <text x={cx} y={yTop - 6} fontSize={10} textAnchor="middle" fill="#475569">
              {fmtEje(d.monto)}
            </text>
            <text x={cx} y={H - 6} fontSize={10} textAnchor="middle" fill="#94a3b8">
              {fmtMesCorto(d.mes)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
