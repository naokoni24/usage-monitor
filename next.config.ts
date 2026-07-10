import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allows accessing the dev server from the Mac's LAN IP (e.g. testing from an iPhone
  // on the same Wi-Fi). Next.js blocks cross-origin dev requests (HMR, etc.) by default.
  allowedDevOrigins: ["192.168.1.4"],
};

export default nextConfig;
