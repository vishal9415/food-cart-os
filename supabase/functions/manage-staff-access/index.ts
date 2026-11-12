import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function response(body: unknown, status = 200) {
  return Response.json(body, { status, headers: corsHeaders });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return response({ error: "Method not allowed" }, 405);

  try {
    const url = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const authorization = req.headers.get("Authorization") || "";
    const token = authorization.replace(/^Bearer\s+/i, "");
    if (!url || !serviceRoleKey) return response({ error: "Access service is not configured" }, 503);
    if (!token || token === authorization) return response({ error: "Sign in required" }, 401);

    const admin = createClient(url, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: authData, error: authError } = await admin.auth.getUser(token);
    const actor = authData?.user;
    if (authError || !actor) return response({ error: "Your session is invalid. Sign in again." }, 401);
    if (actor.app_metadata?.role !== "admin") return response({ error: "Only an admin can manage staff access." }, 403);

    const body = await req.json();
    const action = body?.action;

    if (action === "list") {
      const users: Array<Record<string, unknown>> = [];
      for (let page = 1; page <= 20; page++) {
        const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 100 });
        if (error) throw error;
        for (const user of data.users) {
          users.push({
            id: user.id,
            email: user.email ?? "",
            role: user.app_metadata?.role ?? "customer",
            created_at: user.created_at,
            last_sign_in_at: user.last_sign_in_at ?? null,
          });
        }
        if (data.users.length < 100) break;
      }
      return response({ users });
    }

    if (action === "invite") {
      const email = String(body?.email ?? "").trim().toLowerCase();
      const role = String(body?.role ?? "");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return response({ error: "Enter a valid email address." }, 400);
      if (!["operator", "admin"].includes(role)) return response({ error: "Choose Operator or Admin." }, 400);
      const { data, error } = await admin.auth.admin.inviteUserByEmail(email);
      if (error) return response({ error: error.message }, 400);
      const { error: roleError } = await admin.auth.admin.updateUserById(data.user.id, {
        app_metadata: { ...(data.user.app_metadata ?? {}), role },
      });
      if (roleError) {
        await admin.auth.admin.deleteUser(data.user.id);
        return response({ error: "Invitation was rolled back because the role could not be assigned." }, 500);
      }
      return response({ invited: true, email, role });
    }

    if (action === "set_role") {
      const userId = String(body?.user_id ?? "");
      const role = String(body?.role ?? "");
      if (!userId || !["operator", "admin", "customer"].includes(role)) return response({ error: "Invalid user or role." }, 400);
      if (userId === actor.id) return response({ error: "You cannot change your own role." }, 400);
      const { data: targetData, error: targetError } = await admin.auth.admin.getUserById(userId);
      if (targetError || !targetData.user) return response({ error: "Staff account not found." }, 404);
      const currentRole = targetData.user.app_metadata?.role ?? "customer";
      if (currentRole === "admin" && role !== "admin") {
        const { data: all, error: listError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
        if (listError) throw listError;
        const adminCount = all.users.filter((u) => u.app_metadata?.role === "admin").length;
        if (adminCount <= 1) return response({ error: "The last admin account cannot be demoted." }, 409);
      }
      const { error } = await admin.auth.admin.updateUserById(userId, {
        app_metadata: { ...(targetData.user.app_metadata ?? {}), role },
      });
      if (error) return response({ error: error.message }, 400);
      return response({ updated: true, role });
    }

    return response({ error: "Unknown action." }, 400);
  } catch (error) {
    return response({ error: error instanceof Error ? error.message : "Unexpected access-management error." }, 500);
  }
});
