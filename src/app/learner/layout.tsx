import { auth } from "@/server/auth/config";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";

export default async function LearnerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session) {
    redirect("/login");
  }

  return <AppShell>{children}</AppShell>;
}
