// app/Sidebar.tsx
// Menú lateral fijo, réplica del que tenía la app anterior: fondo azul
// noche, secciones GENERAL / COMERCIAL / GESTIÓN, ítems que todavía no
// están migrados a este stack se muestran deshabilitados con un badge
// "PRÓX." en vez de desaparecer, para que el menú se vea completo.
// El logo va embebido en base64 (imagen provista por el usuario) para no
// depender de subir un archivo binario aparte a GitHub.
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LOGO_TUCUMAN_ELECTRICA =
  "data:image/png;base64,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";

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
      <div className="border-b border-slate-800 px-5 py-5">
        <div className="rounded-lg bg-white px-3 py-2.5">
          <img src={LOGO_TUCUMAN_ELECTRICA} alt="Tucumán Eléctrica" className="h-auto w-full" />
        </div>
        <div className="mt-2 truncate text-xs text-slate-400">Informes Gerenciales</div>
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

      <div className="border-t border-slate-800 px-5 py-4 text-xs text-slate-500">Tucumán Eléctrica</div>
    </aside>
  );
}
