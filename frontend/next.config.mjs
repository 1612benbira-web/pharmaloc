/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  output: 'standalone', // image de déploiement légère
  images: { unoptimized: true }, // sharp (LGPL) volontairement exclu - voir LICENSES.md
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          // IMPORTANT : la politique des tuiles OSM exige que le navigateur envoie un en-tête Referer valide.
          // Ne JAMAIS passer à « no-referrer » : les tuiles OpenStreetMap seraient bloquées.
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
        ],
      },
    ];
  },
};
export default nextConfig;
