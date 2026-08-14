import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { loadProfile } from "@/lib/profile";
import { formatPhone, FUNNEL_STAGES, FUNNEL_STAGE, STATUS_LABELS } from "@/lib/crm";
import {
  Phone, CalendarDays, Clock, ChevronRight, PhoneCall,
  Zap, AlertTriangle, CheckCircle2, TrendingUp, Bell,
  PhoneMissed, RefreshCw, Target, Trophy,
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

function fmtDateShort(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" });
}

function diffMinutes(iso: string) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
}

function fmtDur(sec: number) {
  const m = Math.floor(sec / 60);
  return m < 60 ? `${m}min` : `${Math.floor(m/60)}h${m%60 > 0 ? `${m%60}min` : ""}`;
}

function isFimDeSemana(): boolean {
  const d = new Date().getDay(); // 0 = domingo, 6 = sábado
  return d === 0 || d === 6;
}

function proximosDias(n: number): { label: string; iso: string }[] {
  const dias = [];
  const hoje = new Date();
  for (let i = 1; i <= 14 && dias.length < n; i++) {
    const d = new Date(hoje);
    d.setDate(hoje.getDate() + i);
    d.setHours(0, 0, 0, 0);
    dias.push({
      label: d.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" }),
      iso: d.toISOString().slice(0, 10),
    });
  }
  return dias;
}

// ── Componente ────────────────────────────────────────────────────────────────
export default function Home() {
  const { user }   = useAuth();
  const navigate   = useNavigate();
  const profile    = loadProfile();
  const { texto, emoji } = greeting(profile.nome);

  const [loading, setLoading]         = useState(true);
  const [calls, setCalls]             = useState({ total: 0, positivos: 0, durSec: 0, visitas: 0 });
  const [visitasHoje, setVisitasHoje]         = useState<Lead[]>([]);
  const [proximasVisitas, setProximasVisitas] = useState<Lead[]>([]);
  const [followupsHoje, setFollowupsHoje]     = useState<Lead[]>([]);
  const [vencidos, setVencidos]       = useState<Lead[]>([]); // followup vencido
  const [faltaram, setFaltaram]       = useState<Lead[]>([]); // visita_faltou + visita_cancelada
  const [semData, setSemData]         = useState<number>(0);  // visita_pendente sem data
  const [posVisita, setPosVisita]     = useState<number>(0);  // F→N aguardando ação
  const [funil, setFunil]             = useState<Record<string, number>>({});
  const fds = isFimDeSemana();

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    const hoje     = new Date(); hoje.setHours(0,0,0,0);
    const fimHoje  = new Date(); fimHoje.setHours(23,59,59,999);
    const agora    = new Date();

    const [
      { data: callsData },
      { data: visitasData },
      { data: proximasData },
      { data: followupsData },
      { data: vencidosData },
      { data: faltaramData },
      { count: semDataCount },
      { count: posVisitaCount },
      { data: funilData },
    ] = await Promise.all([
      // Ligações de hoje
      supabase.from("calls")
        .select("outcome,duracao_segundos")
        .eq("atendente_id", user.id)
        .gte("started_at", hoje.toISOString()),

      // Visitas de hoje (agendadas)
      supabase.from("leads")
        .select("id,nome,telefone,status,proximo_followup,observacoes")
        .in("status", ["visita_agendada","visita_confirmada","visita_remarcada"])
        .gte("proximo_followup", hoje.toISOString())
        .lte("proximo_followup", fimHoje.toISOString())
        .order("proximo_followup", { ascending: true }),

      // Próximas visitas (amanhã em diante, próximos 14 dias)
      supabase.from("leads")
        .select("id,nome,telefone,status,proximo_followup,observacoes")
        .in("status", ["visita_agendada","visita_confirmada","visita_remarcada"])
        .gt("proximo_followup", fimHoje.toISOString())
        .lte("proximo_followup", new Date(Date.now() + 14 * 86400000).toISOString())
        .order("proximo_followup", { ascending: true })
        .limit(10),

      // Follow-ups de hoje — apenas leads de contato, nunca visitas agendadas
      supabase.from("leads")
        .select("id,nome,telefone,status,proximo_followup,observacoes")
        .in("status", ["retornar","respondeu","mensagem_zap","interesse","visita_pendente","nao_atendeu","novo"])
        .gte("proximo_followup", hoje.toISOString())
        .lte("proximo_followup", fimHoje.toISOString())
        .order("proximo_followup", { ascending: true })
        .limit(8),

      // Follow-ups VENCIDOS — só leads de contato (não visitas!)
      supabase.from("leads")
        .select("id,nome,telefone,status,proximo_followup,observacoes")
        .in("status", ["retornar","respondeu","mensagem_zap","nao_atendeu","interesse","visita_pendente","novo"])
        .lt("proximo_followup", hoje.toISOString())
        .not("proximo_followup", "is", null)
        .order("proximo_followup", { ascending: true })
        .limit(5),

      // Não vieram / cancelaram
      supabase.from("leads")
        .select("id,nome,telefone,status,proximo_followup,observacoes")
        .in("status", ["visita_faltou","visita_cancelada"])
        .order("updated_at", { ascending: false })
        .limit(5),

      // Quer visitar mas sem data — count exato
      supabase.from("leads")
        .select("*", { count: "exact", head: true })
        .eq("status", "visita_pendente"),

      // Pós-visita F→N aguardando ação — count exato
      supabase.from("leads")
        .select("*", { count: "exact", head: true })
        .in("status", ["visitou","proposta","envio_documentos","cpf_analisado","credito_aprovado","contrato_gerado","contrato_assinado","boleto_pago","repasse"]),

      // Distribuição do funil — RPC que retorna counts agrupados (sem limite)
      supabase.rpc("get_leads_by_status"),
    ]);

    // Stats de ligações
    const POSITIVOS = new Set(["interesse","visita_pendente","visita_agendada","visita_confirmada","visitou","envio_documentos","cpf_analisado","credito_aprovado","contrato_gerado","contrato_assinado","boleto_pago","repasse","registro","respondeu","mensagem_zap"]);
    const VISITA_OUTCOMES = new Set(["visita_agendada","visita_confirmada","visitou"]);
    const cs = callsData ?? [];
    setCalls({
      total:     cs.length,
      positivos: cs.filter((c: any) => POSITIVOS.has(c.outcome)).length,
      visitas:   cs.filter((c: any) => VISITA_OUTCOMES.has(c.outcome)).length,
      durSec:    cs.reduce((a: number, c: any) => a + (c.duracao_segundos ?? 0), 0),
    });

    setVisitasHoje((visitasData ?? []) as Lead[]);
    setProximasVisitas((proximasData ?? []) as Lead[]);
    setFollowupsHoje((followupsData ?? []) as Lead[]);
    setVencidos((vencidosData ?? []) as Lead[]);
    setFaltaram((faltaramData ?? []) as Lead[]);
    setSemData(semDataCount ?? 0);
    setPosVisita(posVisitaCount ?? 0);

    // ── Funil cumulativo — lógica idêntica ao Pipeline ───────────────────────
    // Cada lead conta 1 em CADA etapa que já passou ou está agora.
    // Lead em G conta em A, B, C, D, E, F, G (mas não em H, I...)
    const LOST_S = ["sem_interesse","nao_quer_mais","perdido","ignorado",
      "numero_errado","numero_bloqueado","ja_comprou","comprou_carro","quer_casa"];

    const STAGE_MAP_H: Record<string, string> = {
      novo:"A", nao_atendeu:"A",
      retornar:"B", respondeu:"B", mensagem_zap:"B",
      interesse:"C",
      visita_pendente:"D", visita:"D",
      visita_agendada:"E", visita_confirmada:"E", visita_faltou:"E",
      visita_cancelada:"E", visita_remarcada:"E", agendado:"E",
      visitou:"F", proposta:"F", convertido:"F",
      envio_documentos:"G", envio_doc:"G", proposta_aceita:"G",
      cpf_analisado:"H", analise_credito:"H",
      credito_aprovado:"I", aprovacao_credito:"I",
      contrato_gerado:"J",
      contrato_assinado:"K", chaves_entregues:"K",
      boleto_pago:"L", repasse:"M", registro:"N",
    };

    const STAGE_ORDER_H = ["A","B","C","D","E","F","G","H","I","J","K","L","M","N"];

    // RPC retorna [{status, count}] de TODOS os leads
    const rpcRows = (funilData ?? []) as { status: string; count: number }[];

    // Mapa status → count
    const statusCount: Record<string, number> = {};
    for (const row of rpcRows) {
      statusCount[row.status] = Number(row.count);
    }

    // Mapa etapa → contagem direta (só quem está naquela etapa agora)
    const stageCount: Record<string, number> = {};
    for (const [status, cnt] of Object.entries(statusCount)) {
      if (LOST_S.includes(status)) continue;
      const stage = STAGE_MAP_H[status] ?? "A";
      stageCount[stage] = (stageCount[stage] ?? 0) + cnt;
    }

    // Calcular cumulativo: etapa X = soma de todos que estão em X ou além
    const map: Record<string, number> = {};
    for (let i = 0; i < STAGE_ORDER_H.length; i++) {
      const key = STAGE_ORDER_H[i];
      // Soma todos os leads que estão nesta etapa ou em etapas posteriores
      map[key] = STAGE_ORDER_H.slice(i)
        .reduce((a, k) => a + (stageCount[k] ?? 0), 0);
    }

    setFunil(map);

    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const metaLig   = profile.metaLigacoes ?? 80;
  const metaVisit = profile.metaVisitas  ?? 3;
  const pctLig    = Math.min(100, Math.round((calls.total / metaLig) * 100));
  const pctVisit  = Math.min(100, Math.round((visitasHoje.length / metaVisit) * 100));
  const urgentes  = vencidos.length + faltaram.length;

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
              Sem ligações hoje. Se precisar, use o dia para confirmar visitas agendadas via WhatsApp.
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
                  {" · Clique para ligar"}
                </div>
              </div>
            </button>
          )}
          {faltaram.length > 0 && (
            <button onClick={() => navigate("/leads")}
              className="flex items-start gap-3 p-4 rounded-xl bg-amber-50 border border-amber-200 hover:bg-amber-100 transition-colors text-left w-full">
              <PhoneMissed className="h-5 w-5 text-amber-600 shrink-0 mt-0.5"/>
              <div>
                <div className="font-bold text-amber-800 text-sm">{faltaram.length} precisam de retorno</div>
                <div className="text-xs text-amber-700 mt-0.5">
                  {faltaram.slice(0,2).map(l => cleanName(l.nome)).join(", ")}
                  {faltaram.length > 2 ? ` +${faltaram.length - 2}` : ""}
                  {" · Ver leads"}
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
            icon: <Phone className="h-5 w-5"/>,
            label: "Ligações hoje", value: calls.total,
            meta: metaLig, pct: pctLig,
            color: "text-blue-600", bg: "bg-blue-50", bar: "bg-blue-500",
          },
          {
            icon: <CalendarDays className="h-5 w-5"/>,
            label: "Visitas hoje", value: visitasHoje.length,
            meta: metaVisit, pct: pctVisit,
            color: "text-emerald-600", bg: "bg-emerald-50", bar: "bg-emerald-500",
          },
          {
            icon: <TrendingUp className="h-5 w-5"/>,
            label: "Resultados positivos", value: calls.positivos,
            meta: null, pct: null,
            color: "text-violet-600", bg: "bg-violet-50", bar: "",
          },
          {
            icon: <Clock className="h-5 w-5"/>,
            label: "Tempo em call", value: calls.durSec > 0 ? fmtDur(calls.durSec) : "—",
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

      {/* ── Funil resumido A→N ────────────────────────────────────────────── */}
      <Card className="shadow-card">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="font-semibold text-sm flex items-center gap-2">
              <Target className="h-4 w-4 text-muted-foreground"/> Funil atual
            </div>
            <button onClick={() => navigate("/pipeline")}
              className="text-xs text-primary hover:underline flex items-center gap-1">
              Ver pipeline <ChevronRight className="h-3 w-3"/>
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1.5">
            {FUNNEL_STAGES.filter(s => ["A","B","C","D","E","F","G"].includes(s.key)).map(stage => (
              <button key={stage.key} onClick={() => navigate("/crm")}
                className="flex flex-col items-center gap-1 p-2 rounded-xl hover:bg-muted transition-colors"
                style={{ backgroundColor: (funil[stage.key] ?? 0) > 0 ? stage.light : undefined }}>
                <span className="text-base">{stage.emoji}</span>
                <span className="font-black text-lg tabular-nums leading-none"
                  style={{ color: (funil[stage.key] ?? 0) > 0 ? stage.color : "#94a3b8" }}>
                  {funil[stage.key] ?? 0}
                </span>
                <span className="text-[9px] font-bold" style={{ color: stage.color }}>{stage.key}</span>
                <span className="text-[9px] text-muted-foreground text-center leading-tight hidden sm:block">{stage.label}</span>
              </button>
            ))}
          </div>

          {/* Indicadores pós-visita */}
          <div className="flex gap-3 mt-3 pt-3 border-t flex-wrap">
            {posVisita > 0 && (
              <button onClick={() => navigate("/crm")}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 transition-colors">
                <Trophy className="h-3.5 w-3.5 text-emerald-600"/>
                <span className="text-xs font-bold text-emerald-700">{posVisita} em pós-venda (F→N)</span>
              </button>
            )}
            {semData > 0 && (
              <button onClick={() => navigate("/crm")}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-orange-50 border border-orange-200 hover:bg-orange-100 transition-colors">
                <AlertTriangle className="h-3.5 w-3.5 text-orange-600"/>
                <span className="text-xs font-bold text-orange-700">{semData} leads sem próximo passo definido</span>
              </button>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* ── Visitas de hoje ───────────────────────────────────────────── */}
        <Card className="shadow-card">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="font-semibold text-sm flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-emerald-600"/>
                Visitas de hoje
                <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                  {visitasHoje.length}
                </span>
              </div>
              <button onClick={() => navigate("/leads")}
                className="text-xs text-primary hover:underline flex items-center gap-1">
                Ver todas <ChevronRight className="h-3 w-3"/>
              </button>
            </div>

            {visitasHoje.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                <CalendarDays className="h-8 w-8 mx-auto mb-2 opacity-30"/>
                Nenhuma visita agendada para hoje
              </div>
            ) : (
              <div className="space-y-2">
                {visitasHoje.map(lead => {
                  const passou = lead.proximo_followup && new Date(lead.proximo_followup) < new Date();
                  return (
                    <div key={lead.id}
                      className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${passou ? "bg-rose-50 border-rose-200" : "bg-muted/30 border-transparent"}`}>
                      <div className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${passou ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-700"}`}>
                        {passou ? "⏰" : "✅"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm truncate">{lead.nome}</p>
                        <p className="text-xs text-muted-foreground">{formatPhone(lead.telefone)}</p>
                      </div>
                      {lead.proximo_followup && (
                        <div className="text-right shrink-0">
                          <div className={`text-sm font-bold tabular-nums ${passou ? "text-rose-600" : "text-emerald-600"}`}>
                            {fmtTime(lead.proximo_followup)}
                          </div>
                          <div className="text-[10px] text-muted-foreground">
                            {STATUS_LABELS[lead.status] ?? lead.status}
                          </div>
                        </div>
                      )}
                      <button onClick={() => navigate(`/dialer?lead=${lead.id}`)}
                        className="h-8 w-8 rounded-lg flex items-center justify-center bg-background border hover:bg-muted transition-colors shrink-0">
                        <PhoneCall className="h-3.5 w-3.5 text-muted-foreground"/>
                      </button>
                    </div>
                  );
                })}
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
                Discar <ChevronRight className="h-3 w-3"/>
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
                  const stage = FUNNEL_STAGES.find(s => s.key === FUNNEL_STAGE[lead.status]);
                  const passou = lead.proximo_followup && new Date(lead.proximo_followup) < new Date();
                  return (
                    <div key={lead.id}
                      className="flex items-center gap-3 p-3 rounded-xl border border-transparent bg-muted/30 hover:bg-muted/50 transition-colors">
                      {stage && (
                        <div className="h-8 w-8 rounded-full flex items-center justify-center text-xs font-black shrink-0"
                          style={{ backgroundColor: stage.light, color: stage.color }}>
                          {stage.key}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm truncate">{lead.nome}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {STATUS_LABELS[lead.status] ?? lead.status}
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
                        <PhoneCall className="h-3.5 w-3.5 text-muted-foreground"/>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

      </div>

      {/* ── Próximas visitas ──────────────────────────────────────────────── */}
      {proximasVisitas.length > 0 && (
        <Card className="shadow-card">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="font-semibold text-sm flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-violet-600"/>
                Próximas visitas
                <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700">
                  {proximasVisitas.length}
                </span>
              </div>
              <button onClick={() => navigate("/leads")}
                className="text-xs text-primary hover:underline flex items-center gap-1">
                Ver todas <ChevronRight className="h-3 w-3"/>
              </button>
            </div>

            {/* Agrupar por dia */}
            {(() => {
              const grupos: Record<string, Lead[]> = {};
              for (const lead of proximasVisitas) {
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
                      <span className="text-[10px] text-muted-foreground">{leadsGrupo.length} visita{leadsGrupo.length > 1 ? "s" : ""}</span>
                    </div>
                    <div className="space-y-1.5">
                      {leadsGrupo.map(lead => (
                        <div key={lead.id}
                          className="flex items-center gap-3 p-2.5 rounded-xl bg-muted/30 hover:bg-muted/50 transition-colors">
                          <div className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${isDiaFds ? "bg-blue-100 text-blue-700" : "bg-violet-100 text-violet-700"}`}>
                            {isDiaFds ? "🏖️" : "📅"}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-sm truncate">{lead.nome}</p>
                            <p className="text-xs text-muted-foreground">{STATUS_LABELS[lead.status] ?? lead.status}</p>
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
                            <PhoneCall className="h-3 w-3 text-muted-foreground"/>
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
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { icon: <Zap className="h-5 w-5"/>,          label: "Mensagens",      sub: "Enviar WhatsApp",        path: "/dialer",        color: "text-primary",     bg: "bg-primary/10"    },
              { icon: <CalendarDays className="h-5 w-5"/>,  label: "Histórico",      sub: "Mensagens enviadas",     path: "/historico",      color: "text-emerald-600", bg: "bg-emerald-50"    },
              { icon: <Phone className="h-5 w-5"/>,         label: "Pipeline",       sub: "Funil de vendas",        path: "/pipeline",       color: "text-violet-600",  bg: "bg-violet-50"     },
              { icon: <TrendingUp className="h-5 w-5"/>,    label: "CRM",            sub: "Kanban de leads",        path: "/crm",            color: "text-blue-600",    bg: "bg-blue-50"       },
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