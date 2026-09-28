// app/comisiones/actions.ts
"use server";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { leerFilasDeExcel, procesarVendedor } from "@/lib/importador";

// Comisiones de vendedores: usa la MISMA tabla "vendedores" (mes, vendedor,
// monto) que ya existía para el método viejo "Venta por Vendedor" del
// Importador Mensual — es el mismo archivo de Fénix (VentaCantidadVendedorExport,
// sin IVA), así que no hace falta una tabla nueva para las ventas. Acá se
// sube aparte (para no mezclarlo con el flujo del mes en Importador Mensual)
// y se le suma un % de comisión editable por vendedor, guardado en una
// tabla nueva y chica: comisiones_porcentaje (vendedor -> %).
//
// Ojo: como comparte la tabla "vendedores", si el mismo mes se sube acá Y
// en Importador Mensual, gana el último que se subió (cada carga reemplaza
// los datos de vendedor de ESE mes, no se suman ni se duplican).

function mesValido(s: string | null | undefined): string | null {
  return s && /^\d{4}-\d{2}$/.test(s) ? s : null;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

// ---------------- Meses disponibles (para el selector de la pantalla) ----------------

export async function listarMesesVendedor(): Promise<string[]> {
  const db = supabaseAdmin();
  const { data, error } = await db.from("vendedores").select("mes");
  if (error) throw new Error("Error leyendo meses de vendedores: " + error.message);
  const set = new Set((data || []).map((r: any) => r.mes as string));
  return Array.from(set).sort().reverse();
}

// ---------------- Subir "Venta por Vendedor" para un mes ----------------

export type SubirResultado = { ok: true; mensaje: string } | { ok: false; error: string };

export async function subirVentaPorVendedor(fd: FormData): Promise<SubirResultado> {
  const mes = mesValido(fd.get("mes") as string | null);
  if (!mes) return { ok: false, error: "Elegí un mes válido antes de subir el archivo." };

  const file = fd.get("archivo") as File | null;
  if (!file || file.size === 0) return { ok: false, error: "Falta el archivo de Venta por Vendedor." };

  const arr = await file.arrayBuffer();
  const buffer = Buffer.from(arr);
  const res = procesarVendedor(leerFilasDeExcel(buffer));
  if (!res.ok) return { ok: false, error: res.error };

  const vendedores = Object.keys(res.agg);
  if (vendedores.length === 0) return { ok: false, error: "El archivo no trajo ningún vendedor reconocible." };

  const db = supabaseAdmin();

  const { error: delErr } = await db.from("vendedores").delete().eq("mes", mes);
  if (delErr) return { ok: false, error: `Error limpiando datos previos de ${mes}: ${delErr.message}` };

  const payload = vendedores.map((v) => ({ mes, vendedor: v, monto: round2(res.agg[v]) }));
  const { error: insErr } = await db.from("vendedores").insert(payload);
  if (insErr) return { ok: false, error: `Error guardando ventas por vendedor de ${mes}: ${insErr.message}` };

  return {
    ok: true,
    mensaje: `Se guardaron ${vendedores.length} vendedores de ${mes} (reemplaza lo que hubiera antes para ese mes, tanto si se cargó acá como desde Importador Mensual).`,
  };
}

// ---------------- Calcular comisiones para los meses elegidos ----------------

export type ComisionFila = {
  vendedor: string;
  ventas: number;
  porcentaje: number;
  comision: number;
};

export type ComisionesResultado = {
  filas: ComisionFila[];
  totalVentas: number;
  totalComision: number;
};

export async function obtenerComisiones(meses: string[]): Promise<ComisionesResultado> {
  if (meses.length === 0) return { filas: [], totalVentas: 0, totalComision: 0 };
  const db = supabaseAdmin();

  const { data: ventasData, error: eVentas } = await db.from("vendedores").select("vendedor, monto").in("mes", meses);
  if (eVentas) throw new Error("Error leyendo ventas por vendedor: " + eVentas.message);

  const { data: pctData, error: ePct } = await db.from("comisiones_porcentaje").select("vendedor, porcentaje");
  if (ePct) throw new Error("Error leyendo porcentajes de comisión: " + ePct.message);

  const pctMap: Record<string, number> = {};
  (pctData || []).forEach((r: any) => {
    pctMap[r.vendedor] = Number(r.porcentaje) || 0;
  });

  const ventasMap: Record<string, number> = {};
  (ventasData || []).forEach((r: any) => {
    ventasMap[r.vendedor] = (ventasMap[r.vendedor] || 0) + (Number(r.monto) || 0);
  });

  const filas: ComisionFila[] = Object.keys(ventasMap)
    .map((v) => {
      const ventas = round2(ventasMap[v]);
      const porcentaje = pctMap[v] || 0;
      return { vendedor: v, ventas, porcentaje, comision: round2((ventas * porcentaje) / 100) };
    })
    .sort((a, b) => b.ventas - a.ventas);

  const totalVentas = round2(filas.reduce((a, f) => a + f.ventas, 0));
  const totalComision = round2(filas.reduce((a, f) => a + f.comision, 0));

  return { filas, totalVentas, totalComision };
}

// ---------------- Guardar el % de comisión de un vendedor ----------------

export type GuardarPorcentajeResultado = { ok: true } | { ok: false; error: string };

export async function guardarPorcentaje(vendedor: string, porcentaje: number): Promise<GuardarPorcentajeResultado> {
  if (!vendedor) return { ok: false, error: "Vendedor inválido." };
  if (!Number.isFinite(porcentaje) || porcentaje < 0) return { ok: false, error: "El porcentaje tiene que ser un número mayor o igual a 0." };

  const db = supabaseAdmin();
  const { error } = await db
    .from("comisiones_porcentaje")
    .upsert({ vendedor, porcentaje, actualizado_en: new Date().toISOString() }, { onConflict: "vendedor" });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// ---------------- Historial de comisiones (evolución mes a mes) ----------------
//
// Usa el % de comisión ACTUAL de cada vendedor (el que está guardado hoy en
// comisiones_porcentaje) aplicado retroactivamente a las ventas de cada mes
// que haya cargado. Si un vendedor cambió de % en el medio, el gráfico igual
// muestra "cuánto le tocaría con el % de hoy" en todos los meses, no el %
// que tenía en cada momento (no se guarda historial de cambios de %).

export type HistorialComisiones = {
  meses: string[];
  series: { vendedor: string; valores: number[] }[];
};

export async function obtenerHistorialComisiones(): Promise<HistorialComisiones> {
  const db = supabaseAdmin();

  const { data: ventasData, error: eVentas } = await db.from("vendedores").select("mes, vendedor, monto");
  if (eVentas) throw new Error("Error leyendo historial de ventas por vendedor: " + eVentas.message);

  const { data: pctData, error: ePct } = await db.from("comisiones_porcentaje").select("vendedor, porcentaje");
  if (ePct) throw new Error("Error leyendo porcentajes de comisión: " + ePct.message);

  const pctMap: Record<string, number> = {};
  (pctData || []).forEach((r: any) => {
    pctMap[r.vendedor] = Number(r.porcentaje) || 0;
  });

  const mesesSet = new Set<string>();
  const vendedoresSet = new Set<string>();
  const montoPorMesVendedor: Record<string, number> = {};
  (ventasData || []).forEach((r: any) => {
    const mes = r.mes as string;
    const vendedor = r.vendedor as string;
    mesesSet.add(mes);
    vendedoresSet.add(vendedor);
    const key = mes + "|" + vendedor;
    montoPorMesVendedor[key] = (montoPorMesVendedor[key] || 0) + (Number(r.monto) || 0);
  });

  const meses = Array.from(mesesSet).sort();
  const vendedores = Array.from(vendedoresSet).sort((a, b) => a.localeCompare(b, "es"));

  const series = vendedores.map((vendedor) => {
    const porcentaje = pctMap[vendedor] || 0;
    const valores = meses.map((mes) => round2(((montoPorMesVendedor[mes + "|" + vendedor] || 0) * porcentaje) / 100));
    return { vendedor, valores };
  });

  return { meses, series };
}
