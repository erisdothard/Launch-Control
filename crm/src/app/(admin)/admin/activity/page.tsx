import AdminHeader from "@/components/admin/AdminHeader";
import { getActivityLog } from "@/lib/store/activity";
import ActivityList from "./ActivityList";

export default async function ActivityPage() {
  const entries = await getActivityLog(100);

  return (
    <>
      <AdminHeader
        title="Activity Log"
        subtitle="Everything that changed in the CRM, newest first. It records itself; there is nothing to fill in here."
      />

      {entries.length === 0 ? (
        <div className="card max-w-[900px] px-8 py-10">
          <p className="font-display text-lg tracking-[0.04em] text-[var(--color-steel)]">Nothing yet</p>
          <p className="mt-2 text-base text-[var(--color-text-muted)]">
            Changes show up here as leads are added, updated and won.
          </p>
        </div>
      ) : (
        <ActivityList entries={entries} />
      )}
    </>
  );
}
