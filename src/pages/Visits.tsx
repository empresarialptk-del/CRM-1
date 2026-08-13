import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatPhone, PEDIDO_ALL_STATUSES, isPedidoConfirmado, isPedidoProblema, isPedidoEntregue, STATUS_LABELS, STATUS_COLOR, OUTCOMES_BY_STAGE, OBS_SUGGESTIONS, STATUS_FROM_OUTCOME, FUNNEL_STAGE, FUNNEL_STAGES } from "@/lib/crm";
import {
  CalendarDays, Phone, Clock, CheckCircle2, RefreshCw,
  PhoneCall, User, ChevronLeft, ChevronRight, AlertTriangle,
  Pencil, ExternalLink, PhoneMissed, RotateCcw, XCircle,
  CalendarClock, MessageSquare,
} from "lucide-react";
import { toast } from "sonner";

// ─── Tipos ────────────────────────────────────────────────────────────────────

type PedidoLead = {
  id: string;
  nome: string;
  telefone: string;
  status: string;
  observacoes: string | null;
  origem: string | null;
  proximo_followup: string | null;
};



const STATUS_CFG: Record<string, { label: string; badge: string; dot: string }> = {
  pedido:        { label: "Fechado (leg)",  badge: "bg-blue-50 text-blue-700 border-blue-200",      dot: "bg-blue-500"   },
  agendado:          { label: "Fechado (leg)",  badge: "bg-violet-50 text-violet-700 border-violet-200", dot: "bg-violet-400" },
  pedido_pendente:   { label: "Pendente",       badge: "bg-amber-50 text-amber-700 border-amber-200",   dot: "bg-amber-500"  },
  pedido_confirmado:   { label: "Fechado",      badge: "bg-blue-50 text-blue-700 border-blue-200",      dot: "bg-blue-500"   },
  pagamento_confirmado: { label: "Pagamento OK",  badge: "bg-green-50 text-green-700 border-green-200",   dot: "bg-green-500"  },
  pedido_cancelado:  { label: "Cancelado",      badge: "bg-rose-50 text-rose-700 border-rose-200",      dot: "bg-rose-500"   },
  recomprou:    { label: "Concluído",      badge: "bg-purple-50 text-purple-700 border-purple-200", dot: "bg-purple-500" },
  nao_atendeu:   { label: "Não pagou",      badge: "bg-red-50 text-red-700 border-red-200",          dot: "bg-red-500"    },
  retornar:      { label: "Remarcado",      badge: "bg-amber-50 text-amber-700 border-amber-200",    dot: "bg-amber-500"  },
  sem_interesse: { label: "Cancelado",      badge: "bg-gray-100 text-gray-500 border-gray-200",      dot: "bg-gray-400"   },
  perdido:       { label: "Perdido",        badge: "bg-gray-100 text-gray-500 border-gray-200",      dot: "bg-gray-400"   },
};

const PEDIDO_STATUSES: string[] = [
  "pedido", "agendado", "recomprou", "nao_atendeu", "retornar", "sem_interesse", "perdido",
];

const ACTIVE_PEDIDO_STATUSES: string[] = [
  "pedido_pendente", "pedido_confirmado", "pagamento_confirmado", "pedido_cancelado",
  // legado
  "pedido", "agendado",
];
const ALL_PEDIDO_STATUSES: string[] = [
  "pedido_pendente", "pedido_confirmado", "pagamento_confirmado", "pedido_cancelado",
  "pos_venda", "recomprou", "sem_interesse", "perdido",
  // legado
  "pedido", "agendado", "nao_atendeu",
];

type PageTab = "calendario" | "recuperacao" | "aguardando" | "sem_data" | "pos_pedido";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pad(n: number) { return String(n).padStart(2, "0"); }
function toDateStr(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function todayStr() { return toDateStr(new Date()); }

function toDatetimeLocal(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatPedidoDate(iso: string | null): string {
  if (!iso) return "Sem data";
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" })
    + " às "
    + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function formatTime(iso: string | null): string {
  if (!iso) return "--:--";
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function getDaysInMonth(year: number, month: number) { return new Date(year, month + 1, 0).getDate(); }
function getFirstDayOfMonth(year: number, month: number) { return new Date(year, month, 1).getDay(); }

const MONTH_NAMES = [
  "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro",
];

function toWhatsAppNumber(tel: string): string {
  let d = tel.replace(/\D/g, "");
  if (d.startsWith("0")) d = d.slice(1);
  if (!d.startsWith("55")) d = "55" + d;
  return d;
}

// ─── Componente principal ─────────────────────────────────────────────────────

// ── Mini-form para remarcar com data ─────────────────────────────────────────
function RemarcarForm({ onConfirm }: { onConfirm: (data: string) => void }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState("");
  if (!open) return (
    <button onClick={() => setOpen(true)}
      className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-blue-50 border border-blue-200 text-xs font-semibold text-blue-700 hover:bg-blue-100 transition-colors">
      📆 Remarcou — definir nova data
    </button>
  );
  return (
    <div className="flex gap-2 items-center">
      <input type="datetime-local" value={data} onChange={e => setData(e.target.value)}
        className="flex-1 text-xs border rounded-lg px-2 py-1.5 bg-background"/>
      <button onClick={() => { if (data) { onConfirm(data); setOpen(false); } }}
        disabled={!data}
        className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-bold disabled:opacity-40">
        OK
      </button>
      <button onClick={() => setOpen(false)}
        className="px-2 py-1.5 rounded-lg text-muted-foreground text-xs hover:bg-muted">
        ✕
      </button>
    </div>
  );
}

export default function Pedidos() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [pedidos, setPedidos]             = useState<PedidoLead[]>([]);
  const [loading, setLoading]           = useState(true);
  const [selectedDate, setSelectedDate] = useState<string>(todayStr());
  const [calYear, setCalYear]           = useState(new Date().getFullYear());
  const [calMonth, setCalMonth]         = useState(new Date().getMonth());
  const [editLead, setEditLead]         = useState<PedidoLead | null>(null);
  const [openModal, setOpenModal]       = useState(false);
  const [activeTab, setActiveTab]       = useState<PageTab>("calendario");
  const [kpiFilter, setKpiFilter]       = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("leads")
      .select("id,nome,telefone,status,observacoes,origem,proximo_followup")
      .in("status", [...PEDIDO_ALL_STATUSES, "pedido_pendente", "pedido_remarcado",
        "em_separacao", "enviado", "em_transporte", "saiu_entrega",
        "entregue", "pos_venda", "aguardando_recompra", "recomprou"])
      .order("proximo_followup", { ascending: true });
    if (error) { toast.error("Erro ao carregar pedidos: " + error.message); setLoading(false); return; }
    // Deduplica por id (evita duplicatas da query)
    const seen = new Set<string>();
    const unique = ((data ?? []) as PedidoLead[]).filter(v => {
      if (seen.has(v.id)) return false;
      seen.add(v.id);
      return true;
    });
    setPedidos(unique);
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const TODAY = todayStr();

  // Hoje — pedidos com data marcada para hoje
  const todayPedidos = pedidos.filter(v =>
    v.proximo_followup?.startsWith(TODAY) &&
    ["pedido_confirmado","pagamento_confirmado","pedido","agendado"].includes(v.status)
  );

  // Agendadas = COM data marcada (agendada + confirmada + legado)
  const agendadas = pedidos.filter(v =>
    ["pedido_confirmado","pagamento_confirmado","pedido","agendado"].includes(v.status) && !!v.proximo_followup
  );

  // Confirmadas — subgrupo de agendadas que confirmaram presença
  const confirmed = pedidos.filter(v => v.status === "pagamento_confirmado" && !!v.proximo_followup);

  // Realizadas — pos_venda ou recomprou (entregue)
  const realized = pedidos.filter(v => isPedidoEntregue(v.status));

  // Não pagou — pedido_cancelado
  // pedido_desistiu = não veio sem avisar | pedido_cancelado = avisou que não vai
  const faltou       = pedidos.filter(v => v.status === "pedido_desistiu");
  const cancelou     = pedidos.filter(v => v.status === "pedido_cancelado");
  const naoCompareceu = pedidos.filter(v => isPedidoProblema(v.status));

  // ── Totalizadores de evolução ─────────────────────────────────────────────
  const totalNoFunil      = pedidos.length;
  const totalAgendadas    = agendadas.length;
  const totalRealizadas   = realized.length;
  const totalNaoVieram    = naoCompareceu.length;
  const totalPerdidosPedido = pedidos.filter(v => ["sem_interesse","perdido","nao_quer_mais"].includes(v.status)).length;

  // Taxas
  const taxaComparecimento = (totalAgendadas + totalNaoVieram) > 0
    ? Math.round((totalAgendadas / (totalAgendadas + totalNaoVieram)) * 100) : 0;
  const taxaConversaoPedido = totalRealizadas > 0
    ? Math.round((totalRealizadas / (totalRealizadas + totalNaoVieram + totalPerdidosPedido)) * 100) : 0;

  // Aguardando data — querem remarcar (pedido_pendente + remarcada)
  // pedido_desistiu e pedido_cancelado ficam na aba "Não pagou"
  const aguardando = pedidos.filter(v =>
    ["pedido_pendente", "pedido_remarcado"].includes(v.status)
  );

  // Sem data — pedido_pendente ou pedido legacy sem proximo_followup
  const semData = pedidos.filter(v =>
    v.status === "pedido_pendente" ||
    (v.status === "pedido" && !v.proximo_followup)
  );

  // Pós-pedido F→N — precisam de acompanhamento
  const posPedido = pedidos.filter(v =>
    ["em_separacao","enviado","em_transporte","saiu_entrega",
     "entregue","pos_venda","aguardando_recompra","recomprou"].includes(v.status)
  );

  // Total com data = agendadas (já inclui confirmadas)
  // Deduplica por id para evitar duplicatas
  const pendingMap = new Map<string, PedidoLead>();
  [...agendadas].forEach(v => pendingMap.set(v.id, v));
  const pending = Array.from(pendingMap.values())
    .sort((a, b) => (a.proximo_followup ?? "").localeCompare(b.proximo_followup ?? ""));

  // Filtro ativo pelo KPI clicado
  function matchesKpiFilter(v: PedidoLead): boolean {
    if (!kpiFilter) return true;
    if (kpiFilter === "hoje")           return !!v.proximo_followup?.startsWith(TODAY) && ["pedido_confirmado","pagamento_confirmado","pedido","agendado"].includes(v.status);
    if (kpiFilter === "agendadas")      return ["pedido_confirmado","pagamento_confirmado","pedido","agendado"].includes(v.status) && !!v.proximo_followup;
    if (kpiFilter === "confirmadas")    return v.status === "pagamento_confirmado";
    if (kpiFilter === "realizadas")     return ["pos_venda","recomprou"].includes(v.status);
    if (kpiFilter === "nao_compareceu") return v.status === "pedido_cancelado";
    if (kpiFilter === "sem_data")       return v.status === "pedido_pendente" || (v.status === "pedido" && !v.proximo_followup);
    return true;
  }

  // ── Calendário ────────────────────────────────────────────────────────────
  const daysInMonth = getDaysInMonth(calYear, calMonth);
  const firstDay    = getFirstDayOfMonth(calYear, calMonth);

  function pedidosNoDia(dateStr: string) {
    return pedidos.filter(v => v.proximo_followup?.startsWith(dateStr));
  }

  const selectedPedidos = pedidos.filter(v => v.proximo_followup?.startsWith(selectedDate) && matchesKpiFilter(v));

  async function updateStatus(lead: PedidoLead, newStatus: string) {
    const { error } = await supabase.from("leads").update({ status: newStatus }).eq("id", lead.id);
    if (error) { toast.error(error.message); return; }
    toast.success(`Status atualizado: ${STATUS_CFG[newStatus].label}`);
    setPedidos(prev => prev.map(v => v.id === lead.id ? { ...v, status: newStatus } : v));
  }

  // Reagendar: vira "pedido" e limpa a data para o usuário definir nova
  // ── 3 variantes de cancelamento de pedido ─────────────────────────────────
  // 1. Não veio — fica no funil, precisa remarcar
  async function marcarNaoVeio(lead: PedidoLead) {
    const { error } = await supabase.from("leads").update({
      status: "pedido_desistiu" as any,
      proximo_followup: null,
    }).eq("id", lead.id);
    if (error) { toast.error(error.message); return; }
    toast.success(`🚫 ${lead.nome.split(" ")[0]} não veio — ligue para remarcar`);
    setPedidos(prev => prev.map(v => v.id === lead.id ? { ...v, status: "pedido_desistiu", proximo_followup: null } : v));
  }

  // 2. Remarcou — nova data definida
  async function marcarRemarcou(lead: PedidoLead, novaData: string) {
    const iso = new Date(novaData).toISOString();
    const { error } = await supabase.from("leads").update({
      status: "pedido_remarcado" as any,
      proximo_followup: iso,
    }).eq("id", lead.id);
    if (error) { toast.error(error.message); return; }
    toast.success(`📆 ${lead.nome.split(" ")[0]} remarcou para ${new Date(novaData).toLocaleDateString("pt-BR")}`);
    setPedidos(prev => prev.map(v => v.id === lead.id ? { ...v, status: "pedido_remarcado", proximo_followup: iso } : v));
  }

  // 3. Desistiu — sai do funil de pedidos
  async function marcarDesistiu(lead: PedidoLead) {
    const { error } = await supabase.from("leads").update({
      status: "sem_interesse" as any,
    }).eq("id", lead.id);
    if (error) { toast.error(error.message); return; }
    toast.success(`${lead.nome.split(" ")[0]} marcado como sem interesse`);
    setPedidos(prev => prev.filter(v => v.id !== lead.id));
  }

  // Veio! — avança no funil
  async function marcarVeio(lead: PedidoLead) {
    const { error } = await supabase.from("leads").update({
      status: "entregue" as any,
    }).eq("id", lead.id);
    if (error) { toast.error(error.message); return; }
    toast.success(`✅ ${lead.nome.split(" ")[0]} entregue! Avança no funil.`);
    setPedidos(prev => prev.filter(v => v.id !== lead.id));
  }

  // Legado — mantém compatibilidade
  async function reagendar(lead: PedidoLead) { return marcarNaoVeio(lead); }
  async function marcarPerdido(lead: PedidoLead) { return marcarDesistiu(lead); }

  function openDialer(lead: PedidoLead) { navigate(`/dialer?lead=${lead.id}`); }

  // Avança o lead para o próximo status pós-pedido
  async function avancarPosPedido(lead: PedidoLead, novoStatus: string) {
    const { error } = await supabase.from("leads")
      .update({ status: novoStatus })
      .eq("id", lead.id);
    if (error) { toast.error(error.message); return; }
    toast.success(`✅ ${lead.nome.split(" ")[0]} → ${STATUS_LABELS[novoStatus] ?? novoStatus}`);
    setPedidos(prev => prev.map(v => v.id === lead.id ? { ...v, status: novoStatus } : v));
  }

  // Lógica corrigida: D (quer comprar) implica C (interesse)
  // Quando um lead vai para pedido_pendente, ele já tem interesse — não precisa passar por C
  // C só existe se o lead demonstrou interesse mas AINDA não quer marcar pedido

  function prevMonth() {
    if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1); }
    else setCalMonth(m => m - 1);
  }
  function nextMonth() {
    if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1); }
    else setCalMonth(m => m + 1);
  }

  const tabConfig = [
    {
      key: "calendario" as PageTab,
      label: "Calendário",
      icon: <CalendarDays className="h-3.5 w-3.5" />,
      badge: null,
    },
    {
      key: "recuperacao" as PageTab,
      label: "Não pagou",
      icon: <PhoneMissed className="h-3.5 w-3.5" />,
      badge: naoCompareceu.length > 0 ? naoCompareceu.length : null,
      urgent: true,
    },
    {
      key: "aguardando" as PageTab,
      label: "Aguardando data",
      icon: <Clock className="h-3.5 w-3.5" />,
      badge: aguardando.length > 0 ? aguardando.length : null,
      urgent: aguardando.filter(v => v.status === "pedido_desistiu").length > 0,
    },
    {
      key: "sem_data" as PageTab,
      label: "Sem data",
      icon: <CalendarClock className="h-3.5 w-3.5" />,
      badge: semData.length > 0 ? semData.length : null,
    },
    {
      key: "pos_pedido" as PageTab,
      label: "Pós-pedido",
      icon: <CheckCircle2 className="h-3.5 w-3.5" />,
      badge: posPedido.length > 0 ? posPedido.length : null,
    },
  ];

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">

      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-display font-bold text-3xl">Pedidos</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Lead quente → pedido fechado → pagamento confirmado
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
          <Button onClick={() => navigate("/dialer")}>
            <PhoneCall className="h-4 w-4 mr-2" /> Ir ao discador
          </Button>
        </div>
      </div>

      {/* ── KPIs ── */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
        {[
          { label: "Hoje",           value: todayPedidos.length,   icon: <CalendarDays className="h-4 w-4"/>, color: "text-blue-600",   bg: "bg-blue-50",    tab: "calendario" as PageTab, filter: "hoje",         sub: "pedidos com prazo hoje"    },
          { label: "Agendadas",      value: agendadas.length,     icon: <Clock className="h-4 w-4"/>,        color: "text-amber-600",  bg: "bg-amber-50",   tab: "calendario" as PageTab, filter: "agendadas",    sub: "com data marcada"    },
          { label: "Confirmadas",    value: confirmed.length,     icon: <CheckCircle2 className="h-4 w-4"/>, color: "text-green-600",  bg: "bg-green-50",   tab: "calendario" as PageTab, filter: "confirmadas",  sub: "confirmaram presença"},
          { label: "Realizadas",     value: realized.length,      icon: <CheckCircle2 className="h-4 w-4"/>, color: "text-purple-600", bg: "bg-purple-50",  tab: "calendario" as PageTab, filter: "realizadas",   sub: "pos_venda ou doc"     },
          { label: "Não pagou", value: naoCompareceu.length, icon: <PhoneMissed className="h-4 w-4"/>,  color: "text-red-600",    bg: "bg-red-50",     tab: "recuperacao" as PageTab, filter: "nao_compareceu", sub: "pagamento pendente", urgent: true },
          { label: "Sem data",       value: semData.length,       icon: <AlertTriangle className="h-4 w-4"/>,color: "text-gray-600",   bg: "bg-gray-100",   tab: "sem_data"   as PageTab, filter: "sem_data",     sub: "ligar para confirmar"},
        ].map(k => {
          const isActive = kpiFilter === k.filter;
          return (
          <Card key={k.label}
            className={`shadow-card cursor-pointer transition-all hover:shadow-md hover:scale-[1.01] ${isActive ? "ring-2 ring-offset-1" : ""} ${(k as any).urgent && naoCompareceu.length > 0 ? "border-red-200" : ""}`}
            style={isActive ? { ringColor: k.color.replace("text-","") } : {}}
            onClick={() => {
              setActiveTab((k as any).tab);
              setKpiFilter(isActive ? null : (k as any).filter);
            }}>
            <CardContent className="p-3 flex items-center gap-2.5">
              <div className={`h-8 w-8 rounded-lg ${k.bg} ${k.color} flex items-center justify-center shrink-0`}>{k.icon}</div>
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground truncate">{k.label}</div>
                <div className={`font-display font-bold text-xl tabular-nums ${k.color}`}>{k.value}</div>
                <div className="text-[9px] text-muted-foreground/60 truncate">{(k as any).sub}</div>
              </div>
            </CardContent>
          </Card>
        );})}
      </div>

      {/* ── Alertas ── */}
      {naoCompareceu.length > 0 && activeTab !== "recuperacao" && (
        <button
          onClick={() => setActiveTab("recuperacao")}
          className="w-full flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-left hover:bg-red-100 transition-colors"
        >
          <PhoneMissed className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-red-800">
              {naoCompareceu.length} cliente{naoCompareceu.length > 1 ? "s" : ""} não confirmou{naoCompareceu.length > 1 ? "ram" : ""} o pagamento
            </p>
            <p className="text-xs text-red-700 mt-0.5">
              Entre em contato agora para tentar remarcar. Clique para ver a lista de recuperação.
            </p>
          </div>
          <span className="text-xs font-semibold text-red-700 bg-red-100 border border-red-200 px-2 py-1 rounded-lg shrink-0">
            Ver agora →
          </span>
        </button>
      )}

      {semData.length > 0 && activeTab !== "sem_data" && (
        <button
          onClick={() => setActiveTab("sem_data")}
          className="w-full flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-left hover:bg-amber-100 transition-colors"
        >
          <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-800">
              {semData.length} pedido{semData.length > 1 ? "s" : ""} sem data definida
            </p>
            <p className="text-xs text-amber-700 mt-0.5">
              Ligue para confirmar a data com esses clientes. Clique para ver a lista.
            </p>
            <div className="flex flex-wrap gap-2 mt-2">
              {semData.slice(0, 5).map(v => (
                <span key={v.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-amber-100 border border-amber-200 text-xs text-amber-800">
                  {v.nome.split(" ")[0]}
                </span>
              ))}
              {semData.length > 5 && <span className="text-xs text-amber-700 self-center">+{semData.length - 5} mais</span>}
            </div>
          </div>
          <span className="text-xs font-semibold text-amber-700 bg-amber-100 border border-amber-200 px-2 py-1 rounded-lg shrink-0">
            Ver agora →
          </span>
        </button>
      )}

      {/* ── Tabs ── */}
      <div className="flex rounded-xl overflow-hidden border shadow-sm">
        {tabConfig.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 py-3 text-xs font-semibold flex items-center justify-center gap-2 transition-colors relative ${
              activeTab === tab.key
                ? "bg-primary text-primary-foreground"
                : "bg-card text-muted-foreground hover:bg-muted/50"
            }`}
          >
            {tab.icon}
            {tab.label}
            {tab.badge && (
              <span className={`inline-flex items-center justify-center h-5 w-5 rounded-full text-[10px] font-bold ${
                activeTab === tab.key
                  ? "bg-white text-primary"
                  : tab.urgent
                    ? "bg-red-500 text-white"
                    : "bg-amber-500 text-white"
              }`}>
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ════════════════════════════════════════════════════════════════════
          ABA: CALENDÁRIO
      ════════════════════════════════════════════════════════════════════ */}
      {activeTab === "calendario" && (
        <>
          {/* Calendário compacto — linha horizontal */}
          <Card className="shadow-card">
            <CardContent className="p-4">
              <div className="flex items-start gap-6">
                {/* Mini calendário */}
                <div className="shrink-0 w-64">
                  <div className="flex items-center justify-between mb-3">
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={prevMonth}>
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </Button>
                    <span className="font-semibold text-sm">{MONTH_NAMES[calMonth]} {calYear}</span>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={nextMonth}>
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-7 mb-1">
                    {["D","S","T","Q","Q","S","S"].map((d, i) => (
                      <div key={i} className="text-center text-[10px] font-medium text-muted-foreground py-0.5">{d}</div>
                    ))}
                  </div>
                  <div className="grid grid-cols-7 gap-y-0.5">
                    {Array.from({ length: firstDay }).map((_, i) => <div key={`e${i}`} />)}
                    {Array.from({ length: daysInMonth }).map((_, i) => {
                      const day     = i + 1;
                      const dateStr = `${calYear}-${pad(calMonth + 1)}-${pad(day)}`;
                      const count   = pedidosNoDia(dateStr).length;
                      const isToday = dateStr === TODAY;
                      const isSel   = dateStr === selectedDate;
                      return (
                        <button
                          key={day}
                          onClick={() => setSelectedDate(dateStr)}
                          className={`relative h-7 w-full rounded text-xs font-medium transition-colors ${
                            isSel ? "bg-primary text-primary-foreground"
                            : isToday ? "border border-primary text-primary font-bold"
                            : "hover:bg-muted"
                          }`}
                        >
                          {day}
                          {count > 0 && (
                            <span className={`absolute bottom-0.5 left-1/2 -translate-x-1/2 h-1 w-1 rounded-full ${
                              isSel ? "bg-primary-foreground" : "bg-primary"
                            }`} />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Divisor */}
                <div className="w-px bg-border self-stretch shrink-0" />

                {/* Pedidos do dia selecionado */}
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-sm mb-3">
                    {selectedDate === TODAY ? "Hoje"
                      : new Date(selectedDate + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}
                    <span className="text-muted-foreground font-normal ml-2 text-xs">
                      — {selectedPedidos.length} pedido{selectedPedidos.length !== 1 ? "s" : ""}
                    </span>
                  </h3>
                  {loading ? (
                    <div className="h-4 bg-muted animate-pulse rounded w-1/3" />
                  ) : selectedPedidos.length === 0 ? (
                    <div className="py-8 text-center text-sm text-muted-foreground">
                      <CalendarDays className="h-8 w-8 mx-auto mb-2 text-muted-foreground/30" />
                      Nenhum pedido nesta data.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                      {selectedPedidos.map(v => (
                        <PedidoCard key={v.id} pedido={v} onStatusChange={updateStatus} onOpenDialer={openDialer}
                          onEdit={() => { setEditLead(v); setOpenModal(true); }} compact />
                      ))}
                    </div>
                  )}
                </div>

                {/* Legenda */}
                <div className="shrink-0 space-y-1.5 pt-1">
                  <p className="text-[9px] uppercase tracking-wider text-muted-foreground mb-2">Status</p>
                  {PEDIDO_STATUSES.slice(0, 4).map(s => (
                    <div key={s} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                      <span className={`h-1.5 w-1.5 rounded-full ${STATUS_CFG[s].dot}`} />
                      {STATUS_CFG[s].label}
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Próximas pedidos — organizadas por data */}
          {pending.length > 0 && (() => {
            const comData = [...pending.filter(v => !!v.proximo_followup)].sort((a, b) =>
              new Date(a.proximo_followup!).getTime() - new Date(b.proximo_followup!).getTime()
            );
            const semDataList = pending.filter(v => !v.proximo_followup);
            const grupos: Record<string, PedidoLead[]> = {};
            comData.forEach(v => {
              const d = v.proximo_followup!.slice(0, 10);
              if (!grupos[d]) grupos[d] = [];
              grupos[d].push(v);
            });
            const tomorrowStr = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
            return (
              <div className="space-y-6">
                <h2 className="font-semibold text-base">
                  Próximas pedidos
                  <span className="text-muted-foreground font-normal ml-2 text-sm">— {pending.length} agendadas</span>
                </h2>
                {Object.entries(grupos).map(([date, pedidos]) => {
                  const d = new Date(date + "T12:00:00");
                  const isToday = date === TODAY;
                  const isTomorrow = date === tomorrowStr;
                  const label = isToday ? "Hoje" : isTomorrow ? "Amanhã" : d.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });
                  return (
                    <div key={date}>
                      <div className="flex items-center gap-3 mb-3">
                        <span className={`text-sm font-bold capitalize ${isToday ? "text-primary" : "text-foreground"}`}>{label}</span>
                        <span className="text-xs text-muted-foreground">{d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}</span>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${isToday ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                          {pedidos.length} pedido{pedidos.length > 1 ? "s" : ""}
                        </span>
                        <div className="flex-1 h-px bg-border" />
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                        {pedidos.map(v => (
                          <PedidoCard key={v.id} pedido={v} onStatusChange={updateStatus} onOpenDialer={openDialer}
                            onEdit={() => { setEditLead(v); setOpenModal(true); }} compact />
                        ))}
                      </div>
                    </div>
                  );
                })}
                {semDataList.length > 0 && (
                  <div>
                    <div className="flex items-center gap-3 mb-3">
                      <span className="text-sm font-bold text-amber-600">Sem data definida</span>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-600">
                        {semDataList.length} pedido{semDataList.length > 1 ? "s" : ""}
                      </span>
                      <div className="flex-1 h-px bg-border" />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                      {semDataList.map(v => (
                        <PedidoCard key={v.id} pedido={v} onStatusChange={updateStatus} onOpenDialer={openDialer}
                          onEdit={() => { setEditLead(v); setOpenModal(true); }} compact />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
        </>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          ABA: RECUPERAÇÃO — Não pagou
      ════════════════════════════════════════════════════════════════════ */}
      {activeTab === "recuperacao" && (
        <div className="space-y-4">
          {/* Banner de instrução */}
          <div className="flex items-start gap-4 p-5 rounded-xl bg-red-50 border border-red-200">
            <PhoneMissed className="h-6 w-6 text-red-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-red-900 text-sm">
                {naoCompareceu.length} cliente{naoCompareceu.length > 1 ? "s" : ""} não confirmou{naoCompareceu.length > 1 ? "ram" : ""} o pagamento
              </p>
              <p className="text-xs text-red-700 mt-1">
                Entre em contato o quanto antes. Clique em <strong>Reagendar</strong> para tentar marcar nova data,
                ou <strong>Perdido</strong> se o cliente decidiu não comprar.
              </p>
            </div>
          </div>

          {naoCompareceu.length === 0 ? (
            <Card className="shadow-card">
              <CardContent className="py-20 text-center">
                <CheckCircle2 className="h-14 w-14 mx-auto mb-4 text-emerald-400" />
                <p className="text-foreground font-semibold">Tudo certo por aqui!</p>
                <p className="text-muted-foreground text-sm mt-1">Nenhum cliente com pagamento pendente.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {naoCompareceu.map(v => (
                <RecuperacaoCard
                  key={v.id}
                  pedido={v}
                  onNaoVeio={() => marcarNaoVeio(v)}
                  onRemarcou={(d) => marcarRemarcou(v, d)}
                  onDesistiu={() => marcarDesistiu(v)}
                  onVeio={() => marcarVeio(v)}
                  onOpenDialer={() => openDialer(v)}
                  onEdit={() => { setEditLead(v); setOpenModal(true); }}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          ABA: AGUARDANDO DATA
      ════════════════════════════════════════════════════════════════════ */}
      {activeTab === "aguardando" && (
        <div className="space-y-4">
          <div className="flex items-start gap-4 p-5 rounded-xl bg-amber-50 border border-amber-200">
            <Clock className="h-6 w-6 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-amber-900 text-sm">
                {aguardando.length} lead{aguardando.length !== 1 ? "s" : ""} aguardando nova data
              </p>
              <p className="text-xs text-amber-700 mt-1">
                Querem comprar mas estão aguardando confirmação de nova data — entre em contato para agendar.
              </p>
            </div>
          </div>

          {aguardando.length === 0 ? (
            <Card className="shadow-card">
              <CardContent className="py-20 text-center">
                <Clock className="h-14 w-14 mx-auto mb-4 text-muted-foreground/20" />
                <p className="font-semibold text-foreground">Nenhum lead aguardando data.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {aguardando.map(v => (
                <SemDataCard
                  key={v.id}
                  pedido={v}
                  onOpenDialer={() => openDialer(v)}
                  onEdit={() => { setEditLead(v); setOpenModal(true); }}
                  onDesistiu={() => marcarDesistiu(v)}
                  onVeio={() => marcarVeio(v)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          ABA: SEM DATA
      ════════════════════════════════════════════════════════════════════ */}
      {activeTab === "sem_data" && (
        <div className="space-y-4">
          {/* Banner de instrução */}
          <div className="flex items-start gap-4 p-5 rounded-xl bg-amber-50 border border-amber-200">
            <CalendarClock className="h-6 w-6 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-amber-900 text-sm">
                {semData.length} pedido{semData.length > 1 ? "s" : ""} sem data definida
              </p>
              <p className="text-xs text-amber-700 mt-1">
                Esses clientes disseram que viriam mas ainda não definiram quando.
                Ligue, confirme a data e clique em <strong>Editar</strong> para registrar o horário.
              </p>
            </div>
          </div>

          {semData.length === 0 ? (
            <Card className="shadow-card">
              <CardContent className="py-20 text-center">
                <CheckCircle2 className="h-14 w-14 mx-auto mb-4 text-emerald-400" />
                <p className="text-foreground font-semibold">Todos com data definida!</p>
                <p className="text-muted-foreground text-sm mt-1">Nenhum pedido sem prazo definido.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {semData.map(v => (
                <SemDataCard
                  key={v.id}
                  pedido={v}
                  onOpenDialer={() => openDialer(v)}
                  onEdit={() => { setEditLead(v); setOpenModal(true); }}
                  onDesistiu={() => marcarDesistiu(v)}
                  onVeio={() => marcarVeio(v)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          ABA: PÓS-PEDIDOA F→N
      ════════════════════════════════════════════════════════════════════ */}
      {activeTab === "pos_pedido" && (
        <div className="space-y-4">
          <div className="flex items-start gap-4 p-5 rounded-xl bg-emerald-50 border border-emerald-200">
            <CheckCircle2 className="h-6 w-6 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-emerald-900 text-sm">
                {posPedido.length} lead{posPedido.length !== 1 ? "s" : ""} em acompanhamento pós-pedido
              </p>
              <p className="text-xs text-emerald-700 mt-1">
                Use os botões para avançar cada lead pela esteira: docs → CPF → crédito → contrato → boleto → recomprou → recomprou.
              </p>
            </div>
          </div>

          {posPedido.length === 0 ? (
            <Card className="shadow-card">
              <CardContent className="py-20 text-center">
                <CheckCircle2 className="h-14 w-14 mx-auto mb-4 text-emerald-400" />
                <p className="text-foreground font-semibold">Nenhum lead em pós-pedido ainda.</p>
                <p className="text-muted-foreground text-sm mt-1">Quando um cliente comprar, ele aparecerá aqui.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {posPedido.map(v => (
                <PosPedidoCard
                  key={v.id}
                  pedido={v}
                  onAvancar={(novoStatus) => avancarPosPedido(v, novoStatus)}
                  onOpenDialer={() => openDialer(v)}
                  onEdit={() => { setEditLead(v); setOpenModal(true); }}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Modal de edição ── */}
      {editLead && (
        <EditPedidoModal
          lead={editLead}
          open={openModal}
          onOpenChange={o => { setOpenModal(o); if (!o) setEditLead(null); }}
          onSaved={load}
        />
      )}
    </div>
  );
}

// ─── Card padrão de pedido ────────────────────────────────────────────────────

function formatPedidoDateWA(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const dias = ["domingo","segunda-feira","terça-feira","quarta-feira","quinta-feira","sexta-feira","sábado"];
  const meses = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
  const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return `${dias[d.getDay()]}, dia ${d.getDate()} de ${meses[d.getMonth()]}, às ${hora}`;
}

function PedidoCard({
  pedido, onStatusChange, onOpenDialer, onEdit, compact = false,
}: {
  pedido: PedidoLead;
  onStatusChange: (v: PedidoLead, s: string) => void;
  onOpenDialer: (v: PedidoLead) => void;
  onEdit: () => void;
  compact?: boolean;
}) {
  const cfg = STATUS_CFG[pedido.status ] ?? STATUS_CFG["pedido"];
  const isUrgent = pedido.status === "retornar" || pedido.status === "nao_atendeu";

  return (
    <Card className={`shadow-card transition-shadow hover:shadow-elegant ${isUrgent ? "border-l-4 border-l-red-400" : ""}`}>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="h-9 w-9 rounded-full bg-accent flex items-center justify-center shrink-0">
              <User className="h-4 w-4 text-accent-foreground" />
            </div>
            <div className="min-w-0">
              <div className="font-semibold text-sm truncate">{pedido.nome}</div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                <Phone className="h-3 w-3" /> {formatPhone(pedido.telefone)}
              </div>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1.5 shrink-0">
            <span className={`inline-flex items-center gap-1 text-[11px] border rounded-full px-2 py-0.5 font-medium ${cfg.badge}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
              {cfg.label}
            </span>
            {pedido.proximo_followup && (
              <span className="text-xs font-mono font-semibold flex items-center gap-1 text-muted-foreground">
                <Clock className="h-3 w-3" /> {formatTime(pedido.proximo_followup)}
              </span>
            )}
          </div>
        </div>
        {pedido.proximo_followup && (
          <div className="text-xs text-muted-foreground flex items-center gap-1.5">
            <CalendarDays className="h-3.5 w-3.5" /> {formatPedidoDate(pedido.proximo_followup)}
          </div>
        )}
        {!compact && pedido.observacoes && (
          <p className="text-xs text-muted-foreground border-t pt-2 line-clamp-2">{pedido.observacoes}</p>
        )}
        <div className="flex flex-wrap gap-1.5 border-t pt-3">
          {PEDIDO_STATUSES.map(s => (
            <button key={s} onClick={() => onStatusChange(pedido, s)}
              className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${
                pedido.status === s
                  ? `${STATUS_CFG[s].badge} font-semibold`
                  : "border-muted text-muted-foreground hover:border-foreground/30"
              }`}
            >
              {STATUS_CFG[s].label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="flex-1 h-8 text-xs" onClick={() => onOpenDialer(pedido)}>
            <PhoneCall className="h-3.5 w-3.5 mr-1.5" /> Discar
          </Button>

          {/* WhatsApp confirmação de pedido */}
          {pedido.proximo_followup && (() => {
            // Primeiro nome válido — ignora prefixos como ".", "-", "•"
            const nome = (() => {
              const parts = pedido.nome.trim().split(/\s+/);
              for (const p of parts) {
                const clean = p.replace(/^[^a-zA-ZÀ-ÿ]+/, "").trim();
                if (clean.length >= 2) return clean.charAt(0).toUpperCase() + clean.slice(1).toLowerCase();
              }
              return parts[0] || pedido.nome;
            })();
            const dataFmt   = formatPedidoDateWA(pedido.proximo_followup);
            const wa        = toWhatsAppNumber(pedido.telefone);
            const MSG_CONFIRMAR   = `Olá ${nome}! Tudo bem? Aqui é da Renata Perfumes 💜 Passando para confirmar seu pedido — previsão ${dataFmt}. Pode confirmar o pagamento pra gente seguir com a separação? 😊`;
            const MSG_LEMBRETE    = `Oi ${nome}! Renata Perfumes aqui. Só um lembrete do seu pedido — ${dataFmt}. Qualquer dúvida sobre pagamento ou entrega é só chamar aqui! 😊`;
            const MSG_RASTREIO    = `📦 Assim que seu pedido for enviado, te mando o código de rastreio por aqui mesmo!`;

            const opcoes = [
              { label: "✅ Confirmar pedido",              text: MSG_CONFIRMAR },
              { label: "🔔 Lembrete de pagamento",         text: MSG_LEMBRETE },
              { label: "📦 Aviso de rastreio",             text: MSG_RASTREIO },
              { label: "✅ + 📦 Confirmar + rastreio",      text: `${MSG_CONFIRMAR}\n\n${MSG_RASTREIO}` },
            ];

            const [open, setOpen] = React.useState(false);

            function abrirWeb(text: string) { window.open(`https://web.whatsapp.com/send?phone=${wa}&text=${encodeURIComponent(text)}`, "_blank"); setOpen(false); }
            function abrirApp(text: string) { window.open(`https://wa.me/${wa}?text=${encodeURIComponent(text)}`, "_blank"); setOpen(false); }

            return (
              <div className="relative">
                <button onClick={() => setOpen(v => !v)}
                  className="h-8 w-8 flex items-center justify-center rounded-lg border border-green-200 bg-green-50 hover:bg-green-100 transition-colors shrink-0"
                  title="WhatsApp — confirmar pedido">
                  <MessageSquare className="h-3.5 w-3.5 text-green-600"/>
                </button>

                {open && (
                  <div className="absolute bottom-full mb-1 right-0 z-50 bg-popover border rounded-xl shadow-lg overflow-hidden w-64">
                    <div className="px-3 py-2 border-b bg-green-50 flex items-center justify-between">
                      <p className="text-[10px] font-bold text-green-700 uppercase tracking-wide">📱 WhatsApp</p>
                      <div className="flex gap-1 text-[9px] font-semibold">
                        <span className="bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">💻 Web</span>
                        <span className="bg-green-100 text-green-700 px-1.5 py-0.5 rounded">📱 App</span>
                      </div>
                    </div>
                    {opcoes.map(m => (
                      <div key={m.label} className="flex items-center border-b last:border-0 hover:bg-muted/30 transition-colors">
                        <span className="flex-1 px-2.5 py-2 text-[10px] font-medium leading-tight">{m.label}</span>
                        <div className="flex border-l shrink-0">
                          <button onClick={() => abrirWeb(m.text)}
                            className="px-2.5 py-2 text-[10px] font-bold text-blue-600 hover:bg-blue-50 transition-colors border-r">
                            💻
                          </button>
                          <button onClick={() => abrirApp(m.text)}
                            className="px-2.5 py-2 text-[10px] font-bold text-green-600 hover:bg-green-50 transition-colors">
                            📱
                          </button>
                        </div>
                      </div>
                    ))}
                    <button onClick={() => setOpen(false)}
                      className="w-full px-3 py-1.5 text-[10px] text-muted-foreground hover:bg-muted transition-colors">
                      Fechar
                    </button>
                  </div>
                )}
              </div>
            );
          })()}

          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={onEdit} title="Editar">
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Card de Recuperação (não pagou) ─────────────────────────────────────

function RecuperacaoCard({
  pedido, onNaoVeio, onRemarcou, onDesistiu, onVeio, onOpenDialer, onEdit,
}: {
  pedido: PedidoLead;
  onNaoVeio: () => void;
  onRemarcou: (data: string) => void;
  onDesistiu: () => void;
  onVeio: () => void;
  onOpenDialer: () => void;
  onEdit: () => void;
}) {
  const waMsg = encodeURIComponent(
    `Boa tarde, ${pedido.nome.split(" ")[0]}! Aqui é da Renata Perfumes 💜 Vi que o pagamento do seu pedido ainda não foi confirmado. Tudo bem? Ainda tem interesse na fragrância? Posso te ajudar a fechar!`
  );
  const waUrl = `https://wa.me/${toWhatsAppNumber(pedido.telefone)}?text=${waMsg}`;

  const pedidoFoi = pedido.proximo_followup
    ? new Date(pedido.proximo_followup).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" })
    + " às " + new Date(pedido.proximo_followup).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    : "Data não registrada";

  return (
    <Card className="shadow-card border-l-4 border-l-red-400 hover:shadow-elegant transition-shadow">
      <CardContent className="p-4 space-y-3">
        {/* Topo */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-3 min-w-0">
            <div className="h-9 w-9 rounded-full bg-red-100 flex items-center justify-center shrink-0 text-red-600 font-bold text-sm">
              {pedido.nome[0]}
            </div>
            <div className="min-w-0">
              <div className="font-semibold text-sm truncate">{pedido.nome}</div>
              <div className="text-xs text-muted-foreground">{formatPhone(pedido.telefone)}</div>
            </div>
          </div>
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-red-100 text-red-700 border border-red-200 shrink-0">
            Não pagou
          </span>
        </div>

        {/* Quando era o prazo do pedido */}
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/40 rounded px-2 py-1.5">
          <CalendarDays className="h-3 w-3 shrink-0" />
          <span>Pedido era: <strong className="text-foreground">{pedidoFoi}</strong></span>
        </div>

        {/* Observações */}
        {pedido.observacoes && (
          <p className="text-xs text-muted-foreground line-clamp-2 bg-muted/30 rounded px-2 py-1">
            {pedido.observacoes}
          </p>
        )}

        {/* 3 variantes de resolução */}
        <div className="space-y-2 pt-1">
          {/* Veio! */}
          <button onClick={onVeio}
            className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 transition-colors">
            <CheckCircle2 className="h-3.5 w-3.5" /> ✅ Veio! Marcar como entregue
          </button>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={onNaoVeio}
              className="flex items-center justify-center gap-1.5 py-2 rounded-lg bg-amber-50 border border-amber-200 text-xs font-semibold text-amber-700 hover:bg-amber-100 transition-colors">
              <RotateCcw className="h-3.5 w-3.5" /> 🚫 Não veio
            </button>
            <button onClick={onDesistiu}
              className="flex items-center justify-center gap-1.5 py-2 rounded-lg bg-gray-50 border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-100 transition-colors">
              <XCircle className="h-3.5 w-3.5" /> Desistiu
            </button>
          </div>
          {/* Remarcou — com seletor de data inline */}
          <RemarcarForm onConfirm={onRemarcou} />
        </div>

        {/* Contato */}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={onOpenDialer}
            className="flex items-center justify-center gap-1.5 py-2 rounded-lg bg-primary/10 border border-primary/20 text-xs font-medium text-primary hover:bg-primary/20 transition-colors"
          >
            <Phone className="h-3.5 w-3.5" /> Ligar
          </button>
          <a
            href={waUrl} target="_blank" rel="noopener noreferrer"
            className="flex items-center justify-center gap-1.5 py-2 rounded-lg bg-green-50 border border-green-200 text-xs font-medium text-green-700 hover:bg-green-100 transition-colors"
          >
            <MessageSquare className="h-3.5 w-3.5" /> WhatsApp
          </a>
        </div>

        <button onClick={onEdit} className="w-full flex items-center justify-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors">
          <Pencil className="h-3 w-3" /> Editar data / observações
        </button>
      </CardContent>
    </Card>
  );
}

// ─── Card Sem Data ────────────────────────────────────────────────────────────

function SemDataCard({
  pedido, onOpenDialer, onEdit, onPerdido,
}: {
  pedido: PedidoLead;
  onOpenDialer: () => void;
  onEdit: () => void;
  onPerdido: () => void;
}) {
  // Nome limpo
  const nomeSD = (() => {
    const parts = pedido.nome.trim().split(/\s+/);
    for (const p of parts) {
      const clean = p.replace(/^[^a-zA-ZÀ-ÿ]+/, "").trim();
      if (clean.length >= 2) return clean.charAt(0).toUpperCase() + clean.slice(1).toLowerCase();
    }
    return pedido.nome;
  })();

  const waSD = toWhatsAppNumber(pedido.telefone);

  const MSG_FECHAR      = `Olá ${nomeSD}! Tudo bem? Aqui é da Renata Perfumes 💜 Você demonstrou interesse em uma fragrância. Posso te ajudar a fechar o pedido? Consigo já separar pra você!`;
  const MSG_RELEMBRAR   = `Oi ${nomeSD}! Renata Perfumes aqui. Ainda estou com aquela fragrância separada pra você! Fecha comigo essa semana? 💜`;

  const opcoesSD = [
    { label: "🛒 Fechar pedido",               text: MSG_FECHAR },
    { label: "🔔 Relembrar interesse",         text: MSG_RELEMBRAR },
  ];

  const [openWaSD, setOpenWaSD] = React.useState(false);
  function abrirWebSD(text: string) { window.open(`https://web.whatsapp.com/send?phone=${waSD}&text=${encodeURIComponent(text)}`, "_blank"); setOpenWaSD(false); }
  function abrirAppSD(text: string) { window.open(`https://wa.me/${waSD}?text=${encodeURIComponent(text)}`, "_blank"); setOpenWaSD(false); }

  return (
    <Card className="shadow-card border-l-4 border-l-amber-400 hover:shadow-elegant transition-shadow">
      <CardContent className="p-4 space-y-3">
        {/* Topo */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-3 min-w-0">
            <div className="h-9 w-9 rounded-full bg-amber-100 flex items-center justify-center shrink-0 text-amber-700 font-bold text-sm">
              {pedido.nome[0]}
            </div>
            <div className="min-w-0">
              <div className="font-semibold text-sm truncate">{pedido.nome}</div>
              <div className="text-xs text-muted-foreground">{formatPhone(pedido.telefone)}</div>
              {pedido.origem && <div className="text-[10px] text-muted-foreground/70">Origem: {pedido.origem}</div>}
            </div>
          </div>
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 border border-amber-200 shrink-0">
            Sem data
          </span>
        </div>

        {/* Status */}
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/40 rounded px-2 py-1.5">
          <span className={`h-2 w-2 rounded-full ${STATUS_CFG[pedido.status]?.dot ?? "bg-gray-400"}`} />
          {STATUS_CFG[pedido.status]?.label ?? pedido.status}
          <span className="ml-auto text-amber-600 font-medium">Aguardando confirmação de data</span>
        </div>

        {/* Observações */}
        {pedido.observacoes && (
          <p className="text-xs text-muted-foreground line-clamp-2 bg-muted/30 rounded px-2 py-1">
            {pedido.observacoes}
          </p>
        )}

        {/* Ações */}
        <div className="flex gap-2 pt-1">
          <button onClick={onOpenDialer}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-primary/10 border border-primary/20 text-xs font-semibold text-primary hover:bg-primary/20 transition-colors">
            <Phone className="h-3.5 w-3.5" /> Ligar
          </button>

          {/* WhatsApp dropdown */}
          <div className="relative">
            <button onClick={() => setOpenWaSD(v => !v)}
              className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-green-50 border border-green-200 text-xs font-medium text-green-700 hover:bg-green-100 transition-colors">
              <MessageSquare className="h-3.5 w-3.5" /> WhatsApp
            </button>
            {openWaSD && (
              <div className="absolute bottom-full mb-1 right-0 z-50 bg-popover border rounded-xl shadow-lg overflow-hidden w-64">
                <div className="px-3 py-2 border-b bg-green-50 flex items-center justify-between">
                  <p className="text-[10px] font-bold text-green-700 uppercase tracking-wide">📱 WhatsApp</p>
                  <div className="flex gap-1 text-[9px] font-semibold">
                    <span className="bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">💻 Web</span>
                    <span className="bg-green-100 text-green-700 px-1.5 py-0.5 rounded">📱 App</span>
                  </div>
                </div>
                {opcoesSD.map(m => (
                  <div key={m.label} className="flex items-center border-b last:border-0 hover:bg-muted/30 transition-colors">
                    <span className="flex-1 px-2.5 py-2 text-[10px] font-medium leading-tight">{m.label}</span>
                    <div className="flex border-l shrink-0">
                      <button onClick={() => abrirWebSD(m.text)}
                        className="px-2.5 py-2 text-[10px] font-bold text-blue-600 hover:bg-blue-50 transition-colors border-r">
                        💻
                      </button>
                      <button onClick={() => abrirAppSD(m.text)}
                        className="px-2.5 py-2 text-[10px] font-bold text-green-600 hover:bg-green-50 transition-colors">
                        📱
                      </button>
                    </div>
                  </div>
                ))}
                <button onClick={() => setOpenWaSD(false)}
                  className="w-full px-3 py-1.5 text-[10px] text-muted-foreground hover:bg-muted transition-colors">
                  Fechar
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={onEdit}
            className="flex items-center justify-center gap-1.5 py-2 rounded-lg bg-blue-50 border border-blue-200 text-xs font-medium text-blue-700 hover:bg-blue-100 transition-colors"
          >
            <Pencil className="h-3.5 w-3.5" /> Definir data
          </button>
          <button
            onClick={onPerdido}
            className="flex items-center justify-center gap-1.5 py-2 rounded-lg bg-gray-50 border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <XCircle className="h-3.5 w-3.5" /> Perdido
          </button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Modal de edição ──────────────────────────────────────────────────────────

function EditPedidoModal({
  lead, open, onOpenChange, onSaved,
}: {
  lead: PedidoLead;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSaved: () => void;
}) {
  const [followup, setFollowup] = useState(toDatetimeLocal(lead.proximo_followup));
  const [status, setStatus]     = useState(lead.status ?? "pedido_confirmado");
  const [obs, setObs]           = useState(lead.observacoes ?? "");
  const [saving, setSaving]     = useState(false);

  useEffect(() => {
    setFollowup(toDatetimeLocal(lead.proximo_followup));
    setStatus((lead.status ) ?? "pedido");
    setObs(lead.observacoes ?? "");
  }, [lead]);

  async function save() {
    setSaving(true);
    const followupISO = followup ? new Date(followup).toISOString() : null;
    const { error } = await supabase.from("leads").update({
      status: status as any,
      proximo_followup: followupISO,
      observacoes: obs.trim() || null,
    }).eq("id", lead.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Pedido atualizada");
    onOpenChange(false);
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Editar pedido — {lead.nome}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Phone className="h-4 w-4" /> {formatPhone(lead.telefone)}
          </div>
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={status} onValueChange={v => setStatus(v )}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PEDIDO_STATUSES.map(s => (
                  <SelectItem key={s} value={s}>{STATUS_CFG[s].label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Prazo previsto do pedido</Label>
            <Input type="datetime-local" value={followup} onChange={e => setFollowup(e.target.value)} />
            <p className="text-xs text-muted-foreground">
              Este campo é o <code>proximo_followup</code> do lead — aparece no discador.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>Observações</Label>
            <Textarea value={obs} onChange={e => setObs(e.target.value)} rows={3} maxLength={500}
              placeholder="Preferências de fragrância, forma de pagamento, ponto de contato..." />
          </div>
          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button className="flex-1" onClick={save} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Card Pós-Pedido (F→N) ────────────────────────────────────────────────────
function PosPedidoCard({
  pedido, onAvancar, onOpenDialer, onEdit,
}: {
  pedido: PedidoLead;
  onAvancar: (novoStatus: string) => void;
  onOpenDialer: () => void;
  onEdit: () => void;
}) {
  const stageKey = FUNNEL_STAGE[pedido.status];
  const stage = stageKey ? FUNNEL_STAGES.find(s => s.key === stageKey) : null;
  const outcomes = stageKey ? (OUTCOMES_BY_STAGE[stageKey] ?? []) : [];
  const positives = outcomes.filter(o => o.type === "positive");
  const neutrals  = outcomes.filter(o => o.type === "neutral");
  const negatives = outcomes.filter(o => o.type === "negative");

  const btnBase = "flex-1 py-1.5 rounded-lg text-xs font-semibold border transition-all text-center";

  return (
    <Card className="shadow-card hover:shadow-elegant transition-shadow">
      <CardContent className="p-4 space-y-3">
        {/* Topo */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-3 min-w-0">
            <div className="h-9 w-9 rounded-full flex items-center justify-center shrink-0 font-bold text-sm"
              style={{ backgroundColor: stage?.light ?? "#f1f5f9", color: stage?.color ?? "#94a3b8" }}>
              {stageKey ?? "F"}
            </div>
            <div className="min-w-0">
              <div className="font-semibold text-sm truncate">{pedido.nome}</div>
              <div className="text-xs text-muted-foreground">{formatPhone(pedido.telefone)}</div>
            </div>
          </div>
          {stage && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0"
              style={{ backgroundColor: stage.light, color: stage.color, borderColor: stage.color + "40" }}>
              {stage.emoji} {stage.key} · {stage.label}
            </span>
          )}
        </div>

        {/* Status atual */}
        <div className="text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-2">
          <span className="font-medium text-foreground">{STATUS_LABELS[pedido.status] ?? pedido.status}</span>
          {pedido.proximo_followup && (
            <span className="ml-2 text-muted-foreground/70">
              · {new Date(pedido.proximo_followup).toLocaleDateString("pt-BR", { day:"2-digit", month:"2-digit" })}
            </span>
          )}
        </div>

        {pedido.observacoes && (
          <p className="text-xs text-muted-foreground line-clamp-2">{pedido.observacoes}</p>
        )}

        {/* Botões contextuais pela etapa */}
        {positives.length > 0 && (
          <div>
            <div className="text-[10px] uppercase tracking-widest text-emerald-600 font-semibold mb-1.5">✅ Avançar</div>
            <div className="flex gap-1.5 flex-wrap">
              {positives.map(o => (
                <button key={o.outcome} onClick={() => onAvancar(STATUS_FROM_OUTCOME[o.outcome] ?? o.outcome)}
                  className={`${btnBase} bg-emerald-500/10 text-emerald-700 border-emerald-200 hover:bg-emerald-500/20`}>
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {neutrals.length > 0 && (
          <div>
            <div className="text-[10px] uppercase tracking-widest text-amber-600 font-semibold mb-1.5">⏳ Aguardando</div>
            <div className="flex gap-1.5 flex-wrap">
              {neutrals.filter(o => o.outcome !== "nao_atendeu").map(o => (
                <button key={o.outcome} onClick={() => onAvancar(STATUS_FROM_OUTCOME[o.outcome] ?? o.outcome)}
                  className={`${btnBase} bg-amber-500/10 text-amber-700 border-amber-200 hover:bg-amber-500/20`}>
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {negatives.length > 0 && (
          <div>
            <div className="text-[10px] uppercase tracking-widest text-rose-600 font-semibold mb-1.5">❌ Encerrado</div>
            <div className="flex gap-1.5 flex-wrap">
              {negatives.map(o => (
                <button key={o.outcome} onClick={() => onAvancar(STATUS_FROM_OUTCOME[o.outcome] ?? o.outcome)}
                  className={`${btnBase} bg-rose-500/10 text-rose-700 border-rose-200 hover:bg-rose-500/20`}>
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Ações */}
        <div className="flex gap-2 pt-1">
          <Button size="sm" variant="outline" className="flex-1 h-8 text-xs" onClick={onOpenDialer}>
            <PhoneCall className="h-3.5 w-3.5 mr-1.5" /> Discar
          </Button>
          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={onEdit} title="Editar">
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}