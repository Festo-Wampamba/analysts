import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // TypeScript 5.9 has a JavaScript compiler API. Using it avoids Next 16's
  // direct CLI invocation, which executes the package wrapper as a Node entry
  // and returns no `--showConfig` output in this pnpm environment.
  experimental: {
    useTypeScriptCli: false,
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // NOTE: CSP is added in the UI phase once the real inline-style and
          // font surface is known — tracked in README Known Limitations until then.
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains",
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
