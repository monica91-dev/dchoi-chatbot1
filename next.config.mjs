/** @type {import('next').NextConfig} */
const nextConfig = {
  // exceljs 는 서버에서만 쓰는 큰 라이브러리라 번들에서 제외
  serverExternalPackages: ["exceljs"],
};

export default nextConfig;
