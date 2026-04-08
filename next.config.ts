import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Puppeteer must NEVER be bundled for the browser.
  // Marking it external ensures Next.js only loads it on the server.
  serverExternalPackages: ["puppeteer", "puppeteer-core"],

  // Allow product images from Amazon, Flipkart, Myntra CDNs
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.amazon.com" },
      { protocol: "https", hostname: "**.amazon.in" },
      { protocol: "https", hostname: "rukminim*.flixcart.com" },
      { protocol: "https", hostname: "**.myntra.com" },
      { protocol: "https", hostname: "assets.myntassets.com" },
    ],
  },
};

export default nextConfig;
