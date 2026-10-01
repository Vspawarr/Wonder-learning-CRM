import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@prisma/client", "pg", "@react-pdf/renderer", "nodemailer", "exceljs"],
  async headers() {
    return [
      {
        // The Android app (built by android/build.sh). Always fetch the latest copy.
        source: "/downloads/:file*.apk",
        headers: [
          { key: "Content-Type", value: "application/vnd.android.package-archive" },
          { key: "Content-Disposition", value: 'attachment; filename="wonder-crm.apk"' },
          { key: "Cache-Control", value: "no-cache" },
        ],
      },
    ];
  },
};

export default nextConfig;
