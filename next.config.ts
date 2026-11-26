import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // R62: which version this is, so a phone / the app still showing an older version reloads itself (VersionWatch).
  env: { NEXT_PUBLIC_BUILD_ID: process.env.VERCEL_GIT_COMMIT_SHA || `local-${Date.now()}` },
  serverExternalPackages: ["@prisma/client", "pg", "@react-pdf/renderer", "nodemailer", "exceljs"],
  // Settings → Project documents reads these files at run time, so ship them with the server.
  outputFileTracingIncludes: { "/admin/docs": ["./docs/**/*.md", "./DEPLOY.md"], "/guide": ["./docs/WORKFLOW.md"] },
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
