/** Proxy /api to the Express server so auth cookies stay same-origin. */
const nextConfig = {
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${process.env.API_URL || "http://localhost:4000"}/api/:path*` }];
  },
};
export default nextConfig;
