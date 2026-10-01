"use client";

import { useRouter } from "next/navigation";
import { useAction } from "./client";
import { Icon } from "./icons";
import { createRenewals } from "@/app/actions";

/** Clients page: create next academic year's renewal opportunities in one go. */
export function RenewalsBanner({ ay, count, canCreate }: { ay: string; count: number; canCreate: boolean }) {
  const { pending, run } = useAction();
  if (!count) return null;
  return (
    <div className="note flex flex-wrap items-center justify-between gap-2">
      <span>
        <b>Renewals for AY {ay}:</b> {count} client{count === 1 ? "" : "s"} ordered this year but {count === 1 ? "has" : "have"} no renewal
        opportunity yet.
      </span>
      {canCreate ? (
        <button
          className="btn sm pri"
          disabled={pending}
          onClick={() =>
            run(() => createRenewals(), {
              success: `Renewal opportunities created for AY ${ay}. Each owner has a follow-up in To-do.`,
            })
          }
        >
          Create {count} renewal{count === 1 ? "" : "s"}
        </button>
      ) : null}
    </div>
  );
}

/** Client page: create this client's renewal for the coming academic year. */
export function RenewalButton({ clientId, ay }: { clientId: string; ay: string }) {
  const { pending, run } = useAction();
  const router = useRouter();
  return (
    <button
      className="btn"
      disabled={pending}
      onClick={() =>
        run(() => createRenewals(clientId), {
          success: `Renewal opportunity for AY ${ay} created.`,
          onDone: () => router.push("/opportunities?stage=Open"),
        })
      }
    >
      <Icon name="briefcase" size={16} /> Renewal AY {ay}
    </button>
  );
}
