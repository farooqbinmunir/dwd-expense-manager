/**
 * Integration tests for authentication, permissions (RLS), triggers, storage
 * policies, reporting functions and the import RPC.
 *
 * Requires a LOCAL Supabase stack (npx supabase start) with the migrations applied
 * and the env vars from .env.local. Refuses to run against a non-local URL.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { config } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

config({ path: ".env.local" });

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const ANON = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(URL)) {
  throw new Error(`Integration tests only run against a local Supabase (got "${URL}")`);
}

const TEST_DATE = "2099-01-01"; // keeps test rows away from real data
const PASSWORD = "integration-test-pw-123";
const stamp = Date.now();
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const service = createClient(URL, SERVICE, opts);

type Users = Record<"admin" | "member" | "member2" | "inactive", { id: string; email: string; client: SupabaseClient }>;
const users = {} as Users;

async function makeUser(key: keyof Users, role: "admin" | "member", active: boolean) {
  const email = `it-${key}-${stamp}@example.test`;
  const { data, error } = await service.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (error) throw error;
  const id = data.user!.id;
  const { error: pErr } = await service.from("profiles").update({ role, is_active: active, full_name: key }).eq("id", id);
  if (pErr) throw pErr;
  const client = createClient(URL, ANON, opts);
  const { error: sErr } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (sErr) throw sErr;
  users[key] = { id, email, client };
}

beforeAll(async () => {
  await makeUser("admin", "admin", true);
  await makeUser("member", "member", true);
  await makeUser("member2", "member", true);
  await makeUser("inactive", "member", false);
});

afterAll(async () => {
  await service.from("transactions").delete().eq("txn_date", TEST_DATE);
  await service.from("transactions").delete().like("source_ref", `test:${stamp}%`);
  const { data: objs } = await service.storage.from("receipts").list("", { limit: 1000 });
  void objs;
  for (const u of Object.values(users)) await service.auth.admin.deleteUser(u.id);
  await service.from("people").delete().like("name", `IT Person ${stamp}%`);
});

const newTxn = (createdBy: string, extra: Record<string, unknown> = {}) => ({
  txn_date: TEST_DATE,
  type: "out",
  amount: "100.00",
  description: "integration test",
  created_by: createdBy,
  ...extra,
});

describe("anonymous access", () => {
  const anon = createClient(URL, ANON, opts);
  it("cannot read any table", async () => {
    for (const table of ["transactions", "profiles", "people", "categories", "attachments", "transactions_view"]) {
      const { data } = await anon.from(table).select("*").limit(1);
      expect(data ?? []).toEqual([]);
    }
  });
  it("cannot write", async () => {
    const { error } = await anon.from("transactions").insert(newTxn("00000000-0000-0000-0000-000000000000"));
    expect(error).not.toBeNull();
  });
  it("cannot list or download receipts and the bucket is private", async () => {
    const { data } = await anon.storage.from("receipts").list("", { limit: 5 });
    expect(data ?? []).toEqual([]);
    const { data: bucket } = await service.storage.getBucket("receipts");
    expect(bucket?.public).toBe(false);
    const { data: any } = await service.from("attachments").select("storage_path").limit(1).maybeSingle();
    if (any?.storage_path) {
      const res = await fetch(`${URL}/storage/v1/object/public/receipts/${any.storage_path}`);
      expect(res.ok).toBe(false);
      const dl = await anon.storage.from("receipts").download(any.storage_path);
      expect(dl.error).not.toBeNull();
    }
  });
  it("cannot call the import RPC", async () => {
    const { error } = await anon.rpc("import_transactions", { p_source: "sheet_import", p_rows: [] });
    expect(error).not.toBeNull();
  });
  it("public sign-up is disabled", async () => {
    const { error } = await anon.auth.signUp({ email: `it-signup-${stamp}@example.test`, password: PASSWORD });
    expect(error).not.toBeNull();
  });
});

describe("inactive user", () => {
  it("sees nothing and cannot insert", async () => {
    const c = users.inactive.client;
    const { data } = await c.from("transactions").select("id").limit(1);
    expect(data).toEqual([]);
    const { error } = await c.from("transactions").insert(newTxn(users.inactive.id));
    expect(error).not.toBeNull();
  });
  it("cannot activate itself", async () => {
    const { error } = await users.inactive.client.from("profiles").update({ is_active: true }).eq("id", users.inactive.id);
    expect(error).not.toBeNull();
  });
});

describe("member permissions", () => {
  let ownId = "";
  let otherId = "";

  it("reads all transactions", async () => {
    const { count } = await users.member.client.from("transactions").select("id", { count: "exact", head: true });
    expect(count).toBeGreaterThan(0);
  });

  it("creates own transactions only", async () => {
    const m = users.member.client;
    const { data, error } = await m.from("transactions").insert(newTxn(users.member.id)).select("id, created_by, source").single();
    expect(error).toBeNull();
    expect(data!.created_by).toBe(users.member.id);
    expect(data!.source).toBe("app");
    ownId = data!.id;

    const forged = await m.from("transactions").insert(newTxn(users.member2.id));
    expect(forged.error).not.toBeNull();
    const fakeImport = await m.from("transactions").insert(newTxn(users.member.id, { source: "sheet_import", source_ref: "x" }));
    expect(fakeImport.error).not.toBeNull();

    const other = await users.member2.client.from("transactions").insert(newTxn(users.member2.id)).select("id").single();
    otherId = other.data!.id;
  });

  it("rejects invalid amounts and types at the database", async () => {
    const m = users.member.client;
    expect((await m.from("transactions").insert(newTxn(users.member.id, { amount: "0" }))).error).not.toBeNull();
    expect((await m.from("transactions").insert(newTxn(users.member.id, { amount: "-5" }))).error).not.toBeNull();
    expect((await m.from("transactions").insert(newTxn(users.member.id, { type: "sideways" }))).error).not.toBeNull();
  });

  it("edits own transaction; provenance fields are immutable", async () => {
    const m = users.member.client;
    const { data, error } = await m
      .from("transactions")
      .update({ amount: "250.50", description: "edited", created_by: users.member2.id, source: "sheet_import" })
      .eq("id", ownId)
      .select("amount, description, created_by, source, updated_by")
      .single();
    expect(error).toBeNull();
    expect(data).toMatchObject({ amount: 250.5, description: "edited", created_by: users.member.id, source: "app", updated_by: users.member.id });
  });

  it("cannot edit someone else's or imported transactions", async () => {
    const m = users.member.client;
    const r1 = await m.from("transactions").update({ description: "hack" }).eq("id", otherId).select("id");
    expect(r1.data).toEqual([]);
    const { data: imported } = await service.from("transactions").select("id").eq("source", "sheet_import").limit(1).maybeSingle();
    if (imported) {
      const r2 = await m.from("transactions").update({ description: "hack" }).eq("id", imported.id).select("id");
      expect(r2.data).toEqual([]);
    }
  });

  it("cannot delete, even own transactions", async () => {
    const r = await users.member.client.from("transactions").delete().eq("id", ownId).select("id");
    expect(r.data).toEqual([]);
    const still = await service.from("transactions").select("id").eq("id", ownId).maybeSingle();
    expect(still.data).not.toBeNull();
  });

  it("cannot escalate own role or change others' profiles", async () => {
    const m = users.member.client;
    const r = await m.from("profiles").update({ role: "admin" }).eq("id", users.member.id);
    expect(r.error).not.toBeNull();
    const r2 = await m.from("profiles").update({ full_name: "renamed" }).eq("id", users.member2.id).select("id");
    expect(r2.data).toEqual([]);
    const ok = await m.from("profiles").update({ full_name: "My new name" }).eq("id", users.member.id).select("full_name").single();
    expect(ok.data?.full_name).toBe("My new name");
  });

  it("can add people but not edit them; cannot manage categories", async () => {
    const m = users.member.client;
    const add = await m.from("people").insert({ name: `IT Person ${stamp}`, created_by: users.member.id }).select("id").single();
    expect(add.error).toBeNull();
    const dup = await m.from("people").insert({ name: `  it person ${stamp} `, created_by: users.member.id });
    expect(dup.error).not.toBeNull(); // case/space-insensitive unique
    const upd = await m.from("people").update({ is_active: false }).eq("id", add.data!.id).select("id");
    expect(upd.data).toEqual([]);
    const cat = await m.from("categories").insert({ name: `IT Cat ${stamp}` });
    expect(cat.error).not.toBeNull();
  });

  it("uploads receipts only to transactions it may edit", async () => {
    const m = users.member.client;
    const file = new Blob([new Uint8Array([0x25, 0x50, 0x44, 0x46])], { type: "application/pdf" });
    const ok = await m.storage.from("receipts").upload(`${ownId}/it-${stamp}.pdf`, file, { contentType: "application/pdf" });
    expect(ok.error).toBeNull();
    const denied = await m.storage.from("receipts").upload(`${otherId}/it-${stamp}.pdf`, file, { contentType: "application/pdf" });
    expect(denied.error).not.toBeNull();
    const badFolder = await m.storage.from("receipts").upload(`not-a-uuid/it-${stamp}.pdf`, file, { contentType: "application/pdf" });
    expect(badFolder.error).not.toBeNull();
    const exe = await m.storage.from("receipts").upload(`${ownId}/x-${stamp}.exe`, new Blob(["MZ"]), { contentType: "application/x-msdownload" });
    expect(exe.error).not.toBeNull();

    const att = await m
      .from("attachments")
      .insert({ transaction_id: ownId, storage_path: `${ownId}/it-${stamp}.pdf`, file_name: "r.pdf", uploaded_by: users.member.id })
      .select("id")
      .single();
    expect(att.error).toBeNull();
    const att2 = await m
      .from("attachments")
      .insert({ transaction_id: otherId, storage_path: `${otherId}/zz.pdf`, file_name: "r.pdf", uploaded_by: users.member.id });
    expect(att2.error).not.toBeNull();
    // Signed URL works for an active user
    const signed = await users.member2.client.storage.from("receipts").createSignedUrl(`${ownId}/it-${stamp}.pdf`, 60);
    expect(signed.error).toBeNull();
    await service.storage.from("receipts").remove([`${ownId}/it-${stamp}.pdf`]);
  });

  it("cannot call the import RPC", async () => {
    const { error } = await users.member.client.rpc("import_transactions", { p_source: "sheet_import", p_rows: [] });
    expect(error).not.toBeNull();
  });
});

describe("admin permissions", () => {
  it("edits and deletes any transaction", async () => {
    const { data: t } = await users.member2.client.from("transactions").insert(newTxn(users.member2.id)).select("id").single();
    const a = users.admin.client;
    const upd = await a.from("transactions").update({ description: "by admin" }).eq("id", t!.id).select("description").single();
    expect(upd.data?.description).toBe("by admin");
    const del = await a.from("transactions").delete().eq("id", t!.id).select("id");
    expect(del.data).toHaveLength(1);
  });

  it("manages roles and activation, but the last admin cannot be removed", async () => {
    const a = users.admin.client;
    const r = await a.from("profiles").update({ role: "admin" }).eq("id", users.member2.id).select("role").single();
    expect(r.data?.role).toBe("admin");
    const back = await a.from("profiles").update({ role: "member" }).eq("id", users.member2.id).select("role").single();
    expect(back.data?.role).toBe("member");

    // Temporarily make this the only active admin, then try to demote it.
    const { data: others } = await service.from("profiles").select("id").eq("role", "admin").eq("is_active", true).neq("id", users.admin.id);
    const ids = (others ?? []).map((o) => o.id);
    if (ids.length) await service.from("profiles").update({ is_active: false }).in("id", ids);
    try {
      const self = await a.from("profiles").update({ role: "member" }).eq("id", users.admin.id);
      expect(self.error?.message).toMatch(/At least one active admin/);
    } finally {
      if (ids.length) await service.from("profiles").update({ is_active: true }).in("id", ids);
    }
  });

  it("manages categories", async () => {
    const a = users.admin.client;
    const ins = await a.from("categories").insert({ name: `IT Cat ${stamp}` }).select("id").single();
    expect(ins.error).toBeNull();
    const del = await a.from("categories").delete().eq("id", ins.data!.id).select("id");
    expect(del.data).toHaveLength(1);
  });
});

describe("financial reporting functions", () => {
  it("returns exact decimal totals (no float error)", async () => {
    const m = users.member.client;
    await service.from("transactions").delete().eq("txn_date", TEST_DATE);
    for (const amount of ["0.10", "0.20", "1000000.05"]) {
      const { error } = await m.from("transactions").insert(newTxn(users.member.id, { type: "in", amount }));
      expect(error).toBeNull();
    }
    await m.from("transactions").insert(newTxn(users.member.id, { type: "out", amount: "0.30" }));
    const { data } = await m.rpc("report_totals", { p_from: TEST_DATE, p_to: TEST_DATE }).single();
    expect(data).toMatchObject({ total_in: "1000000.35", total_out: "0.30", balance: "1000000.05", txn_count: 4 });
  });

  it("imported history reconciles with the spreadsheet (if imported)", async () => {
    const { count } = await service.from("transactions").select("id", { count: "exact", head: true }).eq("source", "sheet_import");
    if (!count) return;
    const { data } = await users.member.client.rpc("report_totals", { p_from: null, p_to: "2098-12-31" }).single();
    // Only imported data exists before 2099 in a fresh local stack.
    expect(data).toMatchObject({ total_in: "296500.00", total_out: "292500.00", balance: "4000.00" });
  });

  it("category and period breakdowns add up to the totals", async () => {
    const c = users.member.client;
    const { data: totals } = await c.rpc("report_totals", { p_from: null, p_to: null }).single();
    const { data: cats } = await c.rpc("report_by_category", { p_from: null, p_to: null, p_type: "out" });
    const { data: months } = await c.rpc("report_by_period", { p_from: null, p_to: null, p_grain: "month" });
    const cents = (s: string) => Math.round(Number(s) * 100);
    const sumCats = (cats as { total: string }[]).reduce((a, r) => a + cents(r.total), 0);
    const sumMonthsOut = (months as { total_out: string }[]).reduce((a, r) => a + cents(r.total_out), 0);
    const t = totals as { total_out: string };
    expect(sumCats).toBe(cents(t.total_out));
    expect(sumMonthsOut).toBe(cents(t.total_out));
  });
});

describe("import RPC idempotency (service role)", () => {
  const row = (hash: string) => ({
    source_ref: `test:${stamp}!R1`,
    source_row: 1,
    source_hash: hash,
    source_raw: { date: "1/1/2099" },
    txn_date: "2099-01-02",
    type: "out",
    amount: "12.34",
    description: "rpc test",
    category: "Other",
    category_inferred: true,
    payment_method: "cash",
    paid_by: `IT Person ${stamp} payer`,
    paid_to: null,
    notes: null,
  });

  it("imports once, then skips, flags changes, and detects shifted duplicates", async () => {
    const first = await service.rpc("import_transactions", { p_source: "sheet_import", p_rows: [row("h1")] });
    expect(first.error).toBeNull();
    expect(first.data[0].outcome).toBe("imported");
    const again = await service.rpc("import_transactions", { p_source: "sheet_import", p_rows: [row("h1")] });
    expect(again.data[0].outcome).toBe("already_imported");
    const changed = await service.rpc("import_transactions", { p_source: "sheet_import", p_rows: [row("h2")] });
    expect(changed.data[0].outcome).toBe("changed_in_source");
    const shifted = await service.rpc("import_transactions", {
      p_source: "sheet_import",
      p_rows: [{ ...row("h1"), source_ref: `test:${stamp}!R2` }],
    });
    expect(shifted.data[0].outcome).toBe("duplicate_content");
    const { count } = await service.from("transactions").select("id", { count: "exact", head: true }).like("source_ref", `test:${stamp}%`);
    expect(count).toBe(1);
  });

  it("is atomic: an invalid row rolls back the whole batch", async () => {
    const good = { ...row("h9"), source_ref: `test:${stamp}!R9` };
    const bad = { ...row("h10"), source_ref: `test:${stamp}!R10`, category: "No Such Category" };
    const res = await service.rpc("import_transactions", { p_source: "sheet_import", p_rows: [good, bad] });
    expect(res.error).not.toBeNull();
    const { data } = await service.from("transactions").select("id").eq("source_ref", `test:${stamp}!R9`);
    expect(data).toEqual([]);
  });
});
