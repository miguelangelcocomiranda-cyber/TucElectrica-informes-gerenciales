// app/page.tsx
import Link from "next/link";
import { calcularDashboard, listarMesesCargados, Dashboard, PorCliente, PorProducto } from "@/lib/calculos";
import Filtros from "./Filtros";
import GraficoDiario from "./GraficoDiario";
import GraficoMensual from "./GraficoMensual";

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

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-xl font-semibold text-slate-900">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-slate-400">{sub}</div>}
    </div>
  );
}

function TablaBarras({ filas, total }: { filas: { etiqueta: string; monto: number }[]; total: number }) {
  if (filas.length === 0) return <p className="mt-3 text-sm text-slate-400">Sin datos para este período.</p>;
  const max = Math.max(...filas.map((f) => f.monto), 1);
  return (
    <div className="mt-3 space-y-2 rounded-xl border border-slate-200 bg-white p-4">
      {filas.map((f) => (
        <div key={f.etiqueta} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
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

function TablaClientes({ filas }: { filas: PorCliente[] }) {
  if (filas.length === 0) return <p className="mt-3 text-sm text-slate-400">Sin datos para este período.</p>;
  return (
    <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-2">Cliente</th>
            <th className="px-4 py-2 text-right">Monto</th>
            <th className="px-4 py-2 text-right">% del total</th>
            <th className="px-4 py-2 text-right">Operaciones</th>
            <th className="px-4 py-2 text-right">Ticket prom.</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((c) => (
            <tr key={c.codigo} className="border-t border-slate-100">
              <td className="px-4 py-2">{c.nombre}</td>
              <td className="px-4 py-2 text-right font-medium">{fmtMoney(c.monto)}</td>
              <td className="px-4 py-2 text-right text-slate-500">{fmtPct(c.pct)}</td>
              <td className="px-4 py-2 text-right text-slate-500">{fmtInt(c.operaciones)}</td>
              <td className="px-4 py-2 text-right text-slate-500">{fmtMoney(c.ticket_prom)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TablaProductos({ filas }: { filas: PorProducto[] }) {
  if (filas.length === 0) return <p className="mt-3 text-sm text-slate-400">Sin datos para este período.</p>;
  return (
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
          {filas.map((p) => (
            <tr key={p.codigo} className="border-t border-slate-100">
              <td className="px-4 py-2">{p.nombre}</td>
              <td className="px-4 py-2 text-right text-slate-500">{fmtInt(p.cantidad)}</td>
              <td className="px-4 py-2 text-right font-medium">{fmtMoney(p.monto)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ meses?: string; pv?: string }> }) {
  const sp = await searchParams;
  const mesesCargados = await listarMesesCargados();
  const todosLosMeses = mesesCargados.map((m) => m.mes).sort();

  const pedidos = sp.meses ? sp.meses.split(",").filter((m) => todosLosMeses.includes(m)) : [];
  const mesesSeleccionados = pedidos.length > 0 ? pedidos : todosLosMeses.slice(-1);
  const puntoVenta = sp.pv || "all";

  if (todosLosMeses.length === 0) {
    return (
      <main className="mx-auto max-w-6xl px-6 py-8">
        <h1 className="text-2xl font-semibold text-slate-900">Dashboard Ejecutivo</h1>
        <p className="mt-4 text-slate-500">
          Todavía no hay ningún mes cargado.{" "}
          <Link className="underline" href="/importar">
            Importar el primero
          </Link>
          .
        </p>
      </main>
    );
  }

  const data: Dashboard = await calcularDashboard(mesesSeleccionados, puntoVenta);

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Dashboard Ejecutivo</h1>
          <p className="mt-0.5 text-sm text-slate-500">Informes gerenciales — Tucumán Eléctrica</p>
        </div>
        <Link href="/importar" className="text-sm text-slate-500 underline">
          Importar mes →
        </Link>
      </div>

      <Filtros todosLosMeses={todosLosMeses} mesesSeleccionados={mesesSeleccionados} puntoVenta={puntoVenta} />

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Kpi label="Facturación Neta (con IVA)" value={fmtMoney(data.kpis.facturacion_neta)} />
        <Kpi label="Operaciones" value={fmtInt(data.kpis.cant_operaciones)} />
        <Kpi label="Ticket Promedio" value={fmtMoney(data.kpis.ticket_promedio)} />
        <Kpi
          label="Clientes Compradores"
          value={fmtInt(data.kpis.clientes_compradores)}
          sub={`${fmtInt(data.kpis.clientes_recurrentes)} recurrentes / ${fmtInt(data.kpis.clientes_una_compra)} de una compra`}
        />
      </div>

      {data.costo && (
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Kpi label="Costo Estimado" value={fmtMoney(data.costo.costo_estimado)} />
          <Kpi label="Margen Bruto" value={fmtMoney(data.costo.margen_bruto)} />
          <Kpi label="Margen %" value={fmtPct(data.costo.margen_pct)} />
        </div>
      )}
      {!data.costo && <p className="mt-3 text-xs text-slate-400">No hay archivo de Costo cargado para el período elegido — no se calcula margen.</p>}

      <div className="mt-3 text-xs text-slate-400">
        Concentración: el top 5 de clientes representa {fmtPct(data.concentracion.top5_pct)} de la facturación, el top 10 representa{" "}
        {fmtPct(data.concentracion.top10_pct)}.
      </div>

      <section className="mt-10">
        <div className="grid grid-cols-1 gap-6">
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="text-base font-semibold text-slate-900">Facturación diaria</h2>
            <p className="mt-0.5 text-xs text-slate-400">Pasá el mouse por la curva para ver el día y el monto exacto.</p>
            <div className="mt-3">
              <GraficoDiario datos={data.diario} />
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="text-base font-semibold text-slate-900">Facturación por mes</h2>
            <div className="mt-3">
              <GraficoMensual datos={data.por_mes} />
            </div>
          </div>
        </div>
      </section>

      <section className="mt-10">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Por rubro</h2>
            <TablaBarras filas={data.por_rubro.slice(0, 12).map((r) => ({ etiqueta: r.rubro, monto: r.monto }))} total={data.kpis.facturacion_neta} />
          </div>
          <div>
            <h2 className="text-base font-semibold text-slate-900">Top clientes</h2>
            <TablaClientes filas={data.por_cliente.slice(0, 15)} />
          </div>
        </div>
      </section>

      {(data.por_vendedor.length > 0 || data.por_vendedor_legacy.length > 0) && (
        <section className="mt-10">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-base font-semibold text-slate-900">Por vendedor</h2>
            <Link href="/informe-comercial" className="text-xs text-indigo-600 underline">
              Ver informe comercial completo →
            </Link>
          </div>

          {data.por_vendedor.length > 0 && (
            <div className="mt-3">
              {data.vendedor_meses.length < mesesSeleccionados.length && data.por_vendedor_legacy.length === 0 && (
                <p className="text-xs text-slate-400">Con datos de vendedor por comprobante para: {data.vendedor_meses.join(", ")}.</p>
              )}
              <TablaBarras filas={data.por_vendedor.map((v) => ({ etiqueta: v.vendedor, monto: v.monto }))} total={data.vendedor_total} />
              <div className="mt-2 flex items-center justify-between rounded-md bg-slate-50 px-3 py-1.5">
                <span className="text-xs font-semibold text-slate-600">Total vendedores (con IVA)</span>
                <span className="text-sm font-semibold text-slate-900">{fmtMoney(data.vendedor_total)}</span>
              </div>
            </div>
          )}

          {data.por_vendedor_legacy.length > 0 && (
            <div className={data.por_vendedor.length > 0 ? "mt-6" : "mt-3"}>
              {data.por_vendedor.length > 0 && <h3 className="text-sm font-medium text-slate-600">Meses con método anterior de Fénix</h3>}
              <p className="mt-1 rounded-md bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800">
                ⚠ {data.vendedor_legacy_meses.join(", ")}: reporte "Venta por Vendedor" anterior de Fénix, SIN IVA — no va a coincidir en pesos con la
                Facturación Neta. Los porcentajes entre vendedores son correctos.
              </p>
              <TablaBarras filas={data.por_vendedor_legacy.map((v) => ({ etiqueta: v.vendedor, monto: v.monto }))} total={data.vendedor_legacy_total} />
              <div className="mt-2 flex items-center justify-between rounded-md bg-amber-50 px-3 py-1.5">
                <span className="text-xs font-semibold text-amber-800">Total vendedores (SIN IVA)</span>
                <span className="text-sm font-semibold text-amber-900">{fmtMoney(data.vendedor_legacy_total)}</span>
              </div>
            </div>
          )}
        </section>
      )}

      <section className="mb-16 mt-10">
        <h2 className="text-base font-semibold text-slate-900">Top productos</h2>
        <TablaProductos filas={data.por_producto.slice(0, 15)} />
      </section>
    </main>
  );
}
