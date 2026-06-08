import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";

export type AppRole = "admin" | "staff" | "client";

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (cancelled) return;
      setUser(session?.user ?? null);
      if (session?.user) {
        setTimeout(async () => {
          const { data } = await supabase.from("user_roles").select("role").eq("user_id", session.user.id);
          if (!cancelled) setRoles((data ?? []).map((r) => r.role as AppRole));
        }, 0);
      } else {
        setRoles([]);
      }
      setLoading(false);
    });
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (cancelled) return;
      setUser(session?.user ?? null);
      if (session?.user) {
        const { data } = await supabase.from("user_roles").select("role").eq("user_id", session.user.id);
        if (!cancelled) setRoles((data ?? []).map((r) => r.role as AppRole));
      }
      setLoading(false);
    }).catch(() => { if (!cancelled) setLoading(false); });
    // Safety: if the gotrue lock hangs, don't trap the UI on "Loading…" forever.
    const safety = setTimeout(() => { if (!cancelled) setLoading(false); }, 4000);
    return () => { cancelled = true; clearTimeout(safety); sub.subscription.unsubscribe(); };
  }, []);

  return { user, roles, loading, isStaff: roles.includes("admin") || roles.includes("staff"), isAdmin: roles.includes("admin") };
}