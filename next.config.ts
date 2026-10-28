import type { NextConfig } from "next";

/** 모든 응답에 붙이는 기본 보안 헤더 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },          // 파일 형식 추측 금지
  { key: "X-Frame-Options", value: "DENY" },                    // 다른 사이트에 iframe으로 끼워 넣기 금지
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false, // X-Powered-By: Next.js 헤더 숨김
  experimental: {
    agentUpgrade: "security",
  },
  headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;

