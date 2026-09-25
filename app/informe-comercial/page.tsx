// app/informe-comercial/page.tsx
import { calcularDashboard, listarMesesCargados, Dashboard } from "@/lib/calculos";
import { resolverPeriodo } from "@/lib/periodo";
import Filtros from "../Filtros";

export const dynamic = "force-dynamic";

function fmtMoney(n: number) {
  return "$" + Math.round(n).toLocaleString("es-AR");
}
function fmtInt(n: number) {
  return Math.round(n).toLocaleString("es-AR");
}
function fmtPct(n: number) {
  return (n || 0).toLocaleString("es-AR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%";
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-xl font-semibold text-slate-900">{value}</div>
    </div>
  );
}

function Ranking({ filas, total }: { filas: { etiqueta: string; monto: number }[]; total: number }) {
  if (filas.length === 0) return <p className="mt-3 text-sm text-slate-400">Sin datos para este período.</p>;
  const max = Math.max(...filas.map((f) => f.monto), 1);
  return (
    <div className="mt-3 space-y-2 rounded-xl border border-slate-200 bg-white p-4">
      {filas.map((f, i) => (
        <div key={f.etiqueta} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
          <span className="w-5 shrink-0 text-right text-xs font-medium text-slate-400">{i + 1}</span>
          <div>
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="truncate text-slate-700">{f.etiqueta}</span>
              <span className="shrink-0 font-medium text-slate-900">{fmtMoney(f.monto)}</span>
            </div>
            <div className="mt-1 h-1.5 rounded-full bg-slate-100">
              <div className="h-1.5 rounded-full bg-indigo-500" style={{ width: `${Math.max((f.monto / max) * 100, 2)}%` }} />
            </div>
          </div>
          <span className="w-12 shrink-0 text-right text-xs text-slate-400">{total ? fmtPct((f.monto / total) * 100) : "—"}</span>
        </div>
      ))}
    </div>
  );
}

export default async function InformeComercialPage({ searchParams }: { searchParams: Promise<{ meses?: string; pv?: string }> }) {
  const sp = await searchParams;
  const mesesCargados = await listarMesesCargados();
  const todosLosMeses = mesesCargados.map((m) => m.mes).sort();

  if (todosLosMeses.length === 0) {
    return (
      <main className="mx-auto max-w-6xl px-6 py-8">
        <h1 className="text-2xl font-semibold text-slate-900">Informe Comercial</h1>
        <p className="mt-4 text-slate-500">Todavía no hay ningún mes cargado.</p>
      </main>
    );
  }

  const { mesesSeleccionados, puntoVenta } = resolverPeriodo(sp, todosLosMeses);
  const data: Dashboard = await calcularDashboard(mesesSeleccionados, puntoVenta);

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Informe Comercial</h1>
        <p className="mt-0.5 text-sm text-slate-500">Ranking de vendedores, rubros y productos del período elegido</p>
      </div>

      <Filtros basePath="/informe-comercial" todosLosMeses={todosLosMeses} mesesSeleccionados={mesesSeleccionados} puntoVenta={puntoVenta} />

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Kpi label="Facturación Neta (con IVA)" value={fmtMoney(data.kpis.facturacion_neta)} />
        <Kpi label="Operaciones" value={fmtInt(data.kpis.cant_operaciones)} />
        <Kpi label="Ticket Promedio" value={fmtMoney(data.kpis.ticket_promedio)} />
      </div>

      <section className="mt-10">
        <h2 className="text-base font-semibold text-slate-900">Ranking por vendedor</h2>
        <p className="mt-1 rounded-md bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800">
          ⚠ Estos montos son SIN IVA (así los entrega Fénix). No los compares en pesos contra la Facturación Neta de arriba, que es con IVA — los
          porcentajes de esta lista sí son correctos entre vendedores.
        </p>
        {data.por_vendedor.length === 0 && (
          <p className="mt-3 text-sm text-slate-400">No hay archivo de Venta por Vendedor cargado para el período elegido.</p>
        )}
        {data.por_vendedor.length > 0 && data.vendedor_meses.length < mesesSeleccionados.length && (
          <p className="mt-2 text-xs text-slate-400">
            Sólo hay reporte de vendedor cargado para: {data.vendedor_meses.join(", ") || "ninguno de los meses elegidos"}.
          </p>
        )}
        <Ranking filas={data.por_vendedor.map((v) => ({ etiqueta: v.vendedor, monto: v.monto }))} total={data.vendedor_total} />
        {data.por_vendedor.length > 0 && (
          <p className="mt-2 text-xs font-medium text-amber-700">⚠ Recordá: los montos de arriba son SIN IVA.</p>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-base font-semibold text-slate-900">Por rubro</h2>
        <Ranking filas={data.por_rubro.map((r) => ({ etiqueta: r.rubro, monto: r.monto }))} total={data.kpis.facturacion_neta} />
      </section>

      <section className="mt-10">
        <h2 className="text-base font-semibold text-slate-900">Por selección (marca / línea)</h2>
        {data.por_seleccion.length === 0 && <p className="mt-3 text-sm text-slate-400">No hay archivo de Costo cargado para el período elegido.</p>}
        {data.por_seleccion.length > 0 && (
          <Ranking filas={data.por_seleccion.map((s) => ({ etiqueta: s.seleccion, monto: s.monto }))} total={data.kpis.facturacion_neta} />
        )}
      </section>

      <section className="mb-16 mt-10">
        <h2 className="text-base font-semibold text-slate-900">Top 30 productos</h2>
        <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2">Artículo</th>
                <th className="px-4 py-2 text-right">Cantidad</th>
                <th className="px-4 py-2 text-right">Monto</th>
              </tr>
            </thead>
            <tbody>
              {data.por_producto.slice(0, 30).map((p) => (
                <tr key={p.codigo} className="border-t border-slate-100">
                  <td className="px-4 py-2">{p.nombre}</td>
                  <td className="px-4 py-2 text-right text-slate-500">{fmtInt(p.cantidad)}</td>
                  <td className="px-4 py-2 text-right font-medium">{fmtMoney(p.monto)}</td>
                </tr>
              ))}
              {data.por_producto.length === 0 && (
                <tr>
                  <td className="px-4 py-3 text-slate-400" colSpan={3}>
                    Sin datos para este período.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
