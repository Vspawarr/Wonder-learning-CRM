import { notFound } from "next/navigation";
import { Icon } from "@/components/icons";
import { PageHeader } from "@/components/ui";
import { db } from "@/lib/db";
import { canManageSettings } from "@/lib/permissions";
import { requireUser } from "@/server/session";

export const metadata = { title: "Backup" };

// R61: download the whole CRM's data, to keep safe outside Neon (disaster recovery: docs/DISASTER_RECOVERY.md).
export default async function BackupPage() {
  const user = await requireUser();
  if (!canManageSettings(user.role)) notFound();
  const [leads, clients, invoices, payments] = await Promise.all([db.lead.count(), db.client.count(), db.invoice.count(), db.payment.count()]);
  return (
    <>
      <PageHeader title="Backup" sub="Keep a copy of all the CRM's data outside the online database, so it can be rebuilt if anything is ever lost." />
      <div className="grid max-w-3xl gap-3">
        <div className="card p-4">
          <h2 className="text-lg">Full backup</h2>
          <p className="muted mt-1">
            One file with everything: leads, opportunities, clients, quotations, orders, invoices, payments, stock, users, settings, and every uploaded
            file (POs, logos, bills, documents, marketing files). Now: {[`${leads} lead${leads === 1 ? "" : "s"}`, `${clients} client${clients === 1 ? "" : "s"}`, `${invoices} invoice${invoices === 1 ? "" : "s"}`, `${payments} payment${payments === 1 ? "" : "s"}`].join(", ")}.
          </p>
          <a className="btn pri mt-3" href="/api/admin/backup" download>
            <Icon name="download" size={16} /> Download full backup
          </a>
        </div>
        <div className="card p-4">
          <h2 className="text-lg">Keep it safe</h2>
          <ul className="muted mt-1 list-disc pl-5">
            <li>Download a backup <b>every week</b> (and before any big change), and keep it in Google Drive in a private folder.</li>
            <li>Keep the last few weeks; delete older ones.</li>
            <li>
              The file holds all client details, money records and the team&apos;s login data (passwords are scrambled, not readable). Never share it or
              send it on WhatsApp / email.
            </li>
            <li>To rebuild the CRM from a backup, follow &ldquo;Disaster recovery&rdquo; in Project documents.</li>
          </ul>
        </div>
      </div>
    </>
  );
}
