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
};

module.exports = nextConfig;
