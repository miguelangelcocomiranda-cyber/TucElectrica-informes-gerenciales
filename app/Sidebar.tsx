// app/Sidebar.tsx
// Menú lateral fijo, réplica del que tenía la app anterior: fondo azul
// noche, secciones GENERAL / COMERCIAL / GESTIÓN, ítems que todavía no
// están migrados a este stack se muestran deshabilitados con un badge
// "PRÓX." en vez de desaparecer, para que el menú se vea completo.
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = { label: string; href?: string };
type Seccion = { titulo: string; items: Item[] };

const SECCIONES: Seccion[] = [
  {
    titulo: "GENERAL",
    items: [{ label: "Dashboard Ejecutivo", href: "/" }, { label: "Resumen Gerencial" }, { label: "Alertas" }],
  },
  {
    titulo: "COMERCIAL",
    items: [
      { label: "Informe Comercial", href: "/informe-comercial" },
      { label: "Análisis de Clientes", href: "/analisis-clientes" },
      { label: "Curva de Maduración" },
    ],
  },
  {
    titulo: "GESTIÓN",
    items: [{ label: "Importador Mensual", href: "/importar" }, { label: "Rentabilidad" }, { label: "Calidad de Datos" }],
  },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex w-64 shrink-0 flex-col bg-slate-900">
      <div className="flex items-center gap-3 border-b border-slate-800 px-5 py-5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-500 text-sm font-bold text-white">SN</div>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-white">Informes Gerenciales</div>
          <div className="truncate text-xs text-slate-400">Voltaje · Nueva Sucursal</div>
        </div>
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-5">
        {SECCIONES.map((sec) => (
          <div key={sec.titulo}>
            <div className="px-3 text-[11px] font-semibold tracking-wider text-slate-500">{sec.titulo}</div>
            <div className="mt-2 space-y-0.5">
              {sec.items.map((item) => {
                if (!item.href) {
                  return (
                    <div key={item.label} className="flex items-center justify-between rounded-lg px-3 py-2 text-sm text-slate-600">
                      <span>{item.label}</span>
                      <span className="rounded-full bg-slate-800 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">PRÓX.</span>
                    </div>
                  );
                }
                const activo = pathname === item.href;
                return (
                  <Link
                    key={item.label}
                    href={item.href}
                    className={
                      "block rounded-lg px-3 py-2 text-sm font-medium transition " +
                      (activo ? "bg-indigo-500/15 text-white" : "text-slate-300 hover:bg-slate-800 hover:text-white")
                    }
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-slate-800 px-5 py-4 text-xs text-slate-500">Voltaje SRL</div>
    </aside>
  );
}
