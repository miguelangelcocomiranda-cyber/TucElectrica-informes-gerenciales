// app/importar/actions.ts
"use server";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { listarMesesCargados } from "@/lib/calculos";
import { leerFilasDeExcel, procesarVentas, procesarClientes, procesarCosto, procesarVendedor, VentaLimpia, ResultadoClientes, ResultadoCosto, ResultadoVendedor } from "@/lib/importador";

// Wrapper "use server" sobre listarMesesCargados: lib/calculos.ts usa la
// Secret Key de Supabase, así que NUNCA se puede importar directo desde un
// componente "use client" (se filtraría la clave / rompería en el navegador).
// La pantalla de importación llama a esta función en vez de a la de la lib.
export async function listarHistorial() {
  return listarMesesCargados();
}

// El reporte "Venta por Vendedor" de Fénix no trae fecha por fila (es un
// solo total por vendedor de todo lo que hayas filtrado al exportar en
// Fénix), así que no hay forma automática de saber a qué mes pertenece.
// Se probó reconstruirlo desde la columna "Usuario" de Ventas Detalladas
// y los números no cierran (Usuario = quién estaba logueado en la caja,
// no el vendedor comercial asignado a la venta) — no es una opción.
//
// Por eso: si el archivo de Ventas Detalladas subido junto trae UN solo
// mes, se lo asignamos solo, sin preguntar nada (caso normal). Sólo si
// trae varios meses mezclados le pedimos a la persona que elija a cuál
// de esos meses corresponde el archivo de Vendedor — es la única
// situación real donde no hay forma de adivinarlo.
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
    }
  | { ok: false; error: string };

export type GuardarResultado = { ok: true; meses: string[]; mensaje: string } | { ok: false; error: string };

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

type ProcesoResultado =
  | { ok: false; error: string }
  | { ok: true; ventasRes: VentasOk; clientesRes: ClientesOk | null; costoRes: CostoOk | null; vendedorRes: VendedorOk | null };

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

  return { ok: true, ventasRes, clientesRes, costoRes, vendedorRes };
}

function agruparPorMes(clean: VentaLimpia[]): Record<string, VentaLimpia[]> {
  const byMes: Record<string, VentaLimpia[]> = {};
  clean.forEach((r) => {
    (byMes[r.mes] = byMes[r.mes] || []).push(r);
  });
  return byMes;
}

// Decide a qué mes va el archivo de Vendedor: si la persona ya eligió uno
// (sólo posible cuando Ventas trae varios meses), se respeta ese; si Ventas
// trae un solo mes, se usa ese sin preguntar nada.
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
  const { ventasRes, clientesRes, costoRes, vendedorRes } = r;

  const byMes = agruparPorMes(ventasRes.clean);
  const meses = Object.keys(byMes)
    .sort()
    .map((mes) => ({ mes, filas: byMes[mes].length }));

  const vendedorMesElegido = vendedorRes && vendedorRes.ok ? resolverMesVendedor(fd, meses.map((m) => m.mes)) : null;

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
  const { ventasRes, clientesRes, costoRes, vendedorRes } = r;

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

    // Acá NO tocamos tiene_vendedor: como Vendedor se guarda aparte (más
    // abajo) con su propio mes resuelto, dejamos ese campo tal cual estaba
    // para no borrar sin querer un "✔" que ya existía de una carga anterior.
    const { error: mesErr } = await db.from("meses_cargados").upsert(
      {
        mes,
        ventas_filas: filasVentas.length,
        tiene_costo: tieneCosto,
        actualizado_en: new Date().toISOString(),
        actualizado_por: "importador web",
      },
      { onConflict: "mes" }
    );
    if (mesErr) return { ok: false, error: `Error actualizando meses_cargados (${mes}): ${mesErr.message}` };
  }

  // Venta por Vendedor: independiente del loop de arriba. Se guarda para el
  // mes resuelto (automático si Ventas trae un solo mes; elegido a mano
  // sólo si Ventas trae varios meses mezclados).
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
