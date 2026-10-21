import { redirect } from "next/navigation";

// Drafts are a folder of the Inbox now ("all one thing").
export default function DraftsPage() {
  redirect("/admin/inbox?folder=drafts");
}
