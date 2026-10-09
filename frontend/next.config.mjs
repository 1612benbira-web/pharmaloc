/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  output: 'standalone', // image de déploiement légère (Datacloud)
  images: { unoptimized: true }, // sharp (LGPL) volontairement exclu - voir LICENSES.md
};
export default nextConfig;
