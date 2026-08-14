import { useEffect, useState } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

// UUID nulo válido para visitante — evita erro 400 nas queries do Supabase
const VISITOR_ID = "00000000-0000-0000-0000-000000000000";

const VISITOR_USER = {
  id: VISITOR_ID,
  email: "visitante@renatajoias.com",
  app_metadata: {}, user_metadata: {}, aud: "authenticated",
  created_at: new Date().toISOString(),
} as unknown as User;

const VISITOR_SESSION = { user: VISITOR_USER } as unknown as Session;

function isVisitorMode() {
  try { return localStorage.getItem("renatajoias_visitor") === "true"; }
  catch { return false; }
}

export function useAuth() {
  const visitor = isVisitorMode();

  const [session, setSession] = useState<Session | null>(visitor ? VISITOR_SESSION : null);
  const [user, setUser]       = useState<User | null>(visitor ? VISITOR_USER : null);
  const [loading, setLoading] = useState(!visitor);

  useEffect(() => {
    if (visitor) return;

    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      setUser(s?.user ?? null);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  return { session, user, loading, isVisitor: visitor };
}