// lib/calculos.ts
//
// Réplica fiel de la lógica de cálculo ya validada en la app anterior
// (Claude Artifact, contrastada contra el Libro IVA Ventas real). No se
// cambia NINGUNA fórmula acá — sólo cambia de dónde vienen los datos:
// antes eran JSON armado en el navegador a partir de los Excel, ahora son
// filas ya cargadas en Supabase (tablas ventas / costos / vendedores /
// taxonomia / meses_cargados).
//
// Reglas de negocio que replica (si algún número no cierra contra el
// Libro IVA Ventas, revisar ACÁ primero, no tocar sin volver a validar):
//  - signo: comprobantes "FAC *" suman (+1), "NC *" restan (-1)
//    -> ya viene calculado en ventas.signo por la base
//  - monto_neto = total_linea * signo -> ya viene calculado en ventas.monto_neto
//  - facturación neta = suma de monto_neto (es decir, YA está neta de NC)
//  - cant_operaciones = comprobantes de venta (tipo que empieza con "FAC")
//    distintos, contando tipo+número una sola vez
//  - ticket_promedio = facturación_neta / cant_operaciones
//  - costo estimado = costo_unitario * cantidad * signo, sólo para
//    productos que aparecen en el archivo de costo de ESE mes (si un
//    producto no está en el archivo de costo, no entra al cálculo de
//    margen, pero sí sigue apareciendo en ventas / rubros / etc.)
//  - "por selección" (marca/línea) sale del mismo archivo de costo; a
//    diferencia del costo, acá todo producto entra, con "Sin clasificar"
//    si no está en el archivo
//  - vendedor: reporte aparte ("Venta por Vendedor" de Fénix), neto de
//    IVA, NO discrimina punto de venta — por eso se agrega directo desde
//    la tabla vendedores, sin cruzar con ventas
//  - punto de venta: prefijo del número de comprobante (ventas.punto_venta),
//    "0004" = Facturación Electrónica

import { supabaseAdmin } from "./supabase-admin";

// ---------------- Tipos ----------------

export type VentaRow = {
  fecha: string;
  tipo: string;
  numero: string;
  mes: string;
  punto_venta: string;
  cliente_codigo: number;
  cliente_nombre: string | null;
  articulo_codigo: string;
  articulo_nombre: string | null;
  cantidad: number;
  total_linea: number;
  signo: number;
  monto_neto: number;
};

type CostoRow = {
  mes: string;
  articulo_codigo: string;
  costo_unitario: number;
  articulo_nombre: string | null;
  seleccion: string | null;
};

type VendedorRow = { mes: string; vendedor: string; monto: number };
type TaxonomiaRow = { articulo_codigo: string; rubro: string; subrubro: string };
type MesCargado = {
  mes: string;
  ventas_filas: number;
  tiene_costo: boolean;
  tiene_vendedor: boolean;
};

export type PorCliente = {
  codigo: number;
  nombre: string;
  monto: number;
  operaciones: number;
  pct: number;
  ticket_prom: number;
};
export type PorRubro = { rubro: string; monto: number };
export type PorSubrubro = { rubro: string; subrubro: string; monto: number };
export type PorProducto = { codigo: string; nombre: string; monto: number; cantidad: number };
export type PorSeleccion = { seleccion: string; monto: number };
export type PorVendedor = { vendedor: string; monto: number; pct: number };
export type Diario = { fecha: string; monto: number };

export type Dashboard = {
  meses: string[];
  puntoVenta: string;
  kpis: {
    facturacion_neta: number;
    cant_operaciones: number;
    ticket_promedio: number;
    clientes_compradores: number;
    clientes_recurrentes: number;
    clientes_una_compra: number;
  };
  diario: Diario[];
  por_cliente: PorCliente[];
  por_rubro: PorRubro[];
  por_subrubro: PorSubrubro[];
  por_producto: PorProducto[];
  por_seleccion: PorSeleccion[];
  seleccion_meses: string[];
  por_vendedor: PorVendedor[];
  vendedor_total: number;
  vendedor_meses: string[];
  concentracion: { top5_pct: number; top10_pct: number };
  costo: { costo_estimado: number; margen_bruto: number; margen_pct: number; meses: string[] } | null;
  filas_procesadas: number;
};

// ---------------- Helpers ----------------

const round2 = (n: number) => Math.round(n * 100) / 100;

function costoKey(mes: string, articuloCodigo: string) {
  return mes + "|" + articuloCodigo;
}

// ---------------- Núcleo de agregación (opera en memoria sobre filas ya traídas) ----------------

/**
 * Agrega un conjunto de filas de `ventas` ya filtradas (por mes(es) y,
 * opcionalmente, por punto de venta). Es el equivalente exacto de
 * aggregateRows()+aggregateMeses() combinados de la app anterior: como acá
 * partimos de filas individuales en vez de "documentos" pre-agregados por
 * mes, se puede hacer en un solo paso — matemáticamente da el mismo
 * resultado (sumas y conteos distintos no cambian si se agrupan primero
 * por mes o directo, siempre que un número de comprobante no se repita
 * entre meses distintos, que es como funciona la numeración real).
 */
export function agregarVentas(
  filas: VentaRow[],
  opts: {
    taxMap: Map<string, { rubro: string; subrubro: string }>;
    costoMap: Map<string, { costo_unitario: number; articulo_nombre: string | null; seleccion: string | null }>;
    mesesConCosto: Set<string>;
    vendedorRows: VendedorRow[];
    mesesConVendedor: Set<string>;
    meses: string[];
    puntoVenta: string;
  }
): Dashboard {
  const { taxMap, costoMap, mesesConCosto, vendedorRows, mesesConVendedor, meses, puntoVenta } = opts;

  let facturacionNeta = 0;
  let costoEstimado = 0;
  const diarioMap: Record<string, number> = {};
  const clienteMap: Record<number, { nombre: string; monto: number; ops: Set<string> }> = {};
  const rubroMap: Record<string, number> = {};
  const subrubroMap: Record<string, number> = {};
  const productoMap: Record<string, { nombre: string; monto: number; cantidad: number }> = {};
  const seleccionMap: Record<string, number> = {};
  const opsFac = new Set<string>();

  for (const r of filas) {
    const monto = r.monto_neto;
    facturacionNeta += monto;

    diarioMap[r.fecha] = (diarioMap[r.fecha] || 0) + monto;

    if (!clienteMap[r.cliente_codigo]) {
      clienteMap[r.cliente_codigo] = { nombre: r.cliente_nombre || "#" + r.cliente_codigo, monto: 0, ops: new Set() };
    }
    clienteMap[r.cliente_codigo].monto += monto;
    clienteMap[r.cliente_codigo].nombre = r.cliente_nombre || clienteMap[r.cliente_codigo].nombre;

    const tax = taxMap.get(r.articulo_codigo);
    const rubro = tax ? tax.rubro : "Sin clasificar";
    const subrubro = tax ? tax.subrubro : "Sin clasificar";
    rubroMap[rubro] = (rubroMap[rubro] || 0) + monto;
    const srKey = rubro + "|||" + subrubro;
    subrubroMap[srKey] = (subrubroMap[srKey] || 0) + monto;

    const costo = costoMap.get(costoKey(r.mes, r.articulo_codigo));
    if (!productoMap[r.articulo_codigo]) {
      productoMap[r.articulo_codigo] = {
        nombre: costo?.articulo_nombre || r.articulo_nombre || r.articulo_codigo,
        monto: 0,
        cantidad: 0,
      };
    }
    productoMap[r.articulo_codigo].monto += monto;
    productoMap[r.articulo_codigo].cantidad += r.cantidad * r.signo;
    if (costo?.articulo_nombre) productoMap[r.articulo_codigo].nombre = costo.articulo_nombre;

    if (mesesConCosto.has(r.mes)) {
      const seleccion = costo?.seleccion || "Sin clasificar";
      seleccionMap[seleccion] = (seleccionMap[seleccion] || 0) + monto;
      if (costo) costoEstimado += costo.costo_unitario * r.cantidad * r.signo;
    }

    if (r.tipo.startsWith("FAC")) {
      const opKey = r.tipo + "|" + r.numero;
      opsFac.add(opKey);
      clienteMap[r.cliente_codigo].ops.add(opKey);
    }
  }

  const cantOperaciones = opsFac.size;
  const ticketPromedio = cantOperaciones > 0 ? facturacionNeta / cantOperaciones : 0;

  const porCliente: PorCliente[] = Object.keys(clienteMap)
    .map((cod) => {
      const c = clienteMap[Number(cod)];
      return {
        codigo: Number(cod),
        nombre: c.nombre,
        monto: round2(c.monto),
        operaciones: c.ops.size,
        pct: 0,
        ticket_prom: c.ops.size ? c.monto / c.ops.size : 0,
      };
    })
    .sort((a, b) => b.monto - a.monto);
  porCliente.forEach((c) => {
    c.pct = facturacionNeta ? (c.monto / facturacionNeta) * 100 : 0;
  });
  const clientesRecurrentes = porCliente.filter((c) => c.operaciones > 1).length;
  const clientesUnaCompra = porCliente.filter((c) => c.operaciones <= 1).length;
  const top5pct = porCliente.slice(0, 5).reduce((a, c) => a + c.pct, 0);
  const top10pct = porCliente.slice(0, 10).reduce((a, c) => a + c.pct, 0);

  const porRubro: PorRubro[] = Object.keys(rubroMap)
    .map((k) => ({ rubro: k, monto: round2(rubroMap[k]) }))
    .sort((a, b) => b.monto - a.monto);
  const porSubrubro: PorSubrubro[] = Object.keys(subrubroMap)
    .map((k) => {
      const [rubro, subrubro] = k.split("|||");
      return { rubro, subrubro, monto: round2(subrubroMap[k]) };
    })
    .sort((a, b) => b.monto - a.monto);
  const porProducto: PorProducto[] = Object.keys(productoMap)
    .map((cod) => ({ codigo: cod, nombre: productoMap[cod].nombre, monto: round2(productoMap[cod].monto), cantidad: round2(productoMap[cod].cantidad) }))
    .sort((a, b) => b.monto - a.monto);
  const diario: Diario[] = Object.keys(diarioMap)
    .sort()
    .map((k) => ({ fecha: k, monto: round2(diarioMap[k]) }));
  const porSeleccion: PorSeleccion[] = Object.keys(seleccionMap)
    .map((k) => ({ seleccion: k, monto: round2(seleccionMap[k]) }))
    .sort((a, b) => b.monto - a.monto);

  // Vendedor: independiente de las filas de venta y del punto de venta —
  // se agrega directo desde la tabla vendedores para los meses seleccionados.
  const vendedorMap: Record<string, number> = {};
  for (const v of vendedorRows) {
    vendedorMap[v.vendedor] = (vendedorMap[v.vendedor] || 0) + v.monto;
  }
  const vendedorTotal = Object.values(vendedorMap).reduce((a, m) => a + m, 0);
  const porVendedor: PorVendedor[] = Object.keys(vendedorMap)
    .map((k) => ({ vendedor: k, monto: round2(vendedorMap[k]), pct: vendedorTotal ? (vendedorMap[k] / vendedorTotal) * 100 : 0 }))
    .sort((a, b) => b.monto - a.monto);

  const mesesConCostoEnRango = meses.filter((m) => mesesConCosto.has(m));

  return {
    meses,
    puntoVenta,
    kpis: {
      facturacion_neta: round2(facturacionNeta),
      cant_operaciones: cantOperaciones,
      ticket_promedio: round2(ticketPromedio),
      clientes_compradores: porCliente.length,
      clientes_recurrentes: clientesRecurrentes,
      clientes_una_compra: clientesUnaCompra,
    },
    diario,
    por_cliente: porCliente,
    por_rubro: porRubro,
    por_subrubro: porSubrubro,
    por_producto: porProducto,
    por_seleccion: porSeleccion,
    seleccion_meses: mesesConCostoEnRango,
    por_vendedor: porVendedor,
    vendedor_total: round2(vendedorTotal),
    vendedor_meses: meses.filter((m) => mesesConVendedor.has(m)),
    concentracion: { top5_pct: round2(top5pct), top10_pct: round2(top10pct) },
    costo: mesesConCostoEnRango.length
      ? {
          costo_estimado: round2(costoEstimado),
          margen_bruto: round2(facturacionNeta - costoEstimado),
          margen_pct: facturacionNeta ? round2(((facturacionNeta - costoEstimado) / facturacionNeta) * 100) : 0,
          meses: mesesConCostoEnRango,
        }
      : null,
    filas_procesadas: filas.length,
  };
}

// ---------------- Función principal: trae de Supabase y calcula ----------------

/**
 * Arma el dashboard para un conjunto de meses (ej. ['2026-08','2026-09'])
 * y un punto de venta ('all' o un código como '0004'). Es el reemplazo
 * directo de lo que antes hacía aggregateMeses() en el navegador, leyendo
 * de la base en vez de leer del estado cargado en memoria.
 */
export async function calcularDashboard(meses: string[], puntoVenta: string = "all"): Promise<Dashboard> {
  const db = supabaseAdmin();

  let ventasQuery = db.from("ventas").select("*").in("mes", meses);
  if (puntoVenta !== "all") ventasQuery = ventasQuery.eq("punto_venta", puntoVenta);

  const [ventasRes, taxRes, costosRes, vendedoresRes, mesesRes] = await Promise.all([
    ventasQuery,
    db.from("taxonomia").select("articulo_codigo, rubro, subrubro"),
    db.from("costos").select("mes, articulo_codigo, costo_unitario, articulo_nombre, seleccion").in("mes", meses),
    db.from("vendedores").select("mes, vendedor, monto").in("mes", meses),
    db.from("meses_cargados").select("mes, ventas_filas, tiene_costo, tiene_vendedor").in("mes", meses),
  ]);

  if (ventasRes.error) throw new Error("Error leyendo ventas: " + ventasRes.error.message);
  if (taxRes.error) throw new Error("Error leyendo taxonomia: " + taxRes.error.message);
  if (costosRes.error) throw new Error("Error leyendo costos: " + costosRes.error.message);
  if (vendedoresRes.error) throw new Error("Error leyendo vendedores: " + vendedoresRes.error.message);
  if (mesesRes.error) throw new Error("Error leyendo meses_cargados: " + mesesRes.error.message);

  const taxMap = new Map<string, { rubro: string; subrubro: string }>();
  (taxRes.data as TaxonomiaRow[]).forEach((t) => taxMap.set(t.articulo_codigo, { rubro: t.rubro, subrubro: t.subrubro }));

  const costoMap = new Map<string, { costo_unitario: number; articulo_nombre: string | null; seleccion: string | null }>();
  (costosRes.data as CostoRow[]).forEach((c) =>
    costoMap.set(costoKey(c.mes, c.articulo_codigo), { costo_unitario: c.costo_unitario, articulo_nombre: c.articulo_nombre, seleccion: c.seleccion })
  );

  const mesesCargadosData = mesesRes.data as MesCargado[];
  const mesesConCosto = new Set(mesesCargadosData.filter((m) => m.tiene_costo).map((m) => m.mes));
  const mesesConVendedor = new Set(mesesCargadosData.filter((m) => m.tiene_vendedor).map((m) => m.mes));

  return agregarVentas(ventasRes.data as VentaRow[], {
    taxMap,
    costoMap,
    mesesConCosto,
    vendedorRows: vendedoresRes.data as VendedorRow[],
    mesesConVendedor,
    meses,
    puntoVenta,
  });
}

/** Trae la lista de meses cargados (para poblar selectores de período en el dashboard). */
export async function listarMesesCargados(): Promise<MesCargado[]> {
  const db = supabaseAdmin();
  const { data, error } = await db.from("meses_cargados").select("mes, ventas_filas, tiene_costo, tiene_vendedor").order("mes", { ascending: false });
  if (error) throw new Error("Error leyendo meses_cargados: " + error.message);
  return data as MesCargado[];
}
