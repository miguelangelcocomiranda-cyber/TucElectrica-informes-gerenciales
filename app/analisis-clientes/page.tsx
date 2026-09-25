// app/analisis-clientes/page.tsx
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

export default async function AnalisisClientesPage({ searchParams }: { searchParams: Promise<{ meses?: string; pv?: string }> }) {
  const sp = await searchParams;
  const mesesCargados = await listarMesesCargados();
  const todosLosMeses = mesesCargados.map((m) => m.mes).sort();

  if (todosLosMeses.length === 0) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <h1 className="text-2xl font-semibold text-slate-900">Análisis de Clientes</h1>
        <p className="mt-4 text-slate-500">Todavía no hay ningún mes cargado.</p>
      </main>
    );
  }

  const { mesesSeleccionados, puntoVenta } = resolverPeriodo(sp, todosLosMeses);
  const data: Dashboard = await calcularDashboard(mesesSeleccionados, puntoVenta);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Análisis de Clientes</h1>
        <p className="mt-0.5 text-sm text-slate-500">Detalle completo de clientes compradores del período elegido</p>
      </div>

      <Filtros basePath="/analisis-clientes" todosLosMeses={todosLosMeses} mesesSeleccionados={mesesSeleccionados} puntoVenta={puntoVenta} />

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Kpi label="Clientes Compradores" value={fmtInt(data.kpis.clientes_compradores)} />
        <Kpi label="Recurrentes" value={fmtInt(data.kpis.clientes_recurrentes)} />
        <Kpi label="De una compra" value={fmtInt(data.kpis.clientes_una_compra)} />
        <Kpi label="Ticket Promedio" value={fmtMoney(data.kpis.ticket_promedio)} />
      </div>

      <div className="mt-3 text-xs text-slate-400">
        Concentración: el top 5 de clientes representa {fmtPct(data.concentracion.top5_pct)} de la facturación, el top 10 representa{" "}
        {fmtPct(data.concentracion.top10_pct)}.
      </div>

      <section className="mb-16 mt-10">
        <h2 className="text-base font-semibold text-slate-900">Todos los clientes ({fmtInt(data.por_cliente.length)})</h2>
        <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2">#</th>
                <th className="px-4 py-2">Cliente</th>
                <th className="px-4 py-2 text-right">Monto</th>
                <th className="px-4 py-2 text-right">% del total</th>
                <th className="px-4 py-2 text-right">Operaciones</th>
                <th className="px-4 py-2 text-right">Ticket prom.</th>
                <th className="px-4 py-2 text-right">Tipo</th>
              </tr>
            </thead>
            <tbody>
              {data.por_cliente.map((c, i) => (
                <tr key={c.codigo} className="border-t border-slate-100">
                  <td className="px-4 py-2 text-slate-400">{i + 1}</td>
                  <td className="px-4 py-2">{c.nombre}</td>
                  <td className="px-4 py-2 text-right font-medium">{fmtMoney(c.monto)}</td>
                  <td className="px-4 py-2 text-right text-slate-500">{fmtPct(c.pct)}</td>
                  <td className="px-4 py-2 text-right text-slate-500">{fmtInt(c.operaciones)}</td>
                  <td className="px-4 py-2 text-right text-slate-500">{fmtMoney(c.ticket_prom)}</td>
                  <td className="px-4 py-2 text-right text-slate-500">{c.operaciones > 1 ? "Recurrente" : "1 compra"}</td>
                </tr>
              ))}
              {data.por_cliente.length === 0 && (
                <tr>
                  <td className="px-4 py-3 text-slate-400" colSpan={7}>
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