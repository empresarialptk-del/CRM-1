import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  LEAD_STATUS_LABELS, LEAD_STATUS_COLOR, LEAD_STATUSES, LEAD_STATUS_LOST,
  LEAD_FUNNEL_COLUMNS, getLeadFunnelColumn,
  MENSAGEM_CATEGORIA_LABELS, MENSAGEM_CATEGORIA_EMOJI,
  MENSAGEM_STATUS_CONTATO_ORDER, MENSAGEM_STATUS_CONTATO_LABELS, MENSAGEM_STATUS_CONTATO_COLOR, MENSAGEM_STATUS_CONTATO_EMOJI,
  TICKET_TIER_LABELS, TICKET_TIER_COLOR, TICKET_TIER_EMOJI, classifyTicketTier, summarizeCompras,
  PEDIDO_STATUS_PAGAMENTO_ORDER, PEDIDO_STATUS_PAGAMENTO_LABELS, PEDIDO_STATUS_PAGAMENTO_COLOR, PEDIDO_STATUS_PAGAMENTO_EMOJI,
  PEDIDO_STATUS_ENTREGA_ORDER, PEDIDO_STATUS_ENTREGA_LABELS, PEDIDO_STATUS_ENTREGA_COLOR, PEDIDO_STATUS_ENTREGA_EMOJI,
  FORMAS_PAGAMENTO, summarizePedido,
  formatPhone, formatCurrency, type MensagemCategoria, type MensagemStatusContato,
  type PedidoStatusPagamento, type PedidoStatusEntrega,
} from "@/lib/crm";
import { calcLeadScore, scoreLabel } from "@/lib/leadScore";
import { loadProfile } from "@/lib/profile";
import {
  ArrowLeft, Phone, MessageCircle, CalendarDays,
  Pencil, Save, X, Award, CalendarClock,
  ChevronRight, ArrowRight, Trophy, AlertTriangle, History, RotateCcw,
  FileText, ShieldCheck, UserCircle2, UserPlus, ShoppingBag, Plus, Trash2,
} from "lucide-react";
import { toast } from "sonner";

// ── Tipos ─────────────────────────────────────────────────────────────────────
type Lead = {
  id: string; nome: string; telefone: string; status: string;
  observacoes: string | null; origem: string | null;
  proximo_followup: string | null; created_at: string; updated_at: string;
  list_id: string | null; assigned_to: string | null;
};

type Mensagem = {
  id: string; categoria: MensagemCategoria; texto: string;
  status_contato: MensagemStatusContato; observacao: string | null; enviada_em: string;
};

type Profile = { id: string; full_name: string };
type Compra = { id: string; produto: string; quantidade: number; valor: number; custo: number; origem: string; data_compra: string; pedido_id: string | null };
type Pedido = {
  id: string; numero: number; status_pagamento: PedidoStatusPagamento; status_entrega: PedidoStatusEntrega;
  forma_pagamento: string | null; desconto: number; frete: number; endereco_entrega: string | null;
  observacoes: string | null; vendedor_id: string | null; created_at: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function toDatetimeLocal(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toWhatsAppNumber(tel: string): string {
  let d = tel.replace(/\D/g, "");
  if (d.startsWith("0")) d = d.slice(1);
  if (!d.startsWith("55")) d = "55" + d;
  return d;
}

function cleanName(nome: string): string {
  const parts = (nome ?? "").trim().split(/\s+/);
  for (const p of parts) {
    const c = p.replace(/^[^a-zA-ZÀ-ÿ]+/, "").trim();
    if (c.length >= 2) return c;
  }
  return parts[0] ?? nome;
}

function initials(name: string): string {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

type Audit = {
  id: string;
  campo: string;
  valor_anterior: string | null;
  valor_novo: string | null;
  alterado_em: string;
};

// Labels amigáveis para os campos
const CAMPO_LABELS: Record<string, string> = {
  status:           "Status",
  observacoes:      "Observações",
  proximo_followup: "Próximo follow-up",
  nome:             "Nome",
  telefone:         "Telefone",
  origem:           "Origem",
  list_id:          "Lista",
};

// ── Componente principal ──────────────────────────────────────────────────────
export default function LeadDetail() {
  const { id }     = useParams<{ id: string }>();
  const navigate   = useNavigate();
  const { user }   = useAuth();

  const [lead, setLead]       = useState<Lead | null>(null);
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [profiles, setProfiles]   = useState<Profile[]>([]);
  const [compras, setCompras]     = useState<Compra[]>([]);
  const [pedidos, setPedidos]     = useState<Pedido[]>([]);
  const [showNewPedido, setShowNewPedido] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing]   = useState(false);
  const [saving, setSaving]     = useState(false);
  const [audits, setAudits]     = useState<Audit[]>([]);
  const [activeTab, setActiveTab] = useState<"mensagens" | "auditoria">("mensagens");
  const [reverting, setReverting] = useState<string | null>(null);

  // Form
  const [editNome, setEditNome]         = useState("");
  const [editTel, setEditTel]           = useState("");
  const [editStatus, setEditStatus]     = useState("");
  const [editObs, setEditObs]           = useState("");
  const [editFollowup, setEditFollowup] = useState("");
  const [editOrigem, setEditOrigem]     = useState("");

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const [{ data: leadData }, { data: msgData }, { data: auditData }, { data: profilesData }, { data: comprasData }, { data: pedidosData }] = await Promise.all([
      supabase.from("leads").select("*").eq("id", id).single(),
      supabase.from("mensagens")
        .select("id,categoria,texto,status_contato,observacao,enviada_em")
        .eq("lead_id", id)
        .order("enviada_em", { ascending: false }),
      supabase.from("lead_audit")
        .select("id,campo,valor_anterior,valor_novo,alterado_em")
        .eq("lead_id", id)
        .order("alterado_em", { ascending: false })
        .limit(100),
      supabase.from("profiles").select("id,full_name").order("full_name", { ascending: true }),
      supabase.from("compras")
        .select("id,produto,quantidade,valor,custo,origem,data_compra,pedido_id")
        .eq("lead_id", id)
        .order("data_compra", { ascending: false }),
      supabase.from("pedidos")
        .select("id,numero,status_pagamento,status_entrega,forma_pagamento,desconto,frete,endereco_entrega,observacoes,vendedor_id,created_at")
        .eq("lead_id", id)
        .order("created_at", { ascending: false }),
    ]);
    if (leadData) {
      setLead(leadData as Lead);
      setEditNome(leadData.nome);
      setEditTel(leadData.telefone);
      setEditStatus(leadData.status);
      setEditObs(leadData.observacoes ?? "");
      setEditFollowup(toDatetimeLocal(leadData.proximo_followup));
      setEditOrigem(leadData.origem ?? "");
    }
    setMensagens((msgData ?? []) as Mensagem[]);
    setAudits((auditData ?? []) as Audit[]);
    setCompras((comprasData ?? []) as Compra[]);
    setPedidos((pedidosData ?? []) as Pedido[]);
    setProfiles((profilesData ?? []) as Profile[]);
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // ── Salvar edição completa ────────────────────────────────────────────────
  async function saveLead() {
    if (!lead || !user) return;
    setSaving(true);

    // ── Anti-regressão: status só avança no funil ──────────────────────────
    const currentIdx = LEAD_FUNNEL_COLUMNS.findIndex(c => c.statuses.includes(lead.status as any));
    const newIdx     = LEAD_FUNNEL_COLUMNS.findIndex(c => c.statuses.includes(editStatus as any));
    const isLostCurrent = LEAD_STATUS_LOST.includes(lead.status as any);
    const isLostNew     = LEAD_STATUS_LOST.includes(editStatus as any);

    if (!isLostNew && !isLostCurrent && currentIdx >= 0 && newIdx >= 0 && newIdx < currentIdx) {
      toast.error(`⚠ Não é possível regredir de ${LEAD_STATUS_LABELS[lead.status as keyof typeof LEAD_STATUS_LABELS] ?? lead.status} para ${LEAD_STATUS_LABELS[editStatus as keyof typeof LEAD_STATUS_LABELS] ?? editStatus}. O funil só avança.`);
      setSaving(false);
      return;
    }

    const { error } = await supabase.from("leads").update({
      nome:             editNome.trim(),
      telefone:         editTel.trim(),
      status:           editStatus as any,
      observacoes:      editObs.trim() || null,
      proximo_followup: editFollowup ? new Date(editFollowup).toISOString() : null,
      origem:           editOrigem.trim() || null,
    }).eq("id", lead.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Lead atualizado!");
    setEditing(false);
    load();
  }

  // ── Reverter uma mudança de auditoria ───────────────────────────────────
  async function revertAudit(audit: Audit) {
    if (!lead) return;
    setReverting(audit.id);
    const patch: Record<string, string | null> = {
      [audit.campo]: audit.valor_anterior,
    };
    if (audit.campo === "proximo_followup") {
      patch[audit.campo] = audit.valor_anterior ?? null;
    }
    const { error } = await supabase.from("leads")
      .update(patch)
      .eq("id", lead.id);
    setReverting(null);
    if (error) { toast.error(error.message); return; }
    toast.success(`↩ ${CAMPO_LABELS[audit.campo] ?? audit.campo} revertido`);
    load();
  }

  // ── Avançar status rapidamente ───────────────────────────────────────────
  async function advanceStatus(novoStatus: string) {
    if (!lead) return;
    const prev = lead.status;
    setLead(l => l ? { ...l, status: novoStatus } : l);
    const { error } = await supabase.from("leads")
      .update({ status: novoStatus as any })
      .eq("id", lead.id);
    if (error) {
      toast.error(error.message);
      setLead(l => l ? { ...l, status: prev } : l);
    } else {
      toast.success(`✅ ${cleanName(lead.nome)} → ${LEAD_STATUS_LABELS[novoStatus as keyof typeof LEAD_STATUS_LABELS] ?? novoStatus}`);
    }
  }

  async function assignLead(userId: string | null) {
    if (!lead) return;
    const prev = lead.assigned_to;
    setLead(l => l ? { ...l, assigned_to: userId } : l);
    const { error } = await supabase.from("leads").update({ assigned_to: userId }).eq("id", lead.id);
    if (error) { toast.error(error.message); setLead(l => l ? { ...l, assigned_to: prev } : l); return; }
    toast.success(userId ? `Atribuído a ${profiles.find(p => p.id === userId)?.full_name || "atendente"}` : "Atribuição removida");
  }

  async function setMsgStatusContato(msg: Mensagem, status_contato: MensagemStatusContato) {
    if (msg.status_contato === status_contato) return;
    const { error } = await supabase.from("mensagens").update({ status_contato }).eq("id", msg.id);
    if (error) { toast.error(error.message); return; }
    setMensagens(prev => prev.map(m => m.id === msg.id ? { ...m, status_contato } : m));
  }

  // Avança lead.status quando um pedido é pago/entregue — nunca regride nem reativa perdido.
  async function syncLeadStatusFromPedido(statusPagamento: PedidoStatusPagamento, statusEntrega: PedidoStatusEntrega) {
    if (!lead) return;
    const targetStatus = statusEntrega === "entregue" ? "entregue" : statusPagamento === "pago" ? "pago" : null;
    if (!targetStatus) return;
    if (LEAD_STATUS_LOST.includes(lead.status as any)) return;
    const currentIdx = LEAD_FUNNEL_COLUMNS.findIndex(c => c.statuses.includes(lead.status as any));
    const targetIdx  = LEAD_FUNNEL_COLUMNS.findIndex(c => c.statuses.includes(targetStatus as any));
    if (targetIdx <= currentIdx) return;
    await advanceStatus(targetStatus);
  }

  async function createPedido(input: {
    itens: { produto: string; quantidade: number; valor: number; custo: number }[];
    forma_pagamento: string; desconto: number; frete: number; endereco_entrega: string; observacoes: string;
    origem: string; status_pagamento: PedidoStatusPagamento; status_entrega: PedidoStatusEntrega;
  }) {
    if (!lead || !user) return;
    const validItens = input.itens.filter(i => i.produto.trim() && i.valor > 0);
    if (validItens.length === 0) { toast.error("Adicione ao menos um item com produto e valor."); return; }

    const { data: pedido, error } = await supabase.from("pedidos").insert({
      lead_id: lead.id, vendedor_id: user.id, criado_por: user.id,
      status_pagamento: input.status_pagamento, status_entrega: input.status_entrega,
      forma_pagamento: input.forma_pagamento || null, desconto: input.desconto, frete: input.frete,
      endereco_entrega: input.endereco_entrega || null, observacoes: input.observacoes || null,
    }).select("id,numero,status_pagamento,status_entrega,forma_pagamento,desconto,frete,endereco_entrega,observacoes,vendedor_id,created_at").single();
    if (error) { toast.error(error.message); return; }

    const now = new Date().toISOString();
    const { data: itensData, error: itensErr } = await supabase.from("compras").insert(
      validItens.map(i => ({
        lead_id: lead.id, pedido_id: pedido!.id, produto: i.produto.trim(),
        quantidade: i.quantidade, valor: i.valor, custo: i.custo, origem: input.origem, data_compra: now,
      }))
    ).select("id,produto,quantidade,valor,custo,origem,data_compra,pedido_id");
    if (itensErr) { toast.error(itensErr.message); return; }

    setPedidos(prev => [pedido as Pedido, ...prev]);
    setCompras(prev => [...((itensData ?? []) as Compra[]), ...prev]);
    setShowNewPedido(false);
    toast.success(`Pedido #${pedido!.numero} criado`);
    await syncLeadStatusFromPedido(input.status_pagamento, input.status_entrega);
  }

  async function setPedidoStatusPagamento(pedido: Pedido, status_pagamento: PedidoStatusPagamento) {
    if (status_pagamento === pedido.status_pagamento) return;
    const { error } = await supabase.from("pedidos").update({ status_pagamento }).eq("id", pedido.id);
    if (error) { toast.error(error.message); return; }
    setPedidos(prev => prev.map(p => p.id === pedido.id ? { ...p, status_pagamento } : p));
    toast.success(`Pedido #${pedido.numero} → ${PEDIDO_STATUS_PAGAMENTO_LABELS[status_pagamento]}`);
    await syncLeadStatusFromPedido(status_pagamento, pedido.status_entrega);
  }

  async function setPedidoStatusEntrega(pedido: Pedido, status_entrega: PedidoStatusEntrega) {
    if (status_entrega === pedido.status_entrega) return;
    const { error } = await supabase.from("pedidos").update({ status_entrega }).eq("id", pedido.id);
    if (error) { toast.error(error.message); return; }
    setPedidos(prev => prev.map(p => p.id === pedido.id ? { ...p, status_entrega } : p));
    toast.success(`Pedido #${pedido.numero} → ${PEDIDO_STATUS_ENTREGA_LABELS[status_entrega]}`);
    await syncLeadStatusFromPedido(pedido.status_pagamento, status_entrega);
  }

  // ── Computados ────────────────────────────────────────────────────────────
  const totalMensagens = mensagens.length;
  const respondidas    = mensagens.filter(m => m.status_contato === "respondida").length;
  const taxaResposta   = totalMensagens > 0 ? Math.round((respondidas / totalMensagens) * 100) : 0;
  const lastMsg         = mensagens[0] ?? null;

  const compraResumo = summarizeCompras(compras);
  const ticketTier    = classifyTicketTier(compraResumo.ticketMedio, loadProfile());
  const itensByPedido = new Map<string, Compra[]>();
  for (const c of compras) {
    if (!c.pedido_id) continue;
    const arr = itensByPedido.get(c.pedido_id) ?? [];
    arr.push(c);
    itensByPedido.set(c.pedido_id, arr);
  }

  const score = lead ? calcLeadScore({
    callCount:     totalMensagens,
    positiveCount: respondidas,
    status:        lead.status,
    hasFollowup:   !!lead.proximo_followup,
  }) : 0;
  const sl = scoreLabel(score);

  const funnelCol = lead ? getLeadFunnelColumn(lead.status) : undefined;
  const isLost    = lead ? LEAD_STATUS_LOST.includes(lead.status as any) : false;
  const canAdvance = funnelCol ? LEAD_FUNNEL_COLUMNS.findIndex(c => c.key === funnelCol.key) < LEAD_FUNNEL_COLUMNS.length - 1 : false;
  const nextCol = funnelCol ? LEAD_FUNNEL_COLUMNS[LEAD_FUNNEL_COLUMNS.findIndex(c => c.key === funnelCol.key) + 1] : null;
  const assignee = lead?.assigned_to ? profiles.find(p => p.id === lead.assigned_to) : null;

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="p-8 max-w-5xl mx-auto space-y-4">
      {[1,2,3].map(i => <div key={i} className="h-24 bg-muted animate-pulse rounded-xl"/>)}
    </div>
  );

  if (!lead) return (
    <div className="p-8 text-center">
      <p className="text-muted-foreground">Lead não encontrado.</p>
      <Button variant="outline" onClick={() => navigate(-1)} className="mt-4">Voltar</Button>
    </div>
  );

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-4 flex-wrap">
        <button onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4"/> Voltar
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="font-display font-bold text-2xl truncate">{lead.nome}</h1>
            {funnelCol && !isLost && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-bold border"
                style={{ backgroundColor: funnelCol.light, color: funnelCol.color, borderColor: funnelCol.color + "40" }}>
                {funnelCol.emoji} {funnelCol.label}
              </span>
            )}
            {isLost && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-bold bg-red-50 text-red-600 border border-red-200">
                ❌ Perdido
              </span>
            )}
            {lastMsg && (
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${MENSAGEM_STATUS_CONTATO_COLOR[lastMsg.status_contato]}`}>
                {MENSAGEM_STATUS_CONTATO_EMOJI[lastMsg.status_contato]} {MENSAGEM_STATUS_CONTATO_LABELS[lastMsg.status_contato]}
              </span>
            )}
          </div>
          <p className="text-muted-foreground text-sm mt-0.5">
            Lead desde {new Date(lead.created_at).toLocaleDateString("pt-BR", { day:"2-digit", month:"long", year:"numeric" })}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={() => navigate(`/dialer?lead=${lead.id}`)}>
            <MessageCircle className="h-4 w-4 mr-2"/> Enviar mensagem
          </Button>
          <Button variant={editing ? "destructive" : "outline"} onClick={() => setEditing(e => !e)}>
            {editing ? <><X className="h-4 w-4 mr-2"/> Cancelar</> : <><Pencil className="h-4 w-4 mr-2"/> Editar</>}
          </Button>
          {editing && (
            <Button onClick={saveLead} disabled={saving}>
              <Save className="h-4 w-4 mr-2"/> {saving ? "Salvando…" : "Salvar"}
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-5">

        {/* ── Coluna principal ─────────────────────────────────────────── */}
        <div className="space-y-4">

          {/* ── Info do lead ──────────────────────────────────────────── */}
          <Card className="shadow-card">
            <CardContent className="p-5">
              {editing ? (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Nome</Label>
                    <Input value={editNome} onChange={e => setEditNome(e.target.value)}/>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Telefone</Label>
                    <Input value={editTel} onChange={e => setEditTel(e.target.value)}/>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Status</Label>
                    <Select value={editStatus} onValueChange={setEditStatus}>
                      <SelectTrigger><SelectValue/></SelectTrigger>
                      <SelectContent className="max-h-72">
                        {LEAD_STATUSES.filter(s => !LEAD_STATUS_LOST.includes(s)).map(s => (
                          <SelectItem key={s} value={s}>{LEAD_STATUS_LABELS[s]}</SelectItem>
                        ))}
                        <div className="px-2 py-1 text-[10px] font-bold text-muted-foreground uppercase tracking-wider mt-1">Perdidos</div>
                        {LEAD_STATUS_LOST.map(s => <SelectItem key={s} value={s}>{LEAD_STATUS_LABELS[s]}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Origem</Label>
                    <Input value={editOrigem} onChange={e => setEditOrigem(e.target.value)} placeholder="ex: manual, site, indicação…"/>
                  </div>
                  <div className="space-y-1.5 col-span-2">
                    <Label>Próximo follow-up</Label>
                    <Input type="datetime-local" value={editFollowup} onChange={e => setEditFollowup(e.target.value)}/>
                  </div>
                  <div className="space-y-1.5 col-span-2">
                    <Label>Observações</Label>
                    <Textarea value={editObs} onChange={e => setEditObs(e.target.value)} rows={4} maxLength={600}/>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Telefone</p>
                      <a href={`tel:${lead.telefone}`} className="text-sm font-semibold text-primary flex items-center gap-1.5">
                        <Phone className="h-3.5 w-3.5"/> {formatPhone(lead.telefone)}
                      </a>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Status</p>
                      <Badge className={LEAD_STATUS_COLOR[lead.status as keyof typeof LEAD_STATUS_COLOR] ?? "bg-muted text-muted-foreground"} variant="secondary">
                        {LEAD_STATUS_LABELS[lead.status as keyof typeof LEAD_STATUS_LABELS] ?? lead.status}
                      </Badge>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Responsável</p>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="flex items-center gap-1.5 -mx-1 px-1 py-0.5 rounded-lg hover:bg-muted transition-colors">
                            {assignee ? (
                              <span className="h-5 w-5 rounded-full bg-primary/15 text-primary text-[9px] font-bold flex items-center justify-center shrink-0">
                                {initials(assignee.full_name)}
                              </span>
                            ) : (
                              <UserCircle2 className="h-5 w-5 text-muted-foreground/40 shrink-0"/>
                            )}
                            <span className="text-sm font-medium truncate">{assignee?.full_name || "Sem responsável"}</span>
                            <UserPlus className="h-3 w-3 text-muted-foreground/40 shrink-0"/>
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="max-h-64 overflow-y-auto">
                          <DropdownMenuLabel>Atribuir a</DropdownMenuLabel>
                          <DropdownMenuSeparator/>
                          {profiles.map(p => (
                            <DropdownMenuItem key={p.id} onClick={() => assignLead(p.id)}>
                              {lead.assigned_to === p.id ? "✓ " : ""}{p.full_name || "Sem nome"}
                            </DropdownMenuItem>
                          ))}
                          {lead.assigned_to && (
                            <>
                              <DropdownMenuSeparator/>
                              <DropdownMenuItem onClick={() => assignLead(null)}>Remover responsável</DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    {lead.origem && (
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Origem</p>
                        <p className="text-sm font-medium">{lead.origem}</p>
                      </div>
                    )}
                    {lead.proximo_followup && (
                      <div className="col-span-2 sm:col-span-3">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Próximo follow-up</p>
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-200 text-xs font-medium text-amber-700">
                          <CalendarClock className="h-3.5 w-3.5"/>
                          {new Date(lead.proximo_followup).toLocaleDateString("pt-BR", { weekday:"long", day:"2-digit", month:"long" })}
                          {" às "}
                          {new Date(lead.proximo_followup).toLocaleTimeString("pt-BR", { hour:"2-digit", minute:"2-digit" })}
                        </div>
                      </div>
                    )}
                  </div>

                  {lead.observacoes && (
                    <div className="border-t pt-4">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Observações</p>
                      <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-wrap">{lead.observacoes}</p>
                    </div>
                  )}

                  {/* Ações rápidas */}
                  <div className="border-t pt-4 flex gap-2 flex-wrap">
                    <a href={`https://wa.me/${toWhatsAppNumber(lead.telefone)}`}
                      target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-50 border border-green-200 text-xs font-medium text-green-700 hover:bg-green-100 transition-colors">
                      <MessageCircle className="h-3.5 w-3.5"/> WhatsApp
                    </a>
                    <button onClick={() => navigate(`/dialer?lead=${lead.id}`)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 border border-blue-200 text-xs font-medium text-blue-700 hover:bg-blue-100 transition-colors">
                      <CalendarDays className="h-3.5 w-3.5"/> Enviar mensagem
                    </button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── Pedidos ───────────────────────────────────────────────── */}
          <Card className="shadow-card">
            <CardContent className="p-5 space-y-3">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-sm flex items-center gap-1.5">
                  <ShoppingBag className="h-4 w-4 text-primary"/> Pedidos
                  <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">{pedidos.length}</span>
                </p>
                <button onClick={() => setShowNewPedido(true)}
                  className="flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                  <Plus className="h-3.5 w-3.5"/> Novo pedido
                </button>
              </div>

              {pedidos.length === 0 ? (
                <p className="text-xs text-muted-foreground italic py-2">Nenhum pedido registrado ainda.</p>
              ) : (
                <div className="space-y-3">
                  {pedidos.map(pedido => {
                    const itens = itensByPedido.get(pedido.id) ?? [];
                    const resumo = summarizePedido(itens, pedido);
                    return (
                      <div key={pedido.id} className="border rounded-xl p-3 space-y-2.5">
                        <div className="flex items-center justify-between flex-wrap gap-1">
                          <span className="text-sm font-bold">Pedido #{pedido.numero}</span>
                          <span className="text-xs text-muted-foreground">
                            {new Date(pedido.created_at).toLocaleDateString("pt-BR", { day:"2-digit", month:"2-digit", year:"2-digit" })}
                          </span>
                        </div>

                        <div className="flex gap-1 flex-wrap">
                          {PEDIDO_STATUS_PAGAMENTO_ORDER.map(s => (
                            <button key={s} onClick={() => setPedidoStatusPagamento(pedido, s)}
                              className={`text-[10px] font-semibold px-2 py-1 rounded-full border transition-colors ${
                                pedido.status_pagamento === s ? PEDIDO_STATUS_PAGAMENTO_COLOR[s] + " ring-1 ring-inset ring-current border-transparent" : "text-muted-foreground border-muted hover:border-foreground/30"
                              }`}>
                              {PEDIDO_STATUS_PAGAMENTO_EMOJI[s]} {PEDIDO_STATUS_PAGAMENTO_LABELS[s]}
                            </button>
                          ))}
                        </div>
                        <div className="flex gap-1 flex-wrap">
                          {PEDIDO_STATUS_ENTREGA_ORDER.map(s => (
                            <button key={s} onClick={() => setPedidoStatusEntrega(pedido, s)}
                              className={`text-[10px] font-semibold px-2 py-1 rounded-full border transition-colors ${
                                pedido.status_entrega === s ? PEDIDO_STATUS_ENTREGA_COLOR[s] + " ring-1 ring-inset ring-current border-transparent" : "text-muted-foreground border-muted hover:border-foreground/30"
                              }`}>
                              {PEDIDO_STATUS_ENTREGA_EMOJI[s]} {PEDIDO_STATUS_ENTREGA_LABELS[s]}
                            </button>
                          ))}
                        </div>

                        {itens.length > 0 && (
                          <div className="space-y-1 border-t pt-2">
                            {itens.map(it => (
                              <div key={it.id} className="flex items-center justify-between text-xs">
                                <span className="text-muted-foreground truncate">{it.produto}{it.quantidade > 1 ? ` ×${it.quantidade}` : ""}</span>
                                <span className="font-medium tabular-nums shrink-0">{formatCurrency(it.valor)}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        <div className="border-t pt-2 grid grid-cols-2 gap-x-2 gap-y-0.5 text-xs">
                          <span className="text-muted-foreground">Subtotal</span>
                          <span className="text-right tabular-nums">{formatCurrency(resumo.subtotal)}</span>
                          {pedido.desconto > 0 && (<>
                            <span className="text-muted-foreground">Desconto</span>
                            <span className="text-right tabular-nums text-rose-600">-{formatCurrency(pedido.desconto)}</span>
                          </>)}
                          {pedido.frete > 0 && (<>
                            <span className="text-muted-foreground">Frete</span>
                            <span className="text-right tabular-nums">{formatCurrency(pedido.frete)}</span>
                          </>)}
                          <span className="font-bold">Total</span>
                          <span className="text-right font-bold tabular-nums">{formatCurrency(resumo.total)}</span>
                          {resumo.margemPct !== null && (<>
                            <span className="text-muted-foreground">Margem</span>
                            <span className="text-right tabular-nums text-emerald-600">{formatCurrency(resumo.margem)} ({resumo.margemPct}%)</span>
                          </>)}
                        </div>

                        {(pedido.forma_pagamento || pedido.endereco_entrega) && (
                          <div className="text-[10px] text-muted-foreground space-y-0.5">
                            {pedido.forma_pagamento && <p>💳 {pedido.forma_pagamento}</p>}
                            {pedido.endereco_entrega && <p>📍 {pedido.endereco_entrega}</p>}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── Avançar no funil ───────────────────────────────── */}
          {!editing && !isLost && funnelCol && (
            <Card className="shadow-card">
              <CardContent className="p-5 space-y-3">
                <div className="flex items-center gap-2 mb-1">
                  <ChevronRight className="h-4 w-4 text-muted-foreground"/>
                  <span className="font-semibold text-sm">Avançar no funil</span>
                  <span className="text-xs text-muted-foreground">— Etapa atual: {funnelCol.label}</span>
                </div>

                {/* Funil visual compacto */}
                <div className="flex items-center gap-1 overflow-x-auto pb-1">
                  {LEAD_FUNNEL_COLUMNS.map(c => (
                    <div key={c.key}
                      className={`flex-shrink-0 flex items-center justify-center h-7 px-2.5 rounded-full text-[10px] font-bold border transition-all ${
                        c.key === funnelCol.key
                          ? "text-white border-transparent"
                          : "text-muted-foreground border-muted bg-background"
                      }`}
                      style={c.key === funnelCol.key ? { backgroundColor: c.color, borderColor: c.color } : {}}>
                      {c.emoji} {c.label}
                    </div>
                  ))}
                </div>

                <div className="flex gap-2 flex-wrap">
                  {canAdvance && nextCol && (
                    <button onClick={() => advanceStatus(nextCol.statuses[0])}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-500/10 text-emerald-700 border border-emerald-200 hover:bg-emerald-500/20 transition-colors">
                      <ArrowRight className="h-3.5 w-3.5"/> Avançar para {nextCol.label}
                    </button>
                  )}
                  <button onClick={() => advanceStatus("perdido")}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-rose-500/10 text-rose-700 border border-rose-200 hover:bg-rose-500/20 transition-colors">
                    ❌ Marcar como perdido
                  </button>
                </div>

                {funnelCol.key === "pos_venda" && (
                  <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-100 border border-emerald-300">
                    <Trophy className="h-5 w-5 text-emerald-700"/>
                    <span className="font-bold text-emerald-800 text-sm">Venda concluída! 🏆</span>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Lead perdido — opção de reativar */}
          {!editing && isLost && (
            <Card className="shadow-card border-red-100">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <AlertTriangle className="h-5 w-5 text-red-500 shrink-0"/>
                  <div className="flex-1">
                    <p className="font-semibold text-sm text-red-700">Lead marcado como perdido</p>
                    <p className="text-xs text-red-600 mt-0.5">Status: {LEAD_STATUS_LABELS[lead.status as keyof typeof LEAD_STATUS_LABELS] ?? lead.status}</p>
                  </div>
                  <button onClick={() => advanceStatus("retornar")}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition-colors shrink-0">
                    Reativar
                  </button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ── Histórico — abas mensagens + auditoria ────────────────── */}
          <div>
            {/* Abas */}
            <div className="flex gap-1 bg-muted rounded-xl p-1 mb-4">
              <button onClick={() => setActiveTab("mensagens")}
                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold transition-all ${
                  activeTab === "mensagens" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}>
                <History className="h-4 w-4"/>
                Mensagens
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted-foreground/20 font-bold">{totalMensagens}</span>
              </button>
              <button onClick={() => setActiveTab("auditoria")}
                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold transition-all ${
                  activeTab === "auditoria" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}>
                <ShieldCheck className="h-4 w-4"/>
                Auditoria
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted-foreground/20 font-bold">{audits.length}</span>
              </button>
            </div>

            {/* ── Aba Mensagens ─────────────────────────────────────────── */}
            {activeTab === "mensagens" && (
            <div>

            {mensagens.length === 0 ? (
              <Card className="shadow-card">
                <CardContent className="py-12 text-center">
                  <MessageCircle className="h-10 w-10 mx-auto mb-3 text-muted-foreground/20"/>
                  <p className="text-muted-foreground text-sm">Nenhuma mensagem enviada ainda.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="relative">
                <div className="absolute left-4 top-0 bottom-0 w-px bg-border"/>
                <div className="space-y-3 pl-10">
                  {mensagens.map((msg, idx) => {
                    const isFirst = idx === 0;
                    const date    = new Date(msg.enviada_em);
                    return (
                      <div key={msg.id} className="relative">
                        <div className={`absolute -left-[26px] h-4 w-4 rounded-full border-2 border-background ${isFirst ? "bg-primary" : "bg-muted-foreground/40"}`}/>
                        <Card className={`shadow-card ${isFirst ? "border-primary/20" : ""}`}>
                          <CardContent className="p-4">
                            <div className="flex items-start justify-between gap-3 mb-2">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-muted">
                                  {MENSAGEM_CATEGORIA_EMOJI[msg.categoria]} {MENSAGEM_CATEGORIA_LABELS[msg.categoria]}
                                </span>
                                {isFirst && (
                                  <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">Última</span>
                                )}
                              </div>
                              <div className="text-right shrink-0">
                                <div className="text-xs font-medium">
                                  {date.toLocaleDateString("pt-BR", { day:"2-digit", month:"2-digit", year:"2-digit" })}
                                </div>
                                <div className="text-[10px] text-muted-foreground">
                                  {date.toLocaleTimeString("pt-BR", { hour:"2-digit", minute:"2-digit" })}
                                </div>
                              </div>
                            </div>
                            <p className="text-xs text-muted-foreground bg-muted/40 rounded-lg px-2.5 py-2 leading-relaxed mb-2">
                              {msg.texto}
                            </p>
                            <div className="flex gap-1">
                              {MENSAGEM_STATUS_CONTATO_ORDER.map(s => (
                                <button
                                  key={s}
                                  onClick={() => setMsgStatusContato(msg, s)}
                                  title={MENSAGEM_STATUS_CONTATO_LABELS[s]}
                                  className={`h-6 w-6 flex items-center justify-center rounded-full text-[11px] transition-colors ${
                                    msg.status_contato === s ? MENSAGEM_STATUS_CONTATO_COLOR[s] + " ring-1 ring-inset ring-current" : "text-muted-foreground/40 hover:bg-muted"
                                  }`}
                                >
                                  {MENSAGEM_STATUS_CONTATO_EMOJI[s]}
                                </button>
                              ))}
                            </div>
                          </CardContent>
                        </Card>
                      </div>
                    );
                  })}
                  {/* Marco de criação */}
                  <div className="relative">
                    <div className="absolute -left-[26px] h-4 w-4 rounded-full border-2 border-background bg-muted"/>
                    <div className="py-2 text-xs text-muted-foreground">
                      Lead criado em {new Date(lead.created_at).toLocaleDateString("pt-BR", { day:"2-digit", month:"long", year:"numeric" })}
                    </div>
                  </div>
                </div>
              </div>
            )}
            </div>
            )}

            {/* ── Aba Auditoria ─────────────────────────────────────────── */}
            {activeTab === "auditoria" && (
              <div className="space-y-2">
                {audits.length === 0 ? (
                  <Card className="shadow-card">
                    <CardContent className="py-12 text-center">
                      <ShieldCheck className="h-10 w-10 mx-auto mb-3 text-muted-foreground/20"/>
                      <p className="text-muted-foreground text-sm">Nenhuma edição registrada ainda.</p>
                      <p className="text-xs text-muted-foreground/60 mt-1">As alterações aparecerão aqui automaticamente.</p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="relative">
                    <div className="absolute left-4 top-0 bottom-0 w-px bg-border"/>
                    <div className="space-y-2 pl-10">
                      {audits.map((audit, idx) => {
                        const isFirst   = idx === 0;
                        const date      = new Date(audit.alterado_em);
                        const campoLabel = CAMPO_LABELS[audit.campo] ?? audit.campo;

                        // Formatar valor para exibição
                        const fmtVal = (val: string | null) => {
                          if (!val) return <span className="italic text-muted-foreground/60">vazio</span>;
                          if (audit.campo === "status") return <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${LEAD_STATUS_COLOR[val as keyof typeof LEAD_STATUS_COLOR] ?? "bg-muted text-muted-foreground"}`}>{LEAD_STATUS_LABELS[val as keyof typeof LEAD_STATUS_LABELS] ?? val}</span>;
                          if (audit.campo === "proximo_followup") {
                            try { return <span>{new Date(val).toLocaleString("pt-BR", { day:"2-digit", month:"2-digit", year:"2-digit", hour:"2-digit", minute:"2-digit" })}</span>; }
                            catch { return <span>{val}</span>; }
                          }
                          if (val.length > 60) return <span>{val.slice(0, 60)}…</span>;
                          return <span>{val}</span>;
                        };

                        return (
                          <div key={audit.id} className="relative">
                            <div className={`absolute -left-[26px] h-4 w-4 rounded-full border-2 border-background ${isFirst ? "bg-primary" : "bg-muted-foreground/40"}`}/>
                            <Card className={`shadow-card ${isFirst ? "border-primary/20" : ""}`}>
                              <CardContent className="p-4">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-2">
                                      <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0"/>
                                      <span className="text-xs font-bold text-foreground">{campoLabel} alterado</span>
                                      {isFirst && (
                                        <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">Mais recente</span>
                                      )}
                                    </div>
                                    <div className="space-y-1.5">
                                      <div className="flex items-center gap-2 text-xs">
                                        <span className="text-muted-foreground shrink-0 w-16">Antes:</span>
                                        <span className="bg-red-50 text-red-700 px-2 py-0.5 rounded text-[11px] line-through">
                                          {fmtVal(audit.valor_anterior)}
                                        </span>
                                      </div>
                                      <div className="flex items-center gap-2 text-xs">
                                        <span className="text-muted-foreground shrink-0 w-16">Depois:</span>
                                        <span className="bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded text-[11px] font-semibold">
                                          {fmtVal(audit.valor_novo)}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                  <div className="flex flex-col items-end gap-2 shrink-0">
                                    <div className="text-right">
                                      <div className="text-xs font-medium">{date.toLocaleDateString("pt-BR", { day:"2-digit", month:"2-digit", year:"2-digit" })}</div>
                                      <div className="text-[10px] text-muted-foreground">{date.toLocaleTimeString("pt-BR", { hour:"2-digit", minute:"2-digit" })}</div>
                                    </div>
                                    {/* Botão reverter */}
                                    {audit.valor_anterior !== null && (
                                      <button
                                        onClick={() => revertAudit(audit)}
                                        disabled={reverting === audit.id}
                                        className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition-colors disabled:opacity-50">
                                        <RotateCcw className="h-3 w-3"/>
                                        {reverting === audit.id ? "…" : "Reverter"}
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          </div>
                        );
                      })}
                      {/* Fim */}
                      <div className="relative">
                        <div className="absolute -left-[26px] h-4 w-4 rounded-full border-2 border-background bg-muted"/>
                        <div className="py-2 text-xs text-muted-foreground">
                          Lead criado em {new Date(lead.created_at).toLocaleDateString("pt-BR", { day:"2-digit", month:"long", year:"numeric" })}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

        </div>

        {/* ── Coluna lateral ───────────────────────────────────────────── */}
        <div className="space-y-4">

          {/* Resumo de compras */}
          <Card className="shadow-card">
            <CardContent className="p-5 space-y-3">
              <p className="font-semibold text-sm flex items-center gap-1.5">
                <ShoppingBag className="h-4 w-4 text-primary"/> Resumo de compras
              </p>

              <Badge variant="secondary" className={`w-fit ${TICKET_TIER_COLOR[ticketTier]}`}>
                {TICKET_TIER_EMOJI[ticketTier]} {TICKET_TIER_LABELS[ticketTier]}
              </Badge>

              <div className="grid grid-cols-2 gap-2 text-center">
                <div className="p-2 rounded-lg bg-muted/50">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Total gasto</p>
                  <p className="font-bold text-sm tabular-nums">{formatCurrency(compraResumo.totalGasto)}</p>
                </div>
                <div className="p-2 rounded-lg bg-muted/50">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Ticket médio</p>
                  <p className="font-bold text-sm tabular-nums">{compraResumo.ticketMedio !== null ? formatCurrency(compraResumo.ticketMedio) : "—"}</p>
                </div>
              </div>

              <p className="text-[10px] text-muted-foreground text-center">
                {pedidos.length} pedido{pedidos.length === 1 ? "" : "s"} registrado{pedidos.length === 1 ? "" : "s"}
              </p>
            </CardContent>
          </Card>

          {/* Score */}
          <Card className={`shadow-card border ${sl.bg}`}>
            <CardContent className="p-5 text-center">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Score do lead</p>
              <div className={`font-display font-black text-5xl ${sl.color}`}>{score}</div>
              <p className={`text-sm font-bold mt-1 ${sl.color}`}>{sl.emoji} {sl.label}</p>
              <div className="h-1.5 bg-muted rounded-full mt-3 overflow-hidden">
                <div className={`h-full rounded-full transition-all ${score >= 70 ? "bg-emerald-500" : score >= 40 ? "bg-amber-500" : "bg-rose-500"}`}
                  style={{ width: `${score}%` }}/>
              </div>
              <p className="text-[10px] text-muted-foreground mt-2">Baseado em mensagens, respostas e status atual</p>
            </CardContent>
          </Card>

          {/* Resumo stats */}
          <Card className="shadow-card">
            <CardContent className="p-5 space-y-3">
              <p className="font-semibold text-sm">Resumo</p>
              {[
                { icon: <MessageCircle className="h-4 w-4"/>, label: "Total de mensagens",  value: totalMensagens },
                { icon: <ChevronRight className="h-4 w-4"/>,  label: "Respondidas",          value: respondidas },
                { icon: <Award className="h-4 w-4"/>,         label: "Taxa de resposta",     value: `${taxaResposta}%` },
              ].map(r => (
                <div key={r.label} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 text-muted-foreground">
                    {r.icon} {r.label}
                  </span>
                  <span className="font-bold tabular-nums">{r.value}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Linha do tempo */}
          <Card className="shadow-card">
            <CardContent className="p-5 space-y-2">
              <p className="font-semibold text-sm">Linha do tempo</p>
              {mensagens.length > 0 && (
                <>
                  <div className="text-xs text-muted-foreground">
                    Primeiro contato
                    <div className="font-medium text-foreground mt-0.5">
                      {new Date(mensagens[mensagens.length - 1].enviada_em).toLocaleDateString("pt-BR", { day:"2-digit", month:"long", year:"numeric" })}
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Último contato
                    <div className="font-medium text-foreground mt-0.5">
                      {new Date(mensagens[0].enviada_em).toLocaleDateString("pt-BR", { day:"2-digit", month:"long", year:"numeric" })}
                    </div>
                  </div>
                </>
              )}
              {lead.proximo_followup && (
                <div className="text-xs text-amber-600">
                  Próximo follow-up
                  <div className="font-medium mt-0.5">
                    {new Date(lead.proximo_followup).toLocaleDateString("pt-BR", { weekday:"long", day:"2-digit", month:"long" })}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Última observação */}
          {mensagens.find(m => m.observacao) && (
            <Card className="shadow-card">
              <CardContent className="p-5">
                <p className="font-semibold text-sm mb-2">Última observação</p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {mensagens.find(m => m.observacao)?.observacao}
                </p>
                <p className="text-[10px] text-muted-foreground/60 mt-2">
                  {new Date(mensagens.find(m => m.observacao)!.enviada_em).toLocaleDateString("pt-BR", { day:"2-digit", month:"2-digit", year:"2-digit" })}
                </p>
              </CardContent>
            </Card>
          )}

        </div>
      </div>

      {showNewPedido && (
        <NewPedidoDialog onSave={createPedido} onClose={() => setShowNewPedido(false)}/>
      )}
    </div>
  );
}

type PedidoItemRow = { produto: string; quantidade: number; valor: string; custo: string };

function NewPedidoDialog({ onSave, onClose }: {
  onSave: (input: {
    itens: { produto: string; quantidade: number; valor: number; custo: number }[];
    forma_pagamento: string; desconto: number; frete: number; endereco_entrega: string; observacoes: string;
    origem: string; status_pagamento: PedidoStatusPagamento; status_entrega: PedidoStatusEntrega;
  }) => void | Promise<void>;
  onClose: () => void;
}) {
  const [itens, setItens] = useState<PedidoItemRow[]>([{ produto: "", quantidade: 1, valor: "", custo: "" }]);
  const [formaPagamento, setFormaPagamento] = useState(FORMAS_PAGAMENTO[0]);
  const [origem, setOrigem]           = useState("loja");
  const [desconto, setDesconto]       = useState("");
  const [frete, setFrete]             = useState("");
  const [enderecoEntrega, setEnderecoEntrega] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [statusPagamento, setStatusPagamento] = useState<PedidoStatusPagamento>("aguardando");
  const [statusEntrega, setStatusEntrega]     = useState<PedidoStatusEntrega>("preparando");
  const [saving, setSaving]           = useState(false);

  function updateItem(idx: number, patch: Partial<PedidoItemRow>) {
    setItens(prev => prev.map((it, i) => i === idx ? { ...it, ...patch } : it));
  }
  function addItem() {
    setItens(prev => [...prev, { produto: "", quantidade: 1, valor: "", custo: "" }]);
  }
  function removeItem(idx: number) {
    setItens(prev => prev.filter((_, i) => i !== idx));
  }

  const parsedItens = itens.map(it => ({
    produto: it.produto.trim(),
    quantidade: it.quantidade,
    valor: Number(it.valor.replace(",", ".")) || 0,
    custo: Number(it.custo.replace(",", ".")) || 0,
  }));
  const descontoNum = Number(desconto.replace(",", ".")) || 0;
  const freteNum    = Number(frete.replace(",", ".")) || 0;
  const resumo = summarizePedido(parsedItens, { desconto: descontoNum, frete: freteNum });

  async function handleSave() {
    const valid = parsedItens.filter(i => i.produto && i.valor > 0);
    if (valid.length === 0) { toast.error("Adicione ao menos um item com produto e valor."); return; }
    setSaving(true);
    await onSave({
      itens: parsedItens, forma_pagamento: formaPagamento, desconto: descontoNum, frete: freteNum,
      endereco_entrega: enderecoEntrega.trim(), observacoes: observacoes.trim(), origem,
      status_pagamento: statusPagamento, status_entrega: statusEntrega,
    });
    setSaving(false);
  }

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Novo pedido</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Itens</Label>
            {itens.map((it, idx) => (
              <div key={idx} className="flex items-end gap-2">
                <div className="flex-1 space-y-1">
                  {idx === 0 && <span className="text-[10px] text-muted-foreground">Produto</span>}
                  <Input value={it.produto} onChange={e => updateItem(idx, { produto: e.target.value })} placeholder="Ex: Perfume 100ml"/>
                </div>
                <div className="w-16 space-y-1">
                  {idx === 0 && <span className="text-[10px] text-muted-foreground">Qtd</span>}
                  <Input type="number" min="1" value={it.quantidade} onChange={e => updateItem(idx, { quantidade: Number(e.target.value) || 1 })}/>
                </div>
                <div className="w-24 space-y-1">
                  {idx === 0 && <span className="text-[10px] text-muted-foreground">Valor</span>}
                  <Input value={it.valor} onChange={e => updateItem(idx, { valor: e.target.value })} placeholder="129,90"/>
                </div>
                <div className="w-24 space-y-1">
                  {idx === 0 && <span className="text-[10px] text-muted-foreground">Custo</span>}
                  <Input value={it.custo} onChange={e => updateItem(idx, { custo: e.target.value })} placeholder="60,00"/>
                </div>
                <button onClick={() => removeItem(idx)} disabled={itens.length === 1}
                  className="h-9 w-9 flex items-center justify-center rounded-lg border text-muted-foreground hover:text-rose-600 hover:border-rose-300 transition-colors disabled:opacity-30 disabled:pointer-events-none shrink-0">
                  <Trash2 className="h-3.5 w-3.5"/>
                </button>
              </div>
            ))}
            <button onClick={addItem} className="flex items-center gap-1 text-xs font-medium text-primary hover:underline">
              <Plus className="h-3.5 w-3.5"/> Adicionar item
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Forma de pagamento</Label>
              <Select value={formaPagamento} onValueChange={setFormaPagamento}>
                <SelectTrigger><SelectValue/></SelectTrigger>
                <SelectContent>
                  {FORMAS_PAGAMENTO.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Origem</Label>
              <Select value={origem} onValueChange={setOrigem}>
                <SelectTrigger><SelectValue/></SelectTrigger>
                <SelectContent>
                  <SelectItem value="loja">Loja física</SelectItem>
                  <SelectItem value="nuvemshop">Nuvemshop</SelectItem>
                  <SelectItem value="quiosque">Quiosque</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Desconto (R$)</Label>
              <Input value={desconto} onChange={e => setDesconto(e.target.value)} placeholder="0,00"/>
            </div>
            <div className="space-y-1.5">
              <Label>Frete (R$)</Label>
              <Input value={frete} onChange={e => setFrete(e.target.value)} placeholder="0,00"/>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Status pagamento</Label>
              <Select value={statusPagamento} onValueChange={v => setStatusPagamento(v as PedidoStatusPagamento)}>
                <SelectTrigger><SelectValue/></SelectTrigger>
                <SelectContent>
                  {PEDIDO_STATUS_PAGAMENTO_ORDER.map(s => (
                    <SelectItem key={s} value={s}>{PEDIDO_STATUS_PAGAMENTO_EMOJI[s]} {PEDIDO_STATUS_PAGAMENTO_LABELS[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Status entrega</Label>
              <Select value={statusEntrega} onValueChange={v => setStatusEntrega(v as PedidoStatusEntrega)}>
                <SelectTrigger><SelectValue/></SelectTrigger>
                <SelectContent>
                  {PEDIDO_STATUS_ENTREGA_ORDER.map(s => (
                    <SelectItem key={s} value={s}>{PEDIDO_STATUS_ENTREGA_EMOJI[s]} {PEDIDO_STATUS_ENTREGA_LABELS[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Endereço de entrega</Label>
            <Input value={enderecoEntrega} onChange={e => setEnderecoEntrega(e.target.value)} placeholder="Opcional"/>
          </div>
          <div className="space-y-1.5">
            <Label>Observações</Label>
            <Textarea value={observacoes} onChange={e => setObservacoes(e.target.value)} rows={2} placeholder="Opcional"/>
          </div>

          <div className="border-t pt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="text-right tabular-nums">{formatCurrency(resumo.subtotal)}</span>
            <span className="font-bold">Total</span>
            <span className="text-right font-bold tabular-nums">{formatCurrency(resumo.total)}</span>
            {resumo.margemPct !== null && (<>
              <span className="text-muted-foreground">Margem estimada</span>
              <span className="text-right tabular-nums text-emerald-600">{formatCurrency(resumo.margem)} ({resumo.margemPct}%)</span>
            </>)}
          </div>
        </div>
        <DialogFooter className="mt-2">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border hover:bg-muted transition-colors flex items-center gap-1.5">
            <X className="h-3.5 w-3.5"/> Cancelar
          </button>
          <Button onClick={handleSave} disabled={saving}>{saving ? "Salvando…" : "Criar pedido"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
