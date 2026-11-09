/**
 * Bootstrap (or promote) an admin account. Run once after the migrations:
 *
 *   npm run create-admin -- you@example.com "Your Name"
 *
 * You will be asked for the password (or set ADMIN_PASSWORD in the environment).
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (.env.local).
 */
import { config } from "dotenv";
import { createInterface } from "node:readline/promises";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local" });
config();

async function main() {
  const [email, ...nameParts] = process.argv.slice(2);
  const fullName = nameParts.join(" ").trim() || null;
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    console.error('Usage: npm run create-admin -- you@example.com "Your Name"');
    process.exit(1);
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local");
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  // Existing user? Promote instead of creating.
  const { data: existing } = await db.from("profiles").select("id").eq("email", email.toLowerCase()).maybeSingle();
  let userId = existing?.id as string | undefined;

  if (!userId) {
    let password = process.env.ADMIN_PASSWORD;
    if (!password) {
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      password = await rl.question("Password for the new admin (min 8 chars): ");
      rl.close();
    }
    if (!password || password.length < 8) throw new Error("Password must be at least 8 characters.");
    const { data, error } = await db.auth.admin.createUser({
      email: email.toLowerCase(),
      password,
      email_confirm: true,
      user_metadata: fullName ? { full_name: fullName } : {},
    });
    if (error || !data.user) throw new Error(`Could not create user: ${error?.message}`);
    userId = data.user.id;
    console.log(`Created auth user ${email}`);
  }

  const update: Record<string, unknown> = { role: "admin", is_active: true };
  if (fullName) update.full_name = fullName;
  const { error } = await db.from("profiles").update(update).eq("id", userId);
  if (error) throw new Error(`Could not promote profile: ${error.message}`);
  console.log(`${email} is now an active admin.`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
