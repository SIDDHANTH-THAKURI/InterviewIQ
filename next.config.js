/** @type {import('next').NextConfig} */
const nextConfig = {
  // The interview room owns long-lived singletons (a WebSocket, a microphone
  // AudioWorklet, a webcam stream, an AudioContext). React's dev-only Strict
  // Mode double-invoke would open two of each. Disable it so realtime behaviour
  // in dev matches production.
  reactStrictMode: false,
  eslint: {
    // Linting is run separately; never block a production build on style nits.
    ignoreDuringBuilds: true,
  },
  webpack: (config) => {
    // pdfjs-dist pulls in an optional `canvas` native dep that we don't need
    // in the browser, plus `encoding` via node-fetch. Stub them out.
    config.resolve.alias = {
      ...config.resolve.alias,
      canvas: false,
      encoding: false,
    };
    return config;
  },
};

module.exports = nextConfig;
