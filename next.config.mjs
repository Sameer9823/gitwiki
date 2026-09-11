/** @type {import('next').NextConfig} */
const nextConfig = {
  // Prevents Next.js from bundling web-tree-sitter through webpack —
  // it's loaded natively from node_modules at runtime instead, which
  // avoids the `createRequire is not a function` crash.
  serverExternalPackages: ["web-tree-sitter"],
  experimental: {
    serverActions: { bodySizeLimit: "2mb" },
  },
  // Ignore tests folder in production build
  pageExtensions: ["ts", "tsx", "js", "jsx", "md", "mdx"],
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
      };
    }
    if (isServer) {
      config.externals = [...(config.externals || []), "web-tree-sitter"];
    }
    // Ignore test files
    config.module.rules.push({
      test: /tests\/.*\.ts$/,
      loader: "ignore-loader",
    });
    return config;
  },
};

const withSentry = process.env.NEXT_PUBLIC_SENTRY_DSN
  ? require("@sentry/nextjs").withSentryConfig
  : (config) => config;

export default withSentry(nextConfig, {
  silent: !process.env.SENTRY_AUTH_TOKEN,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
});