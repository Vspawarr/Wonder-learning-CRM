import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@prisma/client", "pg", "@react-pdf/renderer", "nodemailer", "exceljs"],
};

export default nextConfig;
