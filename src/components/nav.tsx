"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

type Item = { href: string; label: string; icon: ReactNode; adminOnly?: boolean };

const Icon = ({ d }: { d: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 shrink-0" aria-hidden>
    <path d={d} />
  </svg>
);

const ITEMS: Item[] = [
  { href: "/", label: "Dashboard", icon: <Icon d="M3 12l9-8 9 8M5 10v10h5v-6h4v6h5V10" /> },
  { href: "/transactions", label: "Transactions", icon: <Icon d="M4 6h16M4 12h16M4 18h10" /> },
  { href: "/reports", label: "Reports", icon: <Icon d="M5 20V10M12 20V4M19 20v-7" /> },
  { href: "/people", label: "People", icon: <Icon d="M16 19v-1a4 4 0 00-4-4H7a4 4 0 00-4 4v1M9.5 10a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM21 19v-1a4 4 0 00-3-3.9M16 3.1a3.5 3.5 0 010 6.8" /> },
  { href: "/categories", label: "Categories", icon: <Icon d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" /> },
  { href: "/admin/users", label: "Users", icon: <Icon d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z" />, adminOnly: true },
  { href: "/account", label: "My account", icon: <Icon d="M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0" /> },
];

function isActive(path: string, href: string) {
  return href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`);
}

export function Sidebar({ isAdmin, userLabel, signOut }: { isAdmin: boolean; userLabel: string; signOut: ReactNode }) {
  const path = usePathname();
  return (
    <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r border-border bg-white lg:flex">
      <div className="flex h-16 items-center gap-2.5 border-b border-border px-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-sm font-bold text-white">D</div>
        <div className="leading-tight">
          <p className="text-sm font-semibold">DWD Expenses</p>
          <p className="text-xs text-muted">Office construction</p>
        </div>
      </div>
      <div className="px-3 pt-4">
        <Link href="/transactions/new" className="btn-primary w-full">
          <span aria-hidden className="text-lg leading-none">+</span> Add transaction
        </Link>
      </div>
      <nav className="flex-1 space-y-0.5 px-3 py-4" aria-label="Main">
        {ITEMS.filter((i) => !i.adminOnly || isAdmin).map((i) => {
          const active = isActive(path, i.href);
          return (
            <Link
              key={i.href}
              href={i.href}
              aria-current={active ? "page" : undefined}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium ${
                active ? "bg-brand-soft text-brand" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              }`}
            >
              {i.icon}
              {i.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-border p-4">
        <p className="truncate text-sm font-medium" title={userLabel}>{userLabel}</p>
        <p className="mb-2 text-xs text-muted">{isAdmin ? "Admin" : "Member"}</p>
        {signOut}
      </div>
    </aside>
  );
}

export function MobileNav({ isAdmin }: { isAdmin: boolean }) {
  const path = usePathname();
  const items = [ITEMS[0], ITEMS[1], null, ITEMS[2], { ...ITEMS[3], href: "/more", label: "More" }];
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-white/95 backdrop-blur lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="Main"
    >
      <div className="mx-auto grid max-w-lg grid-cols-5">
        {items.map((i, idx) =>
          i === null ? (
            <div key="add" className="flex items-center justify-center">
              <Link
                href="/transactions/new"
                aria-label="Add transaction"
                className="-mt-6 flex h-14 w-14 items-center justify-center rounded-full bg-brand text-3xl leading-none text-white shadow-lg ring-4 ring-white"
              >
                +
              </Link>
            </div>
          ) : i.href === "/more" ? (
            <MoreMenu key="more" isAdmin={isAdmin} path={path} />
          ) : (
            <Link
              key={idx}
              href={i.href}
              aria-current={isActive(path, i.href) ? "page" : undefined}
              className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${
                isActive(path, i.href) ? "text-brand" : "text-slate-500"
              }`}
            >
              {i.icon}
              {i.label}
            </Link>
          ),
        )}
      </div>
    </nav>
  );
}

function MoreMenu({ isAdmin, path }: { isAdmin: boolean; path: string }) {
  const extra = ITEMS.slice(3).filter((i) => !i.adminOnly || isAdmin);
  const active = extra.some((i) => isActive(path, i.href));
  return (
    <details className="group relative flex">
      <summary
        className={`flex min-h-14 w-full cursor-pointer list-none flex-col items-center justify-center gap-0.5 text-[11px] font-medium [&::-webkit-details-marker]:hidden ${
          active ? "text-brand" : "text-slate-500"
        }`}
      >
        <Icon d="M5 12h.01M12 12h.01M19 12h.01" />
        More
      </summary>
      <div className="absolute right-2 bottom-16 w-52 rounded-xl border border-border bg-white p-1.5 shadow-lg">
        {extra.map((i) => (
          <Link
            key={i.href}
            href={i.href}
            onClick={(e) => (e.currentTarget.closest("details") as HTMLDetailsElement | null)?.removeAttribute("open")}
            className={`flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm ${isActive(path, i.href) ? "bg-brand-soft text-brand" : "text-slate-700 hover:bg-slate-50"}`}
          >
            {i.icon}
            {i.label}
          </Link>
        ))}
      </div>
    </details>
  );
}
