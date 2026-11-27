import SignInForm from "@/components/auth/SignInForm";

const NOTICES: Record<string, string> = {
  confirmed: "Your email is confirmed. Log in to continue.",
};

export default async function AuthPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  const { notice } = await searchParams;
  return <SignInForm notice={notice ? NOTICES[notice] : undefined} />;
}
