import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { getSession } from "@/lib/auth";

export default async function SignUpPage() {
  if (await getSession()) redirect("/dashboard");
  return (
    <main className="px-4 py-16">
      <AuthForm mode="up" />
    </main>
  );
}
