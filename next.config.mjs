/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      // Los Excel de Ventas Detalladas pueden pesar varios MB — el límite
      // por defecto de Next.js (1MB) los rechazaría antes de llegar al importador.
      bodySizeLimit: "15mb",
    },
  },
};
export default nextConfig;
