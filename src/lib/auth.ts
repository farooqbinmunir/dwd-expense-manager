import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type Role = "admin" | "member";

export interface CurrentUser {
  id: string;
  email: string;
  fullName: string | null;
  role: Role;
  isActive: boolean;
}

/** Current signed-in user + profile, or null. Cached per request. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, email, full_name, role, is_active")
    .eq("id", userId)
    .maybeSingle();
  if (!profile) {
    return { id: userId, email: String(claims.claims.email ?? ""), fullName: null, role: "member", isActive: false };
  }
  return {
    id: profile.id,
    email: profile.email,
    fullName: profile.full_name,
    role: profile.role as Role,
    isActive: profile.is_active,
  };
});

/** Require an active user (redirects otherwise). */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.isActive) redirect("/inactive");
  return user;
}

export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/?error=admin-only");
  return user;
}

/** For server actions: returns an error string instead of redirecting. */
export async function checkUser(adminOnly = false): Promise<{ user: CurrentUser } | { error: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Your session has expired. Please sign in again." };
  if (!user.isActive) return { error: "Your account is not active." };
  if (adminOnly && user.role !== "admin") return { error: "Only an admin can do this." };
  return { user };
}

export function displayName(u: { fullName: string | null; email: string }): string {
  return u.fullName || u.email;
}
