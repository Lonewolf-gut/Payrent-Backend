import type { NextConfig } from "next";

const lifecycle = process.env.npm_lifecycle_event ?? "";
const isDevServer = lifecycle === "dev" || lifecycle === "dev:turbo";
const isProductionBuild = lifecycle === "build";
const useStandaloneOutput = isProductionBuild && process.env.STANDALONE_BUILD === "1";
const frontendOrigin =
  process.env.FRONTEND_URL?.replace(/\/$/, "") ?? "http://localhost:3000";

const nextConfig: NextConfig = {
  ...(useStandaloneOutput ? { output: "standalone" as const } : {}),
  typescript: {
    ignoreBuildErrors: true,
  },
  async headers() {
    return [
      {
        source: "/api/:path*",
        headers: [
          { key: "Access-Control-Allow-Credentials", value: "true" },
          { key: "Access-Control-Allow-Origin", value: frontendOrigin },
          {
            key: "Access-Control-Allow-Methods",
            value: "GET,DELETE,PATCH,POST,PUT,OPTIONS",
          },
          {
            key: "Access-Control-Allow-Headers",
            value:
              "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization, x-bank-api-key, x-bank-signature",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
