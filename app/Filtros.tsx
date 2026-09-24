// app/Filtros.tsx
"use client";

import { useRouter, useSearchParams } from "next/navigation";

const PUNTOS_VENTA = [
  { value: "all", label: "Todos los puntos de venta" },
  { value: "0004", label: "0004 — Facturación Electrónica" },
  { value: "0000", label: "0000" },
];

export default function Filtros({
  todosLosMeses,
  mesesSeleccionados,
  puntoVenta,
}: {
  todosLosMeses: string[];
  mesesSeleccionados: string[];
  puntoVenta: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function actualizar(meses: string[], pv: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (meses.length > 0) params.set("meses", meses.join(","));
    else params.delete("meses");
    if (pv && pv !== "all") params.set("pv", pv);
    else params.delete("pv");
    router.push(`/?${params.toString()}`);
  }

  function toggleMes(mes: string) {
    const nuevos = mesesSeleccionados.includes(mes) ? mesesSeleccionados.filter((m) => m !== mes) : [...mesesSeleccionados, mes];
    actualizar(nuevos, puntoVenta);
  }

  return (
    <div className="mt-6 flex flex-wrap items-start justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4">
      <div>
        <div className="text-xs font-medium text-slate-500">Meses</div>
        <div className="mt-2 flex flex-wrap gap-2">
          {todosLosMeses.map((mes) => {
            const activo = mesesSeleccionados.includes(mes);
            return (
              <button
                key={mes}
                onClick={() => toggleMes(mes)}
                className={
                  "rounded-full border px-3 py-1 text-xs font-medium transition " +
                  (activo ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300")
                }
              >
                {mes}
              </button>
            );
          })}
          <button
            onClick={() => actualizar(todosLosMeses, puntoVenta)}
            className="rounded-full border border-dashed border-slate-300 px-3 py-1 text-xs font-medium text-slate-500 hover:border-slate-400"
          >
            Todos
          </button>
        </div>
      </div>

      <div>
        <label className="text-xs font-medium text-slate-500">Punto de venta</label>
        <select
          value={puntoVenta}
          onChange={(e) => actualizar(mesesSeleccionados, e.target.value)}
          className="mt-2 block rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700"
        >
          {PUNTOS_VENTA.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
