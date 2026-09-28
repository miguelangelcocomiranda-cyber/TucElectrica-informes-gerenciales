// app/comisiones/page.tsx
//
// Comisiones de Vendedores: acá se sube, mes por mes, el archivo "Venta por
// Vendedor" de Fénix (VentaCantidadVendedorExport-####.xlsx, SIN IVA) —
// aparte del Importador Mensual, para no confundirlo con la carga general.
// Por cada vendedor se puede escribir (y se guarda solo) el % de comisión
// que cobra, y la pantalla calcula el monto que le corresponde sobre las
// ventas de los meses elegidos.
"use client";

import { useEffect, useState } from "react";
import { listarMesesVendedor, obtenerComisiones, guardarPorcentaje, subirVentaPorVendedor, ComisionFila } from "./actions";

function fmtMoney(n: number) {
  return "$" + Math.round(n).toLocaleString("es-AR");
}

export default function ComisionesPage() {
  const [mesesDisponibles, setMesesDisponibles] = useState<string[]>([]);
  const [mesesSeleccionados, setMesesSeleccionados] = useState<string[]>([]);
  const [cargandoMeses, setCargandoMeses] = useState(true);

  const [filas, setFilas] = useState<ComisionFila[]>([]);
  const [totalVentas, setTotalVentas] = useState(0);
  const [totalComision, setTotalComision] = useState(0);
  const [cargandoComisiones, setCargandoComisiones] = useState(false);

  const [guardandoVendedor, setGuardandoVendedor] = useState<string | null>(null);
  const [erroresGuardado, setErroresGuardado] = useState<Record<string, string>>({});

  const [mesSubida, setMesSubida] = useState("");
  const [archivoSubida, setArchivoSubida] = useState<File | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [subirResultado, setSubirResultado] = useState<{ ok: boolean; texto: string } | null>(null);

  async function cargarMeses(seleccionarUltimo: boolean) {
    setCargandoMeses(true);
    try {
      const meses = await listarMesesVendedor();
      setMesesDisponibles(meses);
      if (seleccionarUltimo && meses.length > 0) {
        setMesesSeleccionados([meses[0]]);
      }
    } finally {
      setCargandoMeses(false);
    }
  }

  useEffect(() => {
    cargarMeses(true);
  }, []);

  useEffect(() => {
    if (mesesSeleccionados.length === 0) {
      setFilas([]);
      setTotalVentas(0);
      setTotalComision(0);
      return;
    }
    setCargandoComisiones(true);
    obtenerComisiones(mesesSeleccionados)
      .then((r) => {
        setFilas(r.filas);
        setTotalVentas(r.totalVentas);
        setTotalComision(r.totalComision);
      })
      .finally(() => setCargandoComisiones(false));
  }, [mesesSeleccionados]);

  function toggleMes(mes: string) {
    setMesesSeleccionados((prev) => (prev.includes(mes) ? prev.filter((m) => m !== mes) : [...prev, mes]));
  }

  function onPorcentajeChange(vendedor: string, valorTexto: string) {
    const valor = valorTexto === "" ? 0 : Number(valorTexto);
    setFilas((prev) =>
      prev.map((f) => (f.vendedor === vendedor ? { ...f, porcentaje: valor, comision: Math.round(((f.ventas * valor) / 100) * 100) / 100 } : f))
    );
  }

  async function onPorcentajeBlur(vendedor: string, valorTexto: string) {
    const valor = valorTexto === "" ? 0 : Number(valorTexto);
    if (!Number.isFinite(valor) || valor < 0) {
      setErroresGuardado((prev) => ({ ...prev, [vendedor]: "Porcentaje inválido." }));
      return;
    }
    setGuardandoVendedor(vendedor);
    setErroresGuardado((prev) => {
      const { [vendedor]: _quitar, ...resto } = prev;
      return resto;
    });
    try {
      const r = await guardarPorcentaje(vendedor, valor);
      if (!r.ok) setErroresGuardado((prev) => ({ ...prev, [vendedor]: r.error }));
    } finally {
      setGuardandoVendedor(null);
    }
  }

  async function onSubir() {
    if (!archivoSubida || !mesSubida) return;
    setSubiendo(true);
    setSubirResultado(null);
    try {
      const fd = new FormData();
      fd.set("mes", mesSubida);
      fd.set("archivo", archivoSubida);
      const r = await subirVentaPorVendedor(fd);
      setSubirResultado({ ok: r.ok, texto: r.ok ? r.mensaje : r.error });
      if (r.ok) {
        setArchivoSubida(null);
        const yaEstabaSeleccionado = mesesSeleccionados.includes(mesSubida);
        await cargarMeses(false);
        if (!yaEstabaSeleccionado) setMesesSeleccionados((prev) => [...prev, mesSubida].sort().reverse());
      }
    } finally {
      setSubiendo(false);
    }
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Comisiones de Vendedores</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Calculadas directo sobre el reporte "Venta por Vendedor" de Fénix (sin IVA) — no sobre la Facturación Neta con IVA que usan las otras pantallas.
        </p>
      </div>

      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Subir Venta por Vendedor de un mes</h2>
        <p className="mt-1 text-xs text-slate-400">
          En Fénix se llama VentaCantidadVendedorExport-####.xlsx. Subilo acá mes por mes — reemplaza lo que hubiera cargado para ese mes (sea que se haya
          subido acá o desde Importador Mensual, es la misma información).
        </p>
        <div className="mt-4 flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-600">Mes</label>
            <input
              type="month"
              value={mesSubida}
              onChange={(e) => setMesSubida(e.target.value)}
              className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-600">Archivo</label>
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => setArchivoSubida(e.target.files?.[0] || null)}
              className="text-sm file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-slate-200"
            />
          </div>
          <button
            onClick={onSubir}
            disabled={!archivoSubida || !mesSubida || subiendo}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            {subiendo ? "Subiendo…" : "Subir"}
          </button>
        </div>
        {subirResultado && (
          <div
            className={`mt-4 rounded-lg p-3 text-sm ${subirResultado.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}
          >
            {subirResultado.texto}
          </div>
        )}
      </div>

      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4">
        <div className="text-xs font-medium text-slate-500">Meses a calcular</div>
        <div className="mt-2 flex flex-wrap gap-2">
          {cargandoMeses && <span className="text-xs text-slate-400">Cargando…</span>}
          {!cargandoMeses && mesesDisponibles.length === 0 && (
            <span className="text-xs text-slate-400">Todavía no subiste ningún mes de Venta por Vendedor.</span>
          )}
          {mesesDisponibles.map((mes) => {
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
        </div>
      </div>

      <section className="mb-16 mt-6">
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2">Vendedor</th>
                <th className="px-4 py-2 text-right">Ventas (sin IVA)</th>
                <th className="px-4 py-2 text-right">% Comisión</th>
                <th className="px-4 py-2 text-right">Comisión</th>
              </tr>
            </thead>
            <tbody>
              {cargandoComisiones && (
                <tr>
                  <td className="px-4 py-3 text-slate-400" colSpan={4}>
                    Calculando…
                  </td>
                </tr>
              )}
              {!cargandoComisiones && mesesSeleccionados.length === 0 && (
                <tr>
                  <td className="px-4 py-3 text-slate-400" colSpan={4}>
                    Elegí al menos un mes arriba.
                  </td>
                </tr>
              )}
              {!cargandoComisiones && mesesSeleccionados.length > 0 && filas.length === 0 && (
                <tr>
                  <td className="px-4 py-3 text-slate-400" colSpan={4}>
                    Sin datos de vendedor para el/los mes(es) elegido(s).
                  </td>
                </tr>
              )}
              {!cargandoComisiones &&
                filas.map((f) => (
                  <tr key={f.vendedor} className="border-t border-slate-100">
                    <td className="px-4 py-2 font-medium">{f.vendedor}</td>
                    <td className="px-4 py-2 text-right">{fmtMoney(f.ventas)}</td>
                    <td className="px-4 py-2 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <input
                          type="number"
                          min={0}
                          step="0.1"
                          defaultValue={f.porcentaje}
                          onChange={(e) => onPorcentajeChange(f.vendedor, e.target.value)}
                          onBlur={(e) => onPorcentajeBlur(f.vendedor, e.target.value)}
                          className="w-20 rounded-md border border-slate-300 px-2 py-1 text-right text-sm"
                        />
                        <span className="text-slate-400">%</span>
                        {guardandoVendedor === f.vendedor && <span className="text-xs text-slate-400">guardando…</span>}
                      </div>
                      {erroresGuardado[f.vendedor] && <div className="mt-0.5 text-right text-xs text-red-600">{erroresGuardado[f.vendedor]}</div>}
                    </td>
                    <td className="px-4 py-2 text-right font-semibold text-slate-900">{fmtMoney(f.comision)}</td>
                  </tr>
                ))}
            </tbody>
            {!cargandoComisiones && filas.length > 0 && (
              <tfoot>
                <tr className="border-t border-slate-200 bg-slate-50 font-semibold text-slate-900">
                  <td className="px-4 py-2">Total</td>
                  <td className="px-4 py-2 text-right">{fmtMoney(totalVentas)}</td>
                  <td className="px-4 py-2"></td>
                  <td className="px-4 py-2 text-right">{fmtMoney(totalComision)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>
    </main>
  );
}
