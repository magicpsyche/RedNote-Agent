import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 允许局域网访问开发资源，避免跨域警告
  // 注意：仅需域名/IP，端口及协议会自动匹配
  allowedDevOrigins: ["localhost", "127.0.0.1", "192.168.0.151"],
};

export default nextConfig;
