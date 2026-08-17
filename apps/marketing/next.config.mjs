/** @type {import('next').NextConfig} */
const nextConfig = {
  // Constrain source discovery to this application. The build uses webpack
  // because its package resolution can still follow pnpm workspace links while
  // Turbopack's filesystem root deliberately cannot cross this boundary.
  turbopack: { root: import.meta.dirname },
};

export default nextConfig;
