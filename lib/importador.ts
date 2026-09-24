// lib/importador.ts
//
// Lectura y limpieza de los 4 archivos Excel que se suben cada mes,
// portado tal cual de la lógica ya validada en la app anterior (mismas
// columnas esperadas, mismas exclusiones, mismo criterio de duplicados).
// Este archivo NO toca la base de datos — sólo transforma filas de Excel
// en objetos limpios. Quien llama a estas funciones (app/importar/actions.ts)
// es el que después inserta en Supabase.

import * as XLSX from "xlsx";

export const KNOWN_TIPOS = ["FAC A", "FAC B", "NC A", "NC B"];

// ---------------- Lectura del archivo ----------------

/** Convierte el contenido binario de un .xlsx/.xls en filas crudas (array de arrays). */
export function leerFilasDeExcel(buffer: Buffer): any[][] {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null }) as any[][];
}

function findHeaderRowIdx(rows: any[][], markerCol: string): number {
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const r = rows[i];
    if (!r) continue;
    if (r.some((c) => c !== null && String(c).trim() === markerCol)) return i;
  }
  return -1;
}
function colIndex(header: any[], name: string): number {
  return header.findIndex((h) => h !== null && String(h).trim() === name);
}
function totalIndices(header: any[]): number[] {
  const idxs: number[] = [];
  header.forEach((h, i) => {
    if (h !== null && String(h).trim() === "Total") idxs.push(i);
  });
  return idxs;
}
function toDate(v: any): Date | null {
  if (v instanceof Date) return v;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}
export function mesKeyOf(d: Date): string {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
}
function diaKeyOf(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// ---------------- Ventas Detalladas ----------------

export type VentaLimpia = {
  cliCod: number;
  cliNom: string;
  fecha: Date;
  fechaStr: string;
  mes: string;
  tipo: string;
  numero: string;
  artCod: string;
  artNom: string;
  cantidad: number;
  totalLinea: number;
};

export type ResultadoVentas =
  | {
      ok: true;
      clean: VentaLimpia[];
      excluidasPrueba: number;
      excluidasVacias: number;
      duplicadas: number;
      tiposDesconocidos: Record<string, number>;
      totalFilas: number;
    }
  | { ok: false; error: string };

export function procesarVentas(rows: any[][]): ResultadoVentas {
  const hIdx = findHeaderRowIdx(rows, "Cliente Codigo");
  if (hIdx === -1) return { ok: false, error: 'No encontré la columna "Cliente Codigo" en las primeras filas. ¿Es el archivo de Ventas correcto?' };
  const header = rows[hIdx];
  const required = ["Cliente Codigo", "Cliente Nombre", "Fecha", "Tipo", "Número", "Articulo Codigo", "Articulo Nombre", "Cantidad"];
  const missing = required.filter((c) => colIndex(header, c) === -1);
  const tIdx = totalIndices(header);
  if (missing.length || tIdx.length < 2) {
    return { ok: false, error: "Estructura de columnas inesperada (faltan: " + missing.join(", ") + "). No proceso nada para no arriesgar el cálculo." };
  }
  const iCC = colIndex(header, "Cliente Codigo"),
    iCN = colIndex(header, "Cliente Nombre"),
    iF = colIndex(header, "Fecha"),
    iT = colIndex(header, "Tipo"),
    iN = colIndex(header, "Número"),
    iAC = colIndex(header, "Articulo Codigo"),
    iAN = colIndex(header, "Articulo Nombre"),
    iQ = colIndex(header, "Cantidad"),
    iTL = tIdx[1];

  const dataRows = rows.slice(hIdx + 1);
  let excluidasPrueba = 0,
    excluidasVacias = 0,
    duplicadas = 0;
  const tiposDesconocidos: Record<string, number> = {};
  const seen = new Set<string>();
  const clean: VentaLimpia[] = [];

  for (const r of dataRows) {
    if (!r || r.every((c) => c === null || c === "")) continue;
    const cliCod = r[iCC],
      artCod = r[iAC];
    if (cliCod === null || cliCod === "" || artCod === null || artCod === "") {
      excluidasVacias++;
      continue;
    }
    const artCodStr = String(artCod).trim();
    if (artCodStr.toUpperCase() === "PRUEBA") {
      excluidasPrueba++;
      continue;
    }
    const tipo = r[iT] ? String(r[iT]).trim() : "";
    if (!KNOWN_TIPOS.includes(tipo)) {
      tiposDesconocidos[tipo] = (tiposDesconocidos[tipo] || 0) + 1;
      continue;
    }
    const fecha = toDate(r[iF]);
    if (!fecha) continue;
    const key = [tipo, r[iN], artCodStr, r[iQ], r[iTL]].join("|");
    if (seen.has(key)) {
      duplicadas++;
      continue;
    }
    seen.add(key);
    const numeroStr = String(r[iN]).trim();
    clean.push({
      cliCod: Number(cliCod),
      cliNom: r[iCN] ? String(r[iCN]).trim() : "",
      fecha,
      fechaStr: diaKeyOf(fecha),
      mes: mesKeyOf(fecha),
      tipo,
      numero: numeroStr,
      artCod: artCodStr,
      artNom: r[iAN] ? String(r[iAN]).trim() : artCodStr,
      cantidad: Number(r[iQ]) || 0,
      totalLinea: Number(r[iTL]) || 0,
    });
  }
  return { ok: true, clean, excluidasPrueba, excluidasVacias, duplicadas, tiposDesconocidos, totalFilas: dataRows.length };
}

// ---------------- Maestro de Clientes ----------------

export type ResultadoClientes = { ok: true; map: Record<number, string>; n: number } | { ok: false; error: string };

export function procesarClientes(rows: any[][]): ResultadoClientes {
  const hIdx = findHeaderRowIdx(rows, "Código");
  if (hIdx === -1) return { ok: false, error: 'No encontré la columna "Código". ¿Es el archivo de Maestro de Clientes correcto?' };
  const header = rows[hIdx];
  const iCod = colIndex(header, "Código"),
    iNom = colIndex(header, "Nombre");
  if (iCod === -1 || iNom === -1) return { ok: false, error: "Falta la columna Código o Nombre." };
  const map: Record<number, string> = {};
  let n = 0;
  rows.slice(hIdx + 1).forEach((r) => {
    if (!r || r[iCod] === null || r[iCod] === "") return;
    map[Number(r[iCod])] = r[iNom] ? String(r[iNom]).trim() : "#" + r[iCod];
    n++;
  });
  return { ok: true, map, n };
}

// ---------------- Costo por Producto ----------------

export type ResultadoCosto =
  | { ok: true; map: Record<string, number>; nombreMap: Record<string, string>; selMap: Record<string, string>; n: number }
  | { ok: false; error: string };

export function procesarCosto(rows: any[][]): ResultadoCosto {
  const hIdx = findHeaderRowIdx(rows, "Articulo Codigo");
  if (hIdx === -1) return { ok: false, error: 'No encontré la columna "Articulo Codigo". ¿Es el archivo de Costo correcto?' };
  const header = rows[hIdx];
  const iAC = colIndex(header, "Articulo Codigo"),
    iCant = colIndex(header, "Cantidad"),
    iCosto = colIndex(header, "Costo");
  if (iAC === -1 || iCant === -1 || iCosto === -1) return { ok: false, error: "Faltan columnas Articulo Codigo / Cantidad / Costo." };
  const iAN = colIndex(header, "Articulo Nombre"),
    iSel = colIndex(header, "Seleccion Nombre");
  const map: Record<string, number> = {},
    nombreMap: Record<string, string> = {},
    selMap: Record<string, string> = {};
  let n = 0;
  rows.slice(hIdx + 1).forEach((r) => {
    if (!r || r[iAC] === null || r[iAC] === "") return;
    const cod = String(r[iAC]).trim();
    const cant = Number(r[iCant]) || 0,
      costo = Number(r[iCosto]) || 0;
    if (cant > 0) map[cod] = costo / cant;
    if (iAN !== -1 && r[iAN] !== null && r[iAN] !== "") nombreMap[cod] = String(r[iAN]).trim();
    if (iSel !== -1 && r[iSel] !== null && r[iSel] !== "") selMap[cod] = String(r[iSel]).trim();
    n++;
  });
  return { ok: true, map, nombreMap, selMap, n };
}

// ---------------- Venta por Vendedor ----------------

export type ResultadoVendedor = { ok: true; agg: Record<string, number>; n: number } | { ok: false; error: string };

export function procesarVendedor(rows: any[][]): ResultadoVendedor {
  const hIdx = findHeaderRowIdx(rows, "Vendedor Nombre");
  if (hIdx === -1) return { ok: false, error: 'No encontré la columna "Vendedor Nombre". ¿Es el archivo de Venta por Vendedor correcto?' };
  const header = rows[hIdx];
  const iV = colIndex(header, "Vendedor Nombre"),
    iTot = colIndex(header, "Total");
  if (iV === -1 || iTot === -1) return { ok: false, error: "Faltan columnas Vendedor Nombre / Total." };
  const agg: Record<string, number> = {};
  let n = 0;
  rows.slice(hIdx + 1).forEach((r) => {
    if (!r || r[iV] === null) return;
    const v = String(r[iV]).trim();
    agg[v] = (agg[v] || 0) + (Number(r[iTot]) || 0);
    n++;
  });
  return { ok: true, agg, n };
}
