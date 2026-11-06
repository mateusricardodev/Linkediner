import type { NextConfig } from 'next';

const apiOrigin = new URL(process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000').origin;
const development = process.env.NODE_ENV !== 'production';

/**
 * O Next.js precisa de scripts em linha sem nonce nas páginas estáticas. O restante é fechado: a
 * página só fala com a própria origem e com a API, e não pode ser aberta dentro de outro site.
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${development ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  `connect-src 'self' ${apiOrigin}${development ? ' ws:' : ''}`,
  "object-src 'none'",
  "base-uri 'self'",
  `form-action 'self'`,
  "frame-ancestors 'none'",
].join('; ');

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: contentSecurityPolicy },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
        ],
      },
    ];
  },
};

export default config;
