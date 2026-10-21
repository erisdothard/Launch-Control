import { redirect } from "next/navigation";

// /admin is the front door: Today.
export default function AdminIndex(): never {
  redirect("/admin/dashboard");
}
