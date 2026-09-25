// app/importar/actions.ts
"use server";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { listarMesesCargados } from "@/lib/calculos";
import {
  leerFilasDeExcel,
  procesarVentas,
  procesarClientes,
  procesarCosto,
  procesarVendedor,
  procesarVendedorComprobante,
  VentaLimpia,
  ResultadoClientes,
  ResultadoCosto,
  ResultadoVendedor,
  ResultadoVendedorComprobante,
} from "@/lib/importador";

// Wrapper "use server" sobre listarMesesCargados: lib/calculos.ts usa la
// Secret Key de Supabase, así que NUNCA se puede importar directo desde un
// componente "use client" (se filtraría la clave / rompería en el navegador).
// La pantalla de importación llama a esta función en vez de a la de la lib.
export async function listarHistorial() {
  return listarMesesCargados();
}

// El reporte viejo "Venta por Vendedor" de Fénix no trae fecha por fila, así
// que no hay forma automática de saber a qué mes pertenece — sigue existiendo
// acá por compatibilidad con meses ya cargados así. Para meses nuevos, usar
// VentaWWExport + NCVentaWWExport (ver más abajo): traen Vendedor por
// comprobante, con fecha real, y se cruzan solos contra Ventas Detalladas.
function mesValido(s: string | null): string | null {
  return s && /^\d{4}-\d{2}$/.test(s) ? s : null;
}

// ---------------- Tipos de resultado hacia la pantalla ----------------

export type PreviewMes = { mes: string; filas: number };

export type PreviewResultado =
  | {
      ok: true;
      meses: PreviewMes[];
      excluidasPrueba: number;
      excluidasVacias: number;
      duplicadas: number;
      tiposDesconocidos: Record<string, number>;
      totalFilas: number;
      clientes: { n: number } | null;
      costo: { n: number } | null;
      vendedor: { n: number } | null;
      vendedorMesElegido: string | null;
      vendedorNecesitaMes: boolean;
      vendedorComprobantes: { comprobantesConVendedor: number; totalComprobantes: number; sinVendedor: number } | null;
    }
  | { ok: false; error: string };

export type GuardarResultado = { ok: true; meses: string[]; mensaje: string } | { ok: false; error: string };

export type BorrarResultado = { ok: true; mensaje: string } | { ok: false; error: string };

// ---------------- Helpers internos (comparten la lectura entre preview y guardar) ----------------

async function leerArchivo(fd: FormData, campo: string): Promise<Buffer | null> {
  const file = fd.get(campo) as File | null;
  if (!file || file.size === 0) return null;
  const arr = await file.arrayBuffer();
  return Buffer.from(arr);
}

type VentasOk = Extract<ReturnType<typeof procesarVentas>, { ok: true }>;
type ClientesOk = Extract<ResultadoClientes, { ok: true }>;
type CostoOk = Extract<ResultadoCosto, { ok: true }>;
type VendedorOk = Extract<ResultadoVendedor, { ok: true }>;
type VendedorCompOk = Extract<ResultadoVendedorComprobante, { ok: true }>;

type ProcesoResultado =
  | { ok: false; error: string }
  | {
      ok: true;
      ventasRes: VentasOk;
      clientesRes: ClientesOk | null;
      costoRes: CostoOk | null;
      vendedorRes: VendedorOk | null;
      vendedorCompMapa: Record<string, string>;
      vendedorCompCargado: boolean;
    };

async function procesarFormulario(fd: FormData): Promise<ProcesoResultado> {
  const bufVentas = await leerArchivo(fd, "ventas");
  if (!bufVentas) return { ok: false, error: "Falta el archivo de Ventas Detalladas (es obligatorio)." };

  const ventasRes = procesarVentas(leerFilasDeExcel(bufVentas));
  if (!ventasRes.ok) return { ok: false, error: ventasRes.error };

  const bufClientes = await leerArchivo(fd, "clientes");
  const clientesRes = bufClientes ? procesarClientes(leerFilasDeExcel(bufClientes)) : null;
  if (clientesRes && !clientesRes.ok) return { ok: false, error: "Archivo de Clientes: " + clientesRes.error };

  const bufCosto = await leerArchivo(fd, "costo");
  const costoRes = bufCosto ? procesarCosto(leerFilasDeExcel(bufCosto)) : null;
  if (costoRes && !costoRes.ok) return { ok: false, error: "Archivo de Costo: " + costoRes.error };

  const bufVendedor = await leerArchivo(fd, "vendedor");
  const vendedorRes = bufVendedor ? procesarVendedor(leerFilasDeExcel(bufVendedor)) : null;
  if (vendedorRes && !vendedorRes.ok) return { ok: false, error: "Archivo de Vendedor: " + vendedorRes.error };

  // Vendedor por comprobante (nuevo): VentaWWExport (facturas) + NCVentaWWExport
  // (notas de crédito). Los dos son opcionales y se combinan en un solo mapa
  // Tipo+Número -> Vendedor; no hace falta elegir mes, se cruza directo.
  const vendedorCompMapa: Record<string, string> = {};
  let vendedorCompCargado = false;

  const bufVentaWW = await leerArchivo(fd, "vendedorComprobantes");
  if (bufVentaWW) {
    const res = procesarVendedorComprobante(leerFilasDeExcel(bufVentaWW));
    if (!res.ok) return { ok: false, error: "Archivo de Ventas por comprobante (VentaWWExport): " + res.error };
    Object.assign(vendedorCompMapa, res.map);
    vendedorCompCargado = true;
  }

  const bufNC = await leerArchivo(fd, "vendedorComprobantesNC");
  if (bufNC) {
    const res = procesarVendedorComprobante(leerFilasDeExcel(bufNC));
    if (!res.ok) return { ok: false, error: "Archivo de Notas de Crédito por comprobante (NCVentaWWExport): " + res.error };
    Object.assign(vendedorCompMapa, res.map);
    vendedorCompCargado = true;
  }

  return { ok: true, ventasRes, clientesRes, costoRes, vendedorRes, vendedorCompMapa, vendedorCompCargado };
}

function agruparPorMes(clean: VentaLimpia[]): Record<string, VentaLimpia[]> {
  const byMes: Record<string, VentaLimpia[]> = {};
  clean.forEach((r) => {
    (byMes[r.mes] = byMes[r.mes] || []).push(r);
  });
  return byMes;
}

// Decide a qué mes va el archivo viejo de Vendedor: si la persona ya eligió
// uno (sólo posible cuando Ventas trae varios meses), se respeta ese; si
// Ventas trae un solo mes, se usa ese sin preguntar nada.
function resolverMesVendedor(fd: FormData, mesesVentas: string[]): string | null {
  const elegido = mesValido(fd.get("vendedorMes") as string | null);
  if (elegido) return elegido;
  if (mesesVentas.length === 1) return mesesVentas[0];
  return null;
}

// ---------------- Previsualizar (no escribe nada en la base) ----------------

export async function previsualizarImportacion(fd: FormData): Promise<PreviewResultado> {
  const r = await procesarFormulario(fd);
  if (!r.ok) return { ok: false, error: r.error };
  const { ventasRes, clientesRes, costoRes, vendedorRes, vendedorCompMapa, vendedorCompCargado } = r;

  const byMes = agruparPorMes(ventasRes.clean);
  const meses = Object.keys(byMes)
    .sort()
    .map((mes) => ({ mes, filas: byMes[mes].length }));

  const vendedorMesElegido = vendedorRes && vendedorRes.ok ? resolverMesVendedor(fd, meses.map((m) => m.mes)) : null;

  let vendedorComprobantes: { comprobantesConVendedor: number; totalComprobantes: number; sinVendedor: number } | null = null;
  if (vendedorCompCargado) {
    const comprobantes = new Set<string>();
    let conVendedor = 0;
    ventasRes.clean.forEach((v) => {
      const key = v.tipo + "|" + v.numero;
      if (comprobantes.has(key)) return;
      comprobantes.add(key);
      if (vendedorCompMapa[key]) conVendedor++;
    });
    vendedorComprobantes = {
      comprobantesConVendedor: conVendedor,
      totalComprobantes: comprobantes.size,
      sinVendedor: comprobantes.size - conVendedor,
    };
  }

  return {
    ok: true,
    meses,
    excluidasPrueba: ventasRes.excluidasPrueba,
    excluidasVacias: ventasRes.excluidasVacias,
    duplicadas: ventasRes.duplicadas,
    tiposDesconocidos: ventasRes.tiposDesconocidos,
    totalFilas: ventasRes.totalFilas,
    clientes: clientesRes && clientesRes.ok ? { n: clientesRes.n } : null,
    costo: costoRes && costoRes.ok ? { n: costoRes.n } : null,
    vendedor: vendedorRes && vendedorRes.ok ? { n: vendedorRes.n } : null,
    vendedorMesElegido,
    vendedorNecesitaMes: !!(vendedorRes && vendedorRes.ok && !vendedorMesElegido),
    vendedorComprobantes,
  };
}

// ---------------- Guardar (escribe en Supabase, reemplazando el/los mes(es) detectados) ----------------

const CHUNK = 500;
function chunks<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export async function guardarImportacion(fd: FormData): Promise<GuardarResultado> {
  const r = await procesarFormulario(fd);
  if (!r.ok) return { ok: false, error: r.error };
  const { ventasRes, clientesRes, costoRes, vendedorRes, vendedorCompMapa, vendedorCompCargado } = r;

  const db = supabaseAdmin();
  const byMes = agruparPorMes(ventasRes.clean);
  const meses = Object.keys(byMes).sort();
  const vendedorMes = vendedorRes && vendedorRes.ok ? resolverMesVendedor(fd, meses) : null;

  // Maestro de Clientes: no depende del mes, se actualiza una sola vez.
  if (clientesRes && clientesRes.ok) {
    const filas = Object.keys(clientesRes.map).map((cod) => ({ cliente_codigo: Number(cod), nombre: clientesRes.map[Number(cod)] }));
    for (const c of chunks(filas, CHUNK)) {
      const { error } = await db.from("clientes_maestro").upsert(c, { onConflict: "cliente_codigo" });
      if (error) return { ok: false, error: "Error guardando Maestro de Clientes: " + error.message };
    }
  }

  for (const mes of meses) {
    const filasVentas = byMes[mes];

    const { error: delVentasErr } = await db.from("ventas").delete().eq("mes", mes);
    if (delVentasErr) return { ok: false, error: `Error limpiando ventas previas de ${mes}: ${delVentasErr.message}` };

    const payloadVentas = filasVentas.map((v) => ({
      fecha: v.fechaStr,
      tipo: v.tipo,
      numero: v.numero,
      cliente_codigo: v.cliCod,
      cliente_nombre: v.cliNom,
      articulo_codigo: v.artCod,
      articulo_nombre: v.artNom,
      cantidad: v.cantidad,
      total_linea: v.totalLinea,
      vendedor: vendedorCompMapa[v.tipo + "|" + v.numero] || null,
    }));
    for (const c of chunks(payloadVentas, CHUNK)) {
      const { error } = await db.from("ventas").insert(c);
      if (error) return { ok: false, error: `Error guardando ventas de ${mes}: ${error.message}` };
    }

    const tieneCosto = !!(costoRes && costoRes.ok);
    if (tieneCosto && costoRes.ok) {
      const { error: delCostoErr } = await db.from("costos").delete().eq("mes", mes);
      if (delCostoErr) return { ok: false, error: `Error limpiando costos previos de ${mes}: ${delCostoErr.message}` };
      const payloadCosto = Object.keys(costoRes.map).map((cod) => ({
        mes,
        articulo_codigo: cod,
        costo_unitario: costoRes.map[cod],
        articulo_nombre: costoRes.nombreMap[cod] || null,
        seleccion: costoRes.selMap[cod] || null,
      }));
      for (const c of chunks(payloadCosto, CHUNK)) {
        const { error } = await db.from("costos").insert(c);
        if (error) return { ok: false, error: `Error guardando costos de ${mes}: ${error.message}` };
      }
    }

    // tiene_vendedor: si este mes tiene al menos una venta con vendedor
    // asignado por el método nuevo (comprobante), lo marcamos acá mismo.
    // Si no, dejamos el campo afuera del payload para no pisar sin querer
    // un "✔" que ya existía por el método viejo (se actualiza más abajo).
    const tieneVendedorNuevoEsteMs = vendedorCompCargado && payloadVentas.some((v) => v.vendedor);
    const mesPayload: Record<string, unknown> = {
      mes,
      ventas_filas: filasVentas.length,
      tiene_costo: tieneCosto,
      actualizado_en: new Date().toISOString(),
      actualizado_por: "importador web",
    };
    if (tieneVendedorNuevoEsteMs) mesPayload.tiene_vendedor = true;

    const { error: mesErr } = await db.from("meses_cargados").upsert(mesPayload, { onConflict: "mes" });
    if (mesErr) return { ok: false, error: `Error actualizando meses_cargados (${mes}): ${mesErr.message}` };
  }

  // Venta por Vendedor (reporte viejo): independiente del loop de arriba. Se
  // guarda para el mes resuelto (automático si Ventas trae un solo mes;
  // elegido a mano sólo si Ventas trae varios meses mezclados). Sigue
  // existiendo por compatibilidad con meses cargados antes de tener
  // VentaWWExport/NCVentaWWExport.
  if (vendedorRes && vendedorRes.ok && vendedorMes) {
    const { error: delVendErr } = await db.from("vendedores").delete().eq("mes", vendedorMes);
    if (delVendErr) return { ok: false, error: `Error limpiando vendedores previos de ${vendedorMes}: ${delVendErr.message}` };

    const payloadVend = Object.keys(vendedorRes.agg).map((v) => ({ mes: vendedorMes, vendedor: v, monto: vendedorRes.agg[v] }));
    if (payloadVend.length > 0) {
      const { error: insVendErr } = await db.from("vendedores").insert(payloadVend);
      if (insVendErr) return { ok: false, error: `Error guardando vendedores de ${vendedorMes}: ${insVendErr.message}` };
    }

    const { error: upVendErr } = await db.from("meses_cargados").upsert(
      { mes: vendedorMes, tiene_vendedor: true, actualizado_en: new Date().toISOString(), actualizado_por: "importador web" },
      { onConflict: "mes" }
    );
    if (upVendErr) return { ok: false, error: `Error actualizando meses_cargados (vendedor, ${vendedorMes}): ${upVendErr.message}` };

    if (!meses.includes(vendedorMes)) meses.push(vendedorMes);
  }

  meses.sort();
  return { ok: true, meses, mensaje: `Se guardaron ${meses.length === 1 ? "el mes" : "los meses"} ${meses.join(", ")} correctamente.` };
}

// ---------------- Borrar (para volver a cargar un mes desde cero, o resetear todo) ----------------
//
// Borra por mes: ventas, costos y vendedor (método nuevo y legacy) de ESE
// mes puntual, más su fila en meses_cargados. El Maestro de Clientes y la
// Taxonomía de rubros NO se tocan acá — son datos de referencia
// compartidos entre todos los meses, no algo que se "carga por mes".
//
// Borrar todos los meses: mismo criterio, pero para el histórico completo
// — deja la app como recién instalada, lista para cargar el primer mes de
// nuevo. Tampoco toca Maestro de Clientes ni Taxonomía.

export async function borrarMes(mes: string): Promise<BorrarResultado> {
  if (!mesValido(mes)) return { ok: false, error: "Mes inválido." };
  const db = supabaseAdmin();

  const { error: eVentas } = await db.from("ventas").delete().eq("mes", mes);
  if (eVentas) return { ok: false, error: `Error borrando ventas de ${mes}: ${eVentas.message}` };

  const { error: eCostos } = await db.from("costos").delete().eq("mes", mes);
  if (eCostos) return { ok: false, error: `Error borrando costos de ${mes}: ${eCostos.message}` };

  const { error: eVend } = await db.from("vendedores").delete().eq("mes", mes);
  if (eVend) return { ok: false, error: `Error borrando vendedores de ${mes}: ${eVend.message}` };

  const { error: eMes } = await db.from("meses_cargados").delete().eq("mes", mes);
  if (eMes) return { ok: false, error: `Error borrando el registro de ${mes}: ${eMes.message}` };

  return { ok: true, mensaje: `Se borró el mes ${mes} completo (ventas, costos y vendedor).` };
}

export async function borrarTodosLosMeses(): Promise<BorrarResultado> {
  const db = supabaseAdmin();

  // Supabase exige algún filtro en un delete — "mes" nunca vale esto en
  // datos reales (siempre es "YYYY-MM"), así que este filtro en la
  // práctica borra todas las filas de la tabla, sin dejar nada afuera.
  const SIN_FILTRO = "____ningún-mes-real-es-esto____";

  const { error: eVentas } = await db.from("ventas").delete().neq("mes", SIN_FILTRO);
  if (eVentas) return { ok: false, error: `Error borrando ventas: ${eVentas.message}` };

  const { error: eCostos } = await db.from("costos").delete().neq("mes", SIN_FILTRO);
  if (eCostos) return { ok: false, error: `Error borrando costos: ${eCostos.message}` };

  const { error: eVend } = await db.from("vendedores").delete().neq("mes", SIN_FILTRO);
  if (eVend) return { ok: false, error: `Error borrando vendedores: ${eVend.message}` };

  const { error: eMes } = await db.from("meses_cargados").delete().neq("mes", SIN_FILTRO);
  if (eMes) return { ok: false, error: `Error borrando meses_cargados: ${eMes.message}` };

  return {
    ok: true,
    mensaje: "Se borraron todos los meses. La app volvió a cero (el Maestro de Clientes y la Taxonomía de rubros se mantienen tal cual).",
  };
}