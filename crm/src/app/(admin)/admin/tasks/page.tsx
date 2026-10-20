import { redirect } from "next/navigation";

// Folded into Today (2026-10-20). Old links and bookmarks still land somewhere useful.
export default function Page() {
  redirect("/admin/today");
}
