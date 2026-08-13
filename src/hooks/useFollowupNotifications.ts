import { useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const NOTIFIED_KEY = "followup_notified_ids";

function getNotifiedToday(): string[] {
  try {
    const raw = localStorage.getItem(NOTIFIED_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    const today = new Date().toISOString().slice(0, 10);
    if (parsed.date !== today) return [];
    return parsed.ids ?? [];
  } catch { return []; }
}

function markNotified(id: string) {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const current = getNotifiedToday();
    if (!current.includes(id)) {
      localStorage.setItem(NOTIFIED_KEY, JSON.stringify({ date: today, ids: [...current, id] }));
    }
  } catch {}
}

// Status que NÃO devem receber lembretes
const LOST_STATUSES = [
  "convertido","sem_interesse","perdido","ja_comprou","comprou_carro",
  "nao_quer_mais","numero_bloqueado","numero_errado","ignorado","quer_casa",
];

export function useFollowupNotifications(userId: string | undefined) {
  const checkFollowups = useCallback(async () => {
    if (!userId) return;

    const now = new Date();
    const soon = new Date(now.getTime() + 30 * 60 * 1000);
    const todayStart = new Date(); todayStart.setHours(0,0,0,0);
    const todayEnd = new Date(); todayEnd.setHours(23,59,59,999);

    // Check visits scheduled for today (notify at start of day)
    const isStartOfDay = now.getHours() < 9 || (now.getHours() === 9 && now.getMinutes() < 5);
    if (isStartOfDay) {
      const { data: todayVisits } = await supabase
        .from("leads")
        .select("id,nome,proximo_followup,status")
        .in("status", ["visita_agendada","visita_confirmada","agendado"])
        .gte("proximo_followup", todayStart.toISOString())
        .lte("proximo_followup", todayEnd.toISOString());

      if (todayVisits && todayVisits.length > 0) {
        toast(`📅 ${todayVisits.length} visita${todayVisits.length > 1 ? "s" : ""} agendada${todayVisits.length > 1 ? "s" : ""} para hoje!`, {
          description: todayVisits.map((v: any) => {
            const firstName = v.nome?.split(" ")[0]?.replace(/^[^a-zA-ZÀ-ÿ]+/, "") ?? v.nome;
            const time = v.proximo_followup ? new Date(v.proximo_followup).toLocaleTimeString("pt-BR", { hour:"2-digit", minute:"2-digit" }) : "";
            return `${firstName}${time ? ` às ${time}` : ""}`;
          }).join(", "),
          duration: 15000,
          action: { label: "Ver visitas", onClick: () => window.location.href = "/visitas" },
        });
      }
    }

    const { data } = await supabase
      .from("leads")
      .select("id,nome,proximo_followup,status")
      .gte("proximo_followup", now.toISOString())
      .lte("proximo_followup", soon.toISOString());

    if (!data || data.length === 0) return;

    const notifiedIds = getNotifiedToday();

    data
      .filter((lead: any) => !LOST_STATUSES.includes(lead.status))
      .forEach((lead: any) => {
        if (notifiedIds.includes(lead.id)) return;

        const followupTime = new Date(lead.proximo_followup);
        const minutesLeft = Math.round((followupTime.getTime() - now.getTime()) / 60000);
        const firstName = lead.nome.split(" ")[0];
        const timeStr = followupTime.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

        toast(`⏰ Follow-up: ${firstName}`, {
          description: minutesLeft <= 5
            ? `Agora! ${timeStr} — ligue agora para ${firstName}`
            : `Em ${minutesLeft} minutos (${timeStr}) — prepare-se para ligar`,
          duration: 10000,
          action: {
            label: "Discar agora",
            onClick: () => window.location.href = `/dialer?lead=${lead.id}`,
          },
        });

        if ("Notification" in window && Notification.permission === "granted") {
          new Notification(`⏰ Follow-up: ${firstName}`, {
            body: minutesLeft <= 5
              ? `Hora de ligar para ${firstName}!`
              : `Ligue para ${firstName} em ${minutesLeft} minutos`,
            icon: "/favicon.ico",
            tag: `followup-${lead.id}`,
          });
        }

        markNotified(lead.id);
      });
  }, [userId]);

  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  useEffect(() => {
    if (!userId) return;
    checkFollowups();
    const interval = setInterval(checkFollowups, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [userId, checkFollowups]);
}