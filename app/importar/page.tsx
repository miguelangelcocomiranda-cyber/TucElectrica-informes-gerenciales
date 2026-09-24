// app/importar/page.tsx
"use client";

import { useState, useEffect } from "react";
import { previsualizarImportacion, guardarImportacion, listarHistorial, PreviewResultado, GuardarResultado } from "./actions";

type MesCargadoUI = { mes: string; ventas_filas: number; tiene_costo: boolean; tiene_vendedor: boolean };

function FileField({
  label,
  obligatorio,
  file,
  onChange,
}: {
  label: string;
  obligatorio?: boolean;
  file: File | null;
  onChange: (f: File | null) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium text-slate-700">
        {label} {obligatorio ? <span className="text-red-600">*</span> : <span className="text-slate-400">(opcional)</span>}
      </label>
      <input
        type="file"
        accept=".xlsx,.xls"
        onChange={(e) => onChange(e.target.files?.[0] || null)}
        className="text-sm file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-slate-200"
      />
      {file && <span className="text-xs text-slate-500">{file.name}</span>}
    </div>
  );
}

export default function ImportarPage() {
  const [fVentas, setFVentas] = useState<File | null>(null);
  const [fClientes, setFClientes] = useState<File | null>(null);
  const [fCosto, setFCosto] = useState<File | null>(null);
  const [fVendedor, setFVendedor] = useState<File | null>(null);

  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [preview, setPreview] = useState<PreviewResultado | null>(null);
  const [resultado, setResultado] = useState<GuardarResultado | null>(null);
  const [historial, setHistorial] = useState<MesCargadoUI[]>([]);
  const [cargandoHistorial, setCargandoHistorial] = useState(true);

  async function cargarHistorial() {
    setCargandoHistorial(true);
    try {
      const data = await listarHistorial();
      setHistorial(data);
    } finally {
      setCargandoHistorial(false);
    }
  }

  useEffect(() => {
    cargarHistorial();
  }, []);

  function armarFormData() {
    const fd = new FormData();
    if (fVentas) fd.set("ventas", fVentas);
    if (fClientes) fd.set("clientes", fClientes);
    if (fCosto) fd.set("costo", fCosto);
    if (fVendedor) fd.set("vendedor", fVendedor);
    return fd;
  }

  async function onPrevisualizar() {
    if (!fVentas) return;
    setCargando(true);
    setResultado(null);
    setPreview(null);
    try {
      const r = await previsualizarImportacion(armarFormData());
      setPreview(r);
    } finally {
      setCargando(false);
    }
  }

  async function onGuardar() {
    setGuardando(true);
    try {
      const r = await guardarImportacion(armarFormData());
      setResultado(r);
      if (r.ok) {
        setPreview(null);
        setFVentas(null);
        setFClientes(null);
        setFCosto(null);
        setFVendedor(null);
        await cargarHistorial();
      }
    } finally {
      setGuardando(false);
    }
  }

  function onCancelar() {
    setPreview(null);
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-semibold text-slate-900">Importar mes</h1>
      <p className="mt-1 text-sm text-slate-500">
        Subí los archivos que exportás de Fénix para el mes que querés cargar. Ventas Detalladas es el único obligatorio — los demás suman costo,
        vendedor y nombres de clientes si los tenés.
      </p>

      <div className="mt-8 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <FileField label="Ventas Detalladas" obligatorio file={fVentas} onChange={setFVentas} />
          <FileField label="Maestro de Clientes" file={fClientes} onChange={setFClientes} />
          <FileField label="Costo por Producto" file={fCosto} onChange={setFCosto} />
          <FileField label="Venta por Vendedor" file={fVendedor} onChange={setFVendedor} />
        </div>

        <div className="mt-6 flex items-center gap-3">
          <button
            onClick={onPrevisualizar}
            disabled={!fVentas || cargando}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            {cargando ? "Leyendo…" : "Previsualizar"}
          </button>
          {!fVentas && <span className="text-xs text-slate-400">Elegí al menos el archivo de Ventas Detalladas.</span>}
        </div>
      </div>

      {preview && !preview.ok && (
        <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{preview.error}</div>
      )}

      {preview && preview.ok && (
        <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-6">
          <h2 className="text-base font-semibold text-slate-900">Revisá antes de guardar</h2>

          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <div className="text-xs text-slate-500">Filas leídas</div>
              <div className="text-lg font-semibold">{preview.totalFilas.toLocaleString("es-AR")}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Excluidas (prueba)</div>
              <div className="text-lg font-semibold">{preview.excluidasPrueba.toLocaleString("es-AR")}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Excluidas (vacías)</div>
              <div className="text-lg font-semibold">{preview.excluidasVacias.toLocaleString("es-AR")}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Duplicadas</div>
              <div className="text-lg font-semibold">{preview.duplicadas.toLocaleString("es-AR")}</div>
            </div>
          </div>

          <div className="mt-4">
            <div className="text-xs font-medium text-slate-600">Meses detectados</div>
            <ul className="mt-1 text-sm text-slate-800">
              {preview.meses.map((m) => (
                <li key={m.mes}>
                  {m.mes}: {m.filas.toLocaleString("es-AR")} filas — <span className="text-amber-700">reemplaza lo que ya estaba cargado para ese mes</span>
                </li>
              ))}
            </ul>
          </div>

          {Object.keys(preview.tiposDesconocidos).length > 0 && (
            <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
              Hay tipos de comprobante que no reconozco (no se van a guardar):{" "}
              {Object.entries(preview.tiposDesconocidos)
                .map(([t, n]) => `"${t || "(vacío)"}" x${n}`)
                .join(", ")}
            </div>
          )}

          <div className="mt-4 space-y-1 text-sm text-slate-700">
            {preview.clientes && <div>Maestro de Clientes: {preview.clientes.n} clientes.</div>}
            {preview.costo && <div>Costo por Producto: {preview.costo.n} artículos.</div>}
            {preview.vendedor && <div>Venta por Vendedor: {preview.vendedor.n} vendedores.</div>}
            {preview.avisoVendedorMultimes && (
              <div className="text-amber-700">
                El archivo de Vendedor no se va a guardar: subiste varios meses de Ventas juntos y ese reporte sólo se puede aplicar a un mes por vez.
              </div>
            )}
          </div>

          <div className="mt-6 flex items-center gap-3">
            <button onClick={onGuardar} disabled={guardando} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-40">
              {guardando ? "Guardando…" : "Guardar en la app"}
            </button>
            <button onClick={onCancelar} disabled={guardando} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {resultado && !resultado.ok && <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{resultado.error}</div>}
      {resultado && resultado.ok && (
        <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">{resultado.mensaje}</div>
      )}

      <div className="mt-10">
        <h2 className="text-base font-semibold text-slate-900">Meses cargados</h2>
        <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2">Mes</th>
                <th className="px-4 py-2">Filas de venta</th>
                <th className="px-4 py-2">Costo</th>
                <th className="px-4 py-2">Vendedor</th>
              </tr>
            </thead>
            <tbody>
              {cargandoHistorial && (
                <tr>
                  <td className="px-4 py-3 text-slate-400" colSpan={4}>
                    Cargando…
                  </td>
                </tr>
              )}
              {!cargandoHistorial && historial.length === 0 && (
                <tr>
                  <td className="px-4 py-3 text-slate-400" colSpan={4}>
                    Todavía no hay meses cargados.
                  </td>
                </tr>
              )}
              {historial.map((m) => (
                <tr key={m.mes} className="border-t border-slate-100">
                  <td className="px-4 py-2 font-medium">{m.mes}</td>
                  <td className="px-4 py-2">{m.ventas_filas.toLocaleString("es-AR")}</td>
                  <td className="px-4 py-2">{m.tiene_costo ? "✔" : "—"}</td>
                  <td className="px-4 py-2">{m.tiene_vendedor ? "✔" : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
