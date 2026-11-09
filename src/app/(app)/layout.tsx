import { signOut } from "@/app/auth-actions";
import { MobileNav, Sidebar } from "@/components/nav";
import { displayName, requireUser } from "@/lib/auth";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  const isAdmin = user.role === "admin";
  return (
    <div className="min-h-screen">
      <Sidebar
        isAdmin={isAdmin}
        userLabel={displayName(user)}
        signOut={
          <form action={signOut}>
            <button className="text-sm font-medium text-slate-600 hover:text-red-600">Sign out</button>
          </form>
        }
      />
      <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-border bg-white/95 px-4 backdrop-blur lg:hidden">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-brand text-xs font-bold text-white">D</div>
          <span className="text-sm font-semibold">DWD Expenses</span>
        </div>
        <span className="max-w-[45%] truncate text-xs text-muted">{displayName(user)}</span>
      </header>
      <main className="px-4 pt-5 pb-28 sm:px-6 lg:ml-60 lg:px-8 lg:pt-8 lg:pb-12">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
      <MobileNav isAdmin={isAdmin} />
    </div>
  );
}
