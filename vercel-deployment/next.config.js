/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // /terms, /privacy, and /dpa read their content from legal/*.md via a
  // parameterized fs.readFileSync call, which Next's build-time file tracer
  // can't always detect through static analysis alone -- force-include the
  // directory so it isn't silently dropped from the deployed function.
  experimental: {
    outputFileTracingIncludes: {
      "/terms": ["./legal/**"],
      "/privacy": ["./legal/**"],
      "/dpa": ["./legal/**"],
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
