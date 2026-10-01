/** @type {import('next').NextConfig} */
const nextConfig = {
  // pdfjs-dist (usado para leer el PDF de Comisiones) carga su "worker" con
  // una ruta relativa en tiempo de ejecución, que Vercel no detecta solo al
  // armar el paquete de la función serverless — sin esto tira "Cannot find
  // module .../pdf.worker.mjs" al subir el PDF. serverExternalPackages deja
  // el paquete sin empaquetar (tal cual está en node_modules) y
  // outputFileTracingIncludes fuerza a incluir el archivo del worker.
  serverExternalPackages: ["pdfjs-dist"],
  outputFileTracingIncludes: {
    "/comisiones": ["./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "15mb",
    },
  },
};
export default nextConfig;
