import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { loadProfile } from "@/lib/profile";
import {
  formatPhone, formatCurrency,
  LEAD_FUNNEL_COLUMNS, LEAD_STATUS_LOST, LEAD_STATUS_LABELS, getLeadFunnelColumn,
  MENSAGEM_STATUS_CONTATO_LABELS, MENSAGEM_STATUS_CONTATO_COLOR, MENSAGEM_STATUS_CONTATO_EMOJI,
  type MensagemStatusContato,
} from "@/lib/crm";
import {
  MessageCircle, CalendarDays, ChevronRight,
  Zap, AlertTriangle, CheckCircle2, TrendingUp, Bell,
  RefreshCw, Target, ShoppingBag, History, Gem, Kanban,
} from "lucide-react";

// ── Tipos ─────────────────────────────────────────────────────────────────────
type Lead = {
  id: string; nome: string; telefone: string; status: string;
  proximo_followup: string | null; observacoes: string | null;
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function greeting(nome: string) {
  const h = new Date().getHours();
  const first = cleanName(nome);
  if (h < 12) return { texto: `Bom dia, ${first}!`, emoji: "☀️" };
  if (h < 18) return { texto: `Boa tarde, ${first}!`, emoji: "🌤️" };
  return { texto: `Boa noite, ${first}!`, emoji: "🌙" };
}

function cleanName(nome: string): string {
  const parts = (nome ?? "").trim().split(/\s+/);
  for (const p of parts) {
    const c = p.replace(/^[^a-zA-ZÀ-ÿ]+/, "").trim();
    if (c.length >= 2) return c;
  }
  return parts[0] ?? nome;
}

function fmtTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function isFimDeSemana(): boolean {
  const d = new Date().getDay(); // 0 = domingo, 6 = sábado
  return d === 0 || d === 6;
}

// ── Componente ────────────────────────────────────────────────────────────────
export default function Home() {
  const { user }   = useAuth();
  const navigate   = useNavigate();
  const profile    = loadProfile();
  const { texto, emoji } = greeting(profile.nome);

  const [loading, setLoading]     = useState(true);
  const [msgStats, setMsgStats]   = useState({ enviadas: 0, respondidas: 0, taxaResposta: 0 });
  const [vendas, setVendas]       = useState({ qtd: 0, valor: 0 });
  const [funil, setFunil]         = useState<Record<string, number>>({});
  const [followupsHoje, setFollowupsHoje]     = useState<Lead[]>([]);
  const [proximosFollowups, setProximosFollowups] = useState<Lead[]>([]);
  const [vencidos, setVencidos]   = useState<Lead[]>([]);
  const [semRetorno, setSemRetorno] = useState<(Lead & { statusContato: MensagemStatusContato })[]>([]);
  const fds = isFimDeSemana();

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    const hoje    = new Date(); hoje.setHours(0,0,0,0);
    const fimHoje = new Date(); fimHoje.setHours(23,59,59,999);
    const em14dias = new Date(Date.now() + 14 * 86400000);

    const [
      { data: msgHojeData },
      { data: comprasHojeData },
      { data: followupsData },
      { data: proximosData },
      { data: vencidosData },
      { data: msgTodasData },
    ] = await Promise.all([
      // Mensagens enviadas por mim hoje
      supabase.from("mensagens")
        .select("status_contato")
        .eq("atendente_id", user.id)
        .gte("enviada_em", hoje.toISOString()),

      // Vendas de hoje (todo o time)
      supabase.from("compras")
        .select("valor")
        .gte("data_compra", hoje.toISOString())
        .lte("data_compra", fimHoje.toISOString()),

      // Follow-ups de hoje
      supabase.from("leads")
        .select("id,nome,telefone,status,proximo_followup,observacoes")
        .not("status", "in", `(${LEAD_STATUS_LOST.join(",")})`)
        .gte("proximo_followup", hoje.toISOString())
        .lte("proximo_followup", fimHoje.toISOString())
        .order("proximo_followup", { ascending: true })
        .limit(8),

      // Próximos follow-ups (até 14 dias)
      supabase.from("leads")
        .select("id,nome,telefone,status,proximo_followup,observacoes")
        .not("status", "in", `(${LEAD_STATUS_LOST.join(",")})`)
        .gt("proximo_followup", fimHoje.toISOString())
        .lte("proximo_followup", em14dias.toISOString())
        .order("proximo_followup", { ascending: true })
        .limit(10),

      // Follow-ups vencidos
      supabase.from("leads")
        .select("id,nome,telefone,status,proximo_followup,observacoes")
        .not("status", "in", `(${LEAD_STATUS_LOST.join(",")})`)
        .lt("proximo_followup", hoje.toISOString())
        .not("proximo_followup", "is", null)
        .order("proximo_followup", { ascending: true })
        .limit(5),

      // Última mensagem de cada lead — pra achar quem ficou sem retorno
      supabase.from("mensagens")
        .select("lead_id,status_contato,enviada_em")
        .order("enviada_em", { ascending: false }),
    ]);

    const msgsHoje = msgHojeData ?? [];
    const respondidas = msgsHoje.filter((m: any) => m.status_contato === "respondida").length;
    setMsgStats({
      enviadas: msgsHoje.length,
      respondidas,
      taxaResposta: msgsHoje.length ? Math.round((respondidas / msgsHoje.length) * 100) : 0,
    });

    const compras = comprasHojeData ?? [];
    setVendas({ qtd: compras.length, valor: compras.reduce((a: number, c: any) => a + c.valor, 0) });

    setFollowupsHoje((followupsData ?? []) as Lead[]);
    setProximosFollowups((proximosData ?? []) as Lead[]);
    setVencidos((vencidosData ?? []) as Lead[]);

    // ── Leads sem retorno (última mensagem marcada como "sem_retorno") ──────
    const lastByLead = new Map<string, MensagemStatusContato>();
    for (const m of (msgTodasData ?? []) as { lead_id: string; status_contato: MensagemStatusContato }[]) {
      if (!lastByLead.has(m.lead_id)) lastByLead.set(m.lead_id, m.status_contato);
    }
    const semRetornoIds = Array.from(lastByLead.entries()).filter(([, s]) => s === "sem_retorno").map(([id]) => id).slice(0, 5);
    if (semRetornoIds.length > 0) {
      const { data: leadsSemRetorno } = await supabase.from("leads")
        .select("id,nome,telefone,status,proximo_followup,observacoes")
        .in("id", semRetornoIds);
      setSemRetorno(((leadsSemRetorno ?? []) as Lead[]).map(l => ({ ...l, statusContato: "sem_retorno" as MensagemStatusContato })));
    } else {
      setSemRetorno([]);
    }

    // ── Distribuição por etapa do funil (contagem direta, todos os leads) ──
    const fetchAllStatuses = async () => {
      let all: string[] = [];
      let from = 0;
      const size = 1000;
      while (true) {
        const { data, error } = await supabase.from("leads").select("status").range(from, from + size - 1);
        if (error || !data || data.length === 0) break;
        all = [...all, ...data.map((r: any) => r.status as string)];
        if (data.length < size) break;
        from += size;
      }
      return all;
    };
    const statuses = await fetchAllStatuses();
    const map: Record<string, number> = {};
    for (const s of statuses) {
      const col = getLeadFunnelColumn(s);
      if (!col || col.key === "perdido") continue;
      map[col.key] = (map[col.key] ?? 0) + 1;
    }
    setFunil(map);

    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const metaMsg = profile.metaLigacoes ?? 80;
  const pctMsg  = Math.min(100, Math.round((msgStats.enviadas / metaMsg) * 100));
  const urgentes = vencidos.length + semRetorno.length;

  if (loading) return (
    <div className="p-6 max-w-5xl mx-auto space-y-4">
      {[1,2,3,4].map(i => <div key={i} className="h-24 bg-muted animate-pulse rounded-2xl"/>)}
    </div>
  );

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">

      {/* ── Saudação + CTA principal ──────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-display font-bold text-3xl flex items-center gap-3">
            <span className="text-4xl">{emoji}</span>
            {texto}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}
            {" · Pedro da Renata Perfumes"}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => navigate("/dialer")}
            className="flex items-center gap-2 px-5 py-3 rounded-xl bg-primary text-primary-foreground font-bold hover:bg-primary/90 transition-colors shadow-md text-sm">
            <Zap className="h-4 w-4"/> Enviar mensagens
          </button>
          <button onClick={load}
            className="flex items-center gap-2 px-4 py-3 rounded-xl border bg-background hover:bg-muted transition-colors text-sm">
            <RefreshCw className="h-4 w-4"/>
          </button>
        </div>
      </div>

      {/* ── Banner fim de semana ─────────────────────────────────────────── */}
      {fds && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-blue-50 border border-blue-200">
          <span className="text-xl shrink-0">🏖️</span>
          <div>
            <p className="font-bold text-blue-800 text-sm">
              {new Date().getDay() === 6 ? "Sábado" : "Domingo"} — dia de descanso
            </p>
            <p className="text-xs text-blue-700 mt-0.5">
              Se precisar, aproveite o dia pra planejar os próximos envios e promoções no Calendário.
            </p>
          </div>
        </div>
      )}

      {/* ── Alertas urgentes ──────────────────────────────────────────────── */}
      {urgentes > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {vencidos.length > 0 && (
            <button onClick={() => navigate("/dialer")}
              className="flex items-start gap-3 p-4 rounded-xl bg-rose-50 border border-rose-200 hover:bg-rose-100 transition-colors text-left w-full">
              <Bell className="h-5 w-5 text-rose-600 shrink-0 mt-0.5"/>
              <div>
                <div className="font-bold text-rose-800 text-sm">{vencidos.length} follow-up{vencidos.length > 1 ? "s" : ""} vencido{vencidos.length > 1 ? "s" : ""}</div>
                <div className="text-xs text-rose-700 mt-0.5">
                  {vencidos.slice(0,2).map(l => cleanName(l.nome)).join(", ")}
                  {vencidos.length > 2 ? ` +${vencidos.length - 2}` : ""}
                  {" · Clique para enviar mensagem"}
                </div>
              </div>
            </button>
          )}
          {semRetorno.length > 0 && (
            <button onClick={() => navigate("/relacionamento")}
              className="flex items-start gap-3 p-4 rounded-xl bg-amber-50 border border-amber-200 hover:bg-amber-100 transition-colors text-left w-full">
              <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5"/>
              <div>
                <div className="font-bold text-amber-800 text-sm">{semRetorno.length} lead{semRetorno.length > 1 ? "s" : ""} sem retorno</div>
                <div className="text-xs text-amber-700 mt-0.5">
                  {semRetorno.slice(0,2).map(l => cleanName(l.nome)).join(", ")}
                  {semRetorno.length > 2 ? ` +${semRetorno.length - 2}` : ""}
                  {" · Ver relacionamento"}
                </div>
              </div>
            </button>
          )}
        </div>
      )}

      {/* ── Placar do dia ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          {
            icon: <MessageCircle className="h-5 w-5"/>,
            label: "Mensagens hoje", value: msgStats.enviadas,
            meta: metaMsg, pct: pctMsg,
            color: "text-blue-600", bg: "bg-blue-50", bar: "bg-blue-500",
          },
          {
            icon: <CheckCircle2 className="h-5 w-5"/>,
            label: "Respondidas hoje", value: msgStats.respondidas,
            meta: null, pct: null,
            color: "text-emerald-600", bg: "bg-emerald-50", bar: "",
          },
          {
            icon: <TrendingUp className="h-5 w-5"/>,
            label: "Taxa de resposta", value: `${msgStats.taxaResposta}%`,
            meta: null, pct: null,
            color: "text-violet-600", bg: "bg-violet-50", bar: "",
          },
          {
            icon: <ShoppingBag className="h-5 w-5"/>,
            label: "Vendas hoje", value: vendas.qtd > 0 ? formatCurrency(vendas.valor) : "—",
            meta: null, pct: null,
            color: "text-amber-600", bg: "bg-amber-50", bar: "",
          },
        ].map(k => (
          <Card key={k.label} className="shadow-card">
            <CardContent className="p-4">
              <div className={`inline-flex h-8 w-8 rounded-lg items-center justify-center mb-2 ${k.bg} ${k.color}`}>
                {k.icon}
              </div>
              <div className="font-display font-bold text-2xl tabular-nums">{k.value}</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">{k.label}</div>
              {k.meta && k.pct !== null && (
                <div className="mt-2">
                  <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                    <span>Meta: {k.meta}</span>
                    <span className={k.pct >= 100 ? "text-emerald-600 font-bold" : ""}>{k.pct}%</span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${k.bar}`}
                      style={{ width: `${k.pct}%` }} />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Funil resumido ────────────────────────────────────────────────── */}
      <Card className="shadow-card">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="font-semibold text-sm flex items-center gap-2">
              <Target className="h-4 w-4 text-muted-foreground"/> Funil atual
            </div>
            <button onClick={() => navigate("/crm")}
              className="text-xs text-primary hover:underline flex items-center gap-1">
              Ver Kanban <ChevronRight className="h-3 w-3"/>
            </button>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-1.5">
            {LEAD_FUNNEL_COLUMNS.map(col => (
              <button key={col.key} onClick={() => navigate("/crm")}
                className="flex flex-col items-center gap-1 p-2 rounded-xl hover:bg-muted transition-colors"
                style={{ backgroundColor: (funil[col.key] ?? 0) > 0 ? col.light : undefined }}>
                <span className="text-base">{col.emoji}</span>
                <span className="font-black text-lg tabular-nums leading-none"
                  style={{ color: (funil[col.key] ?? 0) > 0 ? col.color : "#94a3b8" }}>
                  {funil[col.key] ?? 0}
                </span>
                <span className="text-[9px] text-muted-foreground text-center leading-tight">{col.label}</span>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* ── Sem retorno ───────────────────────────────────────────────── */}
        <Card className="shadow-card">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="font-semibold text-sm flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600"/>
                Sem retorno
                <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
                  {semRetorno.length}
                </span>
              </div>
              <button onClick={() => navigate("/relacionamento")}
                className="text-xs text-primary hover:underline flex items-center gap-1">
                Ver todos <ChevronRight className="h-3 w-3"/>
              </button>
            </div>

            {semRetorno.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                <CheckCircle2 className="h-8 w-8 mx-auto mb-2 opacity-30"/>
                Ninguém marcado como "sem retorno" no momento
              </div>
            ) : (
              <div className="space-y-2">
                {semRetorno.map(lead => (
                  <div key={lead.id} className="flex items-center gap-3 p-3 rounded-xl border border-transparent bg-muted/30 hover:bg-muted/50 transition-colors">
                    <div className={`h-8 w-8 rounded-full flex items-center justify-center text-xs shrink-0 ${MENSAGEM_STATUS_CONTATO_COLOR.sem_retorno}`}>
                      {MENSAGEM_STATUS_CONTATO_EMOJI.sem_retorno}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate">{lead.nome}</p>
                      <p className="text-xs text-muted-foreground">{formatPhone(lead.telefone)}</p>
                    </div>
                    <button onClick={() => navigate(`/dialer?lead=${lead.id}`)}
                      className="h-8 w-8 rounded-lg flex items-center justify-center bg-background border hover:bg-muted transition-colors shrink-0">
                      <MessageCircle className="h-3.5 w-3.5 text-muted-foreground"/>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Follow-ups de hoje ───────────────────────────────────────── */}
        <Card className="shadow-card">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="font-semibold text-sm flex items-center gap-2">
                <Bell className="h-4 w-4 text-amber-600"/>
                Follow-ups de hoje
                <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
                  {followupsHoje.length}
                </span>
              </div>
              <button onClick={() => navigate("/dialer")}
                className="text-xs text-primary hover:underline flex items-center gap-1">
                Enviar <ChevronRight className="h-3 w-3"/>
              </button>
            </div>

            {followupsHoje.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                <CheckCircle2 className="h-8 w-8 mx-auto mb-2 opacity-30"/>
                Nenhum follow-up pendente para hoje
              </div>
            ) : (
              <div className="space-y-2">
                {followupsHoje.map(lead => {
                  const col = getLeadFunnelColumn(lead.status);
                  const passou = lead.proximo_followup && new Date(lead.proximo_followup) < new Date();
                  return (
                    <div key={lead.id}
                      className="flex items-center gap-3 p-3 rounded-xl border border-transparent bg-muted/30 hover:bg-muted/50 transition-colors">
                      {col && (
                        <div className="h-8 w-8 rounded-full flex items-center justify-center text-sm shrink-0"
                          style={{ backgroundColor: col.light }}>
                          {col.emoji}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm truncate">{lead.nome}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {LEAD_STATUS_LABELS[lead.status as keyof typeof LEAD_STATUS_LABELS] ?? lead.status}
                          {lead.observacoes ? ` · ${lead.observacoes.slice(0, 30)}…` : ""}
                        </p>
                      </div>
                      {lead.proximo_followup && (
                        <div className={`text-xs font-bold tabular-nums shrink-0 ${passou ? "text-rose-600" : "text-amber-600"}`}>
                          {fmtTime(lead.proximo_followup)}
                        </div>
                      )}
                      <button onClick={() => navigate(`/dialer?lead=${lead.id}`)}
                        className="h-8 w-8 rounded-lg flex items-center justify-center bg-background border hover:bg-muted transition-colors shrink-0">
                        <MessageCircle className="h-3.5 w-3.5 text-muted-foreground"/>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

      </div>

      {/* ── Próximos follow-ups ─────────────────────────────────────────────── */}
      {proximosFollowups.length > 0 && (
        <Card className="shadow-card">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="font-semibold text-sm flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-violet-600"/>
                Próximos follow-ups
                <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700">
                  {proximosFollowups.length}
                </span>
              </div>
              <button onClick={() => navigate("/leads")}
                className="text-xs text-primary hover:underline flex items-center gap-1">
                Ver todos <ChevronRight className="h-3 w-3"/>
              </button>
            </div>

            {/* Agrupar por dia */}
            {(() => {
              const grupos: Record<string, Lead[]> = {};
              for (const lead of proximosFollowups) {
                const dia = lead.proximo_followup?.slice(0, 10) ?? "sem-data";
                if (!grupos[dia]) grupos[dia] = [];
                grupos[dia].push(lead);
              }
              return Object.entries(grupos).map(([dia, leadsGrupo]) => {
                const d = new Date(dia + "T12:00:00");
                const isDiaFds = d.getDay() === 0 || d.getDay() === 6;
                return (
                  <div key={dia} className="mb-3 last:mb-0">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                        {d.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "short" })}
                      </span>
                      {isDiaFds && <span className="text-[10px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full font-bold">fim de semana</span>}
                      <span className="text-[10px] text-muted-foreground">{leadsGrupo.length} lead{leadsGrupo.length > 1 ? "s" : ""}</span>
                    </div>
                    <div className="space-y-1.5">
                      {leadsGrupo.map(lead => (
                        <div key={lead.id}
                          className="flex items-center gap-3 p-2.5 rounded-xl bg-muted/30 hover:bg-muted/50 transition-colors">
                          <div className="h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 bg-violet-100 text-violet-700">
                            📅
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-sm truncate">{lead.nome}</p>
                            <p className="text-xs text-muted-foreground">{LEAD_STATUS_LABELS[lead.status as keyof typeof LEAD_STATUS_LABELS] ?? lead.status}</p>
                          </div>
                          {lead.proximo_followup && (
                            <div className="text-right shrink-0">
                              <div className="text-sm font-bold tabular-nums text-violet-600">
                                {fmtTime(lead.proximo_followup)}
                              </div>
                            </div>
                          )}
                          <button onClick={() => navigate(`/dialer?lead=${lead.id}`)}
                            className="h-7 w-7 rounded-lg flex items-center justify-center bg-background border hover:bg-muted transition-colors shrink-0">
                            <MessageCircle className="h-3 w-3 text-muted-foreground"/>
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              });
            })()}
          </CardContent>
        </Card>
      )}

      {/* ── Ações rápidas ─────────────────────────────────────────────────── */}
      <Card className="shadow-card">
        <CardContent className="p-4">
          <p className="text-sm font-semibold mb-3">Ações rápidas</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            {[
              { icon: <Zap className="h-5 w-5"/>,          label: "Mensagens",      sub: "Enviar WhatsApp",        path: "/dialer",         color: "text-primary",     bg: "bg-primary/10"    },
              { icon: <History className="h-5 w-5"/>,      label: "Histórico",      sub: "Mensagens enviadas",     path: "/historico",      color: "text-emerald-600", bg: "bg-emerald-50"    },
              { icon: <Gem className="h-5 w-5"/>,           label: "Relacionamento", sub: "Segmentos e contato",    path: "/relacionamento", color: "text-teal-600",    bg: "bg-teal-50"       },
              { icon: <CalendarDays className="h-5 w-5"/>,  label: "Calendário",     sub: "Promoções e eventos",    path: "/calendario",     color: "text-orange-600",  bg: "bg-orange-50"     },
              { icon: <TrendingUp className="h-5 w-5"/>,    label: "Pipeline",       sub: "Funil de vendas",        path: "/pipeline",       color: "text-violet-600",  bg: "bg-violet-50"     },
              { icon: <Kanban className="h-5 w-5"/>,        label: "CRM",            sub: "Kanban de leads",        path: "/crm",            color: "text-blue-600",    bg: "bg-blue-50"       },
            ].map(a => (
              <button key={a.path} onClick={() => navigate(a.path)}
                className="flex items-center gap-3 p-3 rounded-xl border bg-background hover:bg-muted transition-colors text-left">
                <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${a.bg} ${a.color}`}>
                  {a.icon}
                </div>
                <div className="min-w-0">
                  <div className="font-semibold text-sm">{a.label}</div>
                  <div className="text-[11px] text-muted-foreground truncate">{a.sub}</div>
                </div>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

    </div>
  );
}
