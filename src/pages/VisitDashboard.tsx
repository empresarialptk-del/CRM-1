import { useEffect, useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { formatPhone, PEDIDO_ALL_STATUSES, isPedidoConfirmado, isPedidoProblema, isPedidoEntregue } from "@/lib/crm";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell, Legend,
} from "recharts";
import {
  MapPin, CalendarCheck, XCircle, TrendingUp, Award,
  PhoneCall, ChevronLeft, ChevronRight, RefreshCw, Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";

// ── Tipos ─────────────────────────────────────────────────────────────────────
type PedidoLead = {
  id: string;
  nome: string;
  telefone: string;
  status: string;
  proximo_followup: string | null;
  observacoes: string | null;
};

// PEDIDO_ALL_STATUSES vem do crm.ts

const STATUS_CFG: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  pedido_pendente:      { label: "Pendente",         color: "text-amber-700",   bg: "bg-amber-50 border-amber-200",      dot: "bg-amber-400"   },
  pedido_confirmado:    { label: "Fechado",          color: "text-blue-700",    bg: "bg-blue-50 border-blue-200",        dot: "bg-blue-500"    },
  pagamento_confirmado: { label: "Pagamento OK",     color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200",  dot: "bg-emerald-500"  },
  pedido_desistiu:      { label: "Não pagou",        color: "text-rose-800",    bg: "bg-rose-100 border-rose-300",       dot: "bg-rose-600"    },
  pedido_cancelado:     { label: "Cancelou",         color: "text-rose-700",    bg: "bg-rose-50 border-rose-200",        dot: "bg-rose-400"    },
  pedido_remarcado:     { label: "Remarcado",        color: "text-violet-700",  bg: "bg-violet-50 border-violet-200",    dot: "bg-violet-500"  },
  em_separacao:         { label: "Em separação",     color: "text-violet-700",  bg: "bg-violet-50 border-violet-200",    dot: "bg-violet-500"  },
  enviado:              { label: "Enviado",          color: "text-blue-700",    bg: "bg-blue-50 border-blue-200",        dot: "bg-blue-600"    },
  em_transporte:        { label: "Em transporte",    color: "text-cyan-700",    bg: "bg-cyan-50 border-cyan-200",        dot: "bg-cyan-500"    },
  saiu_entrega:         { label: "Saiu p/ entrega",  color: "text-indigo-700",  bg: "bg-indigo-50 border-indigo-200",    dot: "bg-indigo-500"  },
  entregue:             { label: "Entregue",         color: "text-emerald-800", bg: "bg-emerald-50 border-emerald-200",  dot: "bg-emerald-600"  },
  pos_venda:            { label: "Pós-venda",        color: "text-purple-700",  bg: "bg-purple-50 border-purple-200",    dot: "bg-purple-500"  },
  aguardando_recompra:  { label: "Aguard. recompra", color: "text-sky-700",     bg: "bg-sky-50 border-sky-200",          dot: "bg-sky-500"     },
  recomprou:            { label: "Recomprou 🏆",     color: "text-emerald-800", bg: "bg-emerald-100 border-emerald-300", dot: "bg-emerald-700"  },
  pedido:               { label: "Fechado (leg)",    color: "text-blue-700",    bg: "bg-blue-50 border-blue-200",        dot: "bg-blue-400"    },
  agendado:             { label: "Pagamento OK (leg)", color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200",  dot: "bg-emerald-400"  },
};

const WEEKDAYS = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];
const MONTHS   = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

function addDays(d: Date, n: number): Date { const r = new Date(d); r.setDate(r.getDate()+n); return r; }
function startOfWeek(d: Date): Date { const r = new Date(d); r.setDate(r.getDate()-r.getDay()); r.setHours(0,0,0,0); return r; }
function endOfWeek(d: Date): Date { return addDays(startOfWeek(d), 6); }
function fmtDate(d: Date): string { return d.toLocaleDateString("pt-BR", { day:"2-digit", month:"2-digit" }); }

// ── KPI Card ──────────────────────────────────────────────────────────────────
function KPI({ icon, label, value, sub, color }: { icon: React.ReactNode; label: string; value: string | number; sub?: string; color: string }) {
  return (
    <Card className="shadow-card">
      <CardContent className="p-5">
        <div className={`inline-flex h-9 w-9 rounded-lg items-center justify-center mb-3 ${color}`}>
          <span className="h-4 w-4">{icon}</span>
        </div>
        <div className="text-2xl font-display font-bold tabular-nums">{value}</div>
        <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
        {sub && <div className="text-[10px] text-muted-foreground/70 mt-0.5">{sub}</div>}
      </CardContent>
    </Card>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────
export default function PedidoDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [leads, setLeads]     = useState<PedidoLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [weekOffset, setWeekOffset] = useState(0); // 0 = this week, -1 = last week

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("leads")
      .select("id,nome,telefone,status,proximo_followup,observacoes")
      .in("status", PEDIDO_ALL_STATUSES)
      .order("proximo_followup", { ascending: true, nullsFirst: false });
    setLeads((data ?? []) as PedidoLead[]);
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  // ── Métricas gerais ──────────────────────────────────────────────────────
  const metrics = useMemo(() => {
    const total       = leads.length;
    const pendentes   = leads.filter(l => l.status === "pedido_pendente" || l.status === "pedido").length;
    const agendadas   = leads.filter(l => isPedidoConfirmado(l.status) && !!l.proximo_followup).length;
    const confirmadas = leads.filter(l => l.status === "pagamento_confirmado" || l.status === "agendado").length;
    const naoPagou     = leads.filter(l => l.status === "pedido_desistiu").length;
    const canceladas  = leads.filter(l => l.status === "pedido_cancelado").length;
    const problemasTotal = leads.filter(l => isPedidoProblema(l.status)).length;
    const realizadas  = leads.filter(l => isPedidoEntregue(l.status)).length;
    const comData     = leads.filter(l => !!l.proximo_followup).length;
    // Etapas pós-pagamento (G→N)
    const emSeparacao   = leads.filter(l => l.status === "em_separacao").length;
    const enviados       = leads.filter(l => l.status === "enviado").length;
    const emTransporte  = leads.filter(l => l.status === "em_transporte").length;
    const saiuEntrega    = leads.filter(l => l.status === "saiu_entrega").length;
    const entregues       = leads.filter(l => l.status === "entregue").length;
    const posVenda       = leads.filter(l => l.status === "pos_venda").length;
    const aguardRecompra = leads.filter(l => l.status === "aguardando_recompra").length;
    const recompraram    = leads.filter(l => l.status === "recomprou").length;
    const taxaComp    = (agendadas + problemasTotal) > 0
      ? Math.round((agendadas / (agendadas + problemasTotal)) * 100) : 0;
    const taxaConv    = (realizadas + agendadas) > 0
      ? Math.round((realizadas / (realizadas + agendadas)) * 100) : 0;
    const taxaFechamento = (recompraram + realizadas) > 0
      ? Math.round((recompraram / (recompraram + realizadas)) * 100) : 0;
    return { total, pendentes, agendadas, confirmadas, naoPagou, canceladas, problemasTotal,
             realizadas, comData, emSeparacao, enviados, emTransporte, saiuEntrega,
             entregues, posVenda, aguardRecompra, recompraram, taxaComp, taxaConv, taxaFechamento };
  }, [leads]);

  // ── Semana atual / anterior ──────────────────────────────────────────────
  const today = new Date();
  const weekStart = addDays(startOfWeek(today), weekOffset * 7);
  const weekEnd   = addDays(weekStart, 6);

  const weekLeads = useMemo(() => {
    return leads.filter(l => {
      if (!l.proximo_followup) return false;
      const d = new Date(l.proximo_followup);
      return d >= weekStart && d <= endOfWeek(weekStart);
    });
  }, [leads, weekStart]);

  // Dados por dia da semana
  const weekData = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const day = addDays(weekStart, i);
      const dayStr = day.toISOString().slice(0, 10);
      const dayLeads = weekLeads.filter(l => l.proximo_followup?.startsWith(dayStr));
      return {
        dia: WEEKDAYS[day.getDay()],
        data: fmtDate(day),
        agendadas: dayLeads.filter(l => ["pedido_confirmado","pedido","agendado"].includes(l.status)).length,
        confirmadas: dayLeads.filter(l => ["pagamento_confirmado"].includes(l.status)).length,
        canceladas: dayLeads.filter(l => l.status === "pedido_cancelado").length,
        total: dayLeads.length,
        isToday: dayStr === today.toISOString().slice(0, 10),
      };
    });
  }, [weekLeads, weekStart]);

  // ── Próximos pedidos (hoje + futuro) ──────────────────────────────────────
  const todayStr = today.toISOString().slice(0, 10);
  const proximas = useMemo(() => {
    return leads
      .filter(l => l.proximo_followup && l.proximo_followup >= todayStr
        && ["pedido_confirmado","pagamento_confirmado","agendado"].includes(l.status))
      .slice(0, 8);
  }, [leads]);

  // ── Pendentes (sem data) ─────────────────────────────────────────────────
  const pendentes = useMemo(() => {
    return leads.filter(l => l.status === "pedido_pendente" || (l.status === "pedido" && !l.proximo_followup)).slice(0, 8);
  }, [leads]);

  // ── Funil pedido → recompra ──────────────────────────────────────────────
  const funnelData = [
    { name: "Pendentes",   value: metrics.pendentes,   color: "#f97316" },
    { name: "Fechados",    value: metrics.agendadas,   color: "#3b82f6" },
    { name: "Pagos",       value: metrics.confirmadas, color: "#10b981" },
    { name: "Entregues",   value: metrics.entregues,   color: "#8b5cf6" },
    { name: "Recompraram", value: metrics.recompraram, color: "#065f46" },
  ].filter(d => d.value > 0);

  // ── Check-up data from observacoes ───────────────────────────────────────
  const checkupData = useMemo(() => {
    const entries: { nome: string; nota: number; data: string }[] = [];
    leads.forEach(l => {
      if (!l.observacoes) return;
      const match = l.observacoes.match(/\[CHECK-UP ([^\]]+)\] Nota: ([\d.]+)\/10/);
      if (match) entries.push({ nome: l.nome.split(" ")[0], nota: parseFloat(match[2]), data: match[1] });
    });
    return entries.sort((a, b) => b.nota - a.nota).slice(0, 8);
  }, [leads]);

  const avgCheckup = checkupData.length
    ? Math.round(checkupData.reduce((a, b) => a + b.nota, 0) / checkupData.length * 10) / 10
    : null;

  if (loading) return (
    <div className="p-8 max-w-6xl mx-auto space-y-4">
      <div className="h-8 bg-muted animate-pulse rounded w-48" />
      <div className="grid grid-cols-4 gap-4">{[...Array(4)].map((_, i) => <div key={i} className="h-24 bg-muted animate-pulse rounded-xl"/>)}</div>
    </div>
  );

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-display font-bold text-3xl flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center shadow-md">
              <MapPin className="h-5 w-5 text-white" />
            </div>
            Dashboard de Pedidos
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Performance completa do funil de pedidos</p>
        </div>
        <Button variant="outline" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Atualizar
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <KPI icon={<MapPin/>}       label="Total no funil"      value={metrics.total}        color="bg-blue-500/10 text-blue-600"/>
        <KPI icon={<CalendarCheck/>} label="Com prazo definido" value={metrics.comData}      color="bg-emerald-500/10 text-emerald-600" sub={`${metrics.agendadas} fechados + ${metrics.confirmadas} pagos`}/>
        <KPI icon={<XCircle/>}      label="Canceladas"          value={metrics.canceladas}   color="bg-rose-500/10 text-rose-600" sub={`${100 - metrics.taxaComp}% de não pagamento`}/>
        <KPI icon={<TrendingUp/>}   label="Taxa de pagamento"   value={`${metrics.taxaComp}%`} color="bg-violet-500/10 text-violet-600"/>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <KPI icon={<Clock/>}        label="Pedido pendente"     value={metrics.pendentes}    color="bg-amber-500/10 text-amber-600" sub="Sem fechamento ainda"/>
        <KPI icon={<CalendarCheck/>} label="Pós-venda"          value={metrics.posVenda}     color="bg-purple-500/10 text-purple-600"/>
        <KPI icon={<Award/>}        label="Entregues"           value={metrics.entregues}    color="bg-green-500/10 text-green-600"/>
        <KPI icon={<TrendingUp/>}   label="Taxa pedido→entrega" value={`${metrics.taxaConv}%`} color="bg-emerald-500/10 text-emerald-600"/>
      </div>

      {/* KPIs pós-venda G→N */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <KPI icon={<Award/>} label="Em separação/envio" value={metrics.emSeparacao + metrics.enviados}  color="bg-violet-500/10 text-violet-600" sub="G+H · Separando/enviado"/>
        <KPI icon={<Award/>} label="A caminho"          value={metrics.emTransporte + metrics.saiuEntrega} color="bg-indigo-500/10 text-indigo-600" sub="I+J · Em transporte"/>
        <KPI icon={<Award/>} label="Aguard. recompra"   value={metrics.aguardRecompra} color="bg-sky-500/10 text-sky-600"     sub="M · Motor de recorrência"/>
        <KPI icon={<Award/>} label="Recomprou 🏆"       value={metrics.recompraram}  color="bg-emerald-600/10 text-emerald-700" sub={`Fidelização: ${metrics.taxaFechamento}%`}/>
      </div>

      {/* Semana */}
      <Card className="shadow-card">
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-display font-semibold">Pedidos da semana</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {fmtDate(weekStart)} – {fmtDate(weekEnd)} · {weekLeads.length} pedidos
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setWeekOffset(w => w - 1)} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
                <ChevronLeft className="h-4 w-4"/>
              </button>
              <span className="text-sm font-medium px-2">
                {weekOffset === 0 ? "Esta semana" : weekOffset === -1 ? "Semana passada" : `${Math.abs(weekOffset)} sem. atrás`}
              </span>
              <button onClick={() => setWeekOffset(w => Math.min(0, w + 1))} disabled={weekOffset === 0} className="p-1.5 rounded-lg hover:bg-muted transition-colors disabled:opacity-30">
                <ChevronRight className="h-4 w-4"/>
              </button>
            </div>
          </div>
          <div className="h-52">
            <ResponsiveContainer>
              <BarChart data={weekData} barSize={20}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))"/>
                <XAxis dataKey="dia" fontSize={11} stroke="hsl(var(--muted-foreground))"/>
                <YAxis fontSize={11} stroke="hsl(var(--muted-foreground))" allowDecimals={false}/>
                <Tooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                  formatter={(v: any, n: string) => [v, n === "agendadas" ? "Fechados" : n === "confirmadas" ? "Pagos" : "Cancelados"]}
                  labelFormatter={(l, p) => `${l} (${p[0]?.payload?.data})`}
                />
                <Bar dataKey="agendadas"  fill="#3b82f6" radius={[4,4,0,0]} name="Fechados"/>
                <Bar dataKey="confirmadas" fill="#10b981" radius={[4,4,0,0]} name="Pagos"/>
                <Bar dataKey="canceladas" fill="#ef4444" radius={[4,4,0,0]} name="Cancelados"/>
                <Legend/>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Funil + Check-up */}
      <div className="grid lg:grid-cols-2 gap-6">
        <Card className="shadow-card">
          <CardContent className="p-6">
            <h3 className="font-display font-semibold mb-1">Funil de pedidos</h3>
            <p className="text-xs text-muted-foreground mb-4">Do pedido pendente até a recompra</p>
            {funnelData.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">Sem dados</div>
            ) : (
              <div className="h-48">
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={funnelData} dataKey="value" nameKey="name" innerRadius={45} outerRadius={80} paddingAngle={3}>
                      {funnelData.map((d, i) => <Cell key={i} fill={d.color}/>)}
                    </Pie>
                    <Tooltip formatter={(v: any) => [`${v} leads`]}/>
                    <Legend wrapperStyle={{ fontSize: 11 }}/>
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
            {/* Barra de funil */}
            <div className="mt-4 space-y-2">
              {funnelData.map(d => (
                <div key={d.name}>
                  <div className="flex justify-between text-xs mb-0.5">
                    <span className="text-muted-foreground">{d.name}</span>
                    <span className="font-semibold">{d.value}</span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${metrics.total > 0 ? (d.value/metrics.total)*100 : 0}%`, background: d.color }}/>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardContent className="p-6">
            <div className="flex items-center gap-2 mb-1">
              <Award className="h-5 w-5 text-purple-600"/>
              <h3 className="font-display font-semibold">Check-up de satisfação</h3>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              Notas dos clientes que compraram
              {avgCheckup !== null && <span className="ml-2 font-semibold text-purple-600">· Média: {avgCheckup}/10</span>}
            </p>
            {checkupData.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground text-sm">
                <Award className="h-10 w-10 mx-auto mb-3 text-muted-foreground/20"/>
                Nenhum check-up realizado ainda
              </div>
            ) : (
              <div className="space-y-2">
                {checkupData.map((c, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="h-7 w-7 rounded-full bg-purple-100 flex items-center justify-center text-xs font-bold text-purple-700 shrink-0">
                      {c.nome[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between text-xs mb-0.5">
                        <span className="font-medium truncate">{c.nome}</span>
                        <span className={`font-bold tabular-nums ${c.nota >= 8 ? "text-emerald-600" : c.nota >= 6 ? "text-amber-600" : "text-rose-600"}`}>{c.nota}/10</span>
                      </div>
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${c.nota >= 8 ? "bg-emerald-500" : c.nota >= 6 ? "bg-amber-500" : "bg-rose-500"}`} style={{ width: `${(c.nota/10)*100}%` }}/>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Próximos pedidos */}
      {proximas.length > 0 && (
        <Card className="shadow-card">
          <CardContent className="p-6">
            <h3 className="font-display font-semibold mb-4 flex items-center gap-2">
              <CalendarCheck className="h-5 w-5 text-emerald-600"/> Próximos pedidos com prazo
              <span className="text-xs text-muted-foreground font-normal ml-1">— {proximas.length} leads</span>
            </h3>
            <div className="divide-y">
              {proximas.map(l => {
                const cfg = STATUS_CFG[l.status] ?? STATUS_CFG.pedido_confirmado;
                const date = l.proximo_followup ? new Date(l.proximo_followup) : null;
                const isToday = date && date.toISOString().slice(0,10) === todayStr;
                return (
                  <div key={l.id} className="flex items-center gap-3 py-3">
                    <div className={`h-2 w-2 rounded-full shrink-0 ${cfg.dot}`}/>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{l.nome}</span>
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${cfg.bg} ${cfg.color}`}>{cfg.label}</span>
                        {isToday && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">Hoje</span>}
                      </div>
                      <div className="text-xs text-muted-foreground">{formatPhone(l.telefone)}</div>
                    </div>
                    {date && (
                      <div className="text-right shrink-0">
                        <div className="text-xs font-semibold">{date.toLocaleDateString("pt-BR", { weekday:"short", day:"2-digit", month:"2-digit" })}</div>
                        <div className="text-[10px] text-muted-foreground">{date.toLocaleTimeString("pt-BR", { hour:"2-digit", minute:"2-digit" })}</div>
                      </div>
                    )}
                    <button onClick={() => navigate(`/dialer?lead=${l.id}`)} className="shrink-0 p-1.5 rounded-lg hover:bg-muted transition-colors">
                      <PhoneCall className="h-4 w-4 text-muted-foreground"/>
                    </button>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pendentes sem data */}
      {pendentes.length > 0 && (
        <Card className="shadow-card border-amber-200">
          <CardContent className="p-6">
            <h3 className="font-display font-semibold mb-4 flex items-center gap-2">
              <Clock className="h-5 w-5 text-amber-600"/> Pedidos pendentes — sem prazo definido
              <span className="text-xs text-muted-foreground font-normal ml-1">— {metrics.pendentes} leads</span>
            </h3>
            <div className="divide-y">
              {pendentes.map(l => (
                <div key={l.id} className="flex items-center gap-3 py-3">
                  <div className="h-2 w-2 rounded-full bg-amber-400 shrink-0"/>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{l.nome}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatPhone(l.telefone)}
                      {l.observacoes && <span className="ml-2">— {l.observacoes.slice(0, 50)}{l.observacoes.length > 50 ? "…" : ""}</span>}
                    </p>
                  </div>
                  <button onClick={() => navigate(`/dialer?lead=${l.id}`)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500 text-white hover:bg-amber-600 transition-colors shrink-0">
                    <PhoneCall className="h-3.5 w-3.5"/> Ligar
                  </button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}