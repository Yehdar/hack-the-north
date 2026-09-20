import { redirect } from "next/navigation";

// The dashboard is the front door now, so it lives at "/". This keeps the old
// path working for anything that still links to it.
export default function DashboardRedirect() {
  redirect("/");
}
