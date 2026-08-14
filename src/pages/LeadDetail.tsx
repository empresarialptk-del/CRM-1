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
import {
  STATUS_COLOR, STATUS_LABELS, OUTCOME_LABELS, FUNNEL_STAGES, FUNNEL_STAGE,
  LOST_STATUSES, OUTCOMES_BY_STAGE, STATUS_FROM_OUTCOME,
  formatPhone, formatDuration,
} from "@/lib/crm";
import { calcLeadScore, scoreLabel } from "@/lib/leadScore";
import {
  ArrowLeft, Phone, PhoneCall, Clock, CalendarDays,
  Pencil, Save, X, MessageSquare, Award, CalendarClock,
  ChevronRight, Trophy, AlertTriangle, History, RotateCcw,
  FileText, ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";

// ── Tipos ─────────────────────────────────────────────────────────────────────
type Lead = {
  id: string; nome: string; telefone: string; status: string;
  observacoes: string | null; origem: string | null;
  proximo_followup: string | null; created_at: string; updated_at: string;
  list_id: string | null;
};

type Call = {
  id: string; outcome: string; outcome_label: string | null;
  observacao: string | null; duracao_segundos: number; started_at: string;
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

const LOST_LIST = [
  "sem_interesse","nao_quer_mais","perdido","ignorado",
  "numero_errado","numero_bloqueado","ja_comprou","comprou_carro","quer_casa",
];

// ── Componente principal ──────────────────────────────────────────────────────
export default function LeadDetail() {
  const { id }     = useParams<{ id: string }>();
  const navigate   = useNavigate();
  const { user }   = useAuth();

  const [lead, setLead]       = useState<Lead | null>(null);
  const [calls, setCalls]     = useState<Call[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing]   = useState(false);
  const [saving, setSaving]     = useState(false);
  const [audits, setAudits]     = useState<Audit[]>([]);
  const [activeTab, setActiveTab] = useState<"ligacoes" | "auditoria">("ligacoes");
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
    const [{ data: leadData }, { data: callsData }, { data: auditData }] = await Promise.all([
      supabase.from("leads").select("*").eq("id", id).single(),
      supabase.from("calls")
        .select("id,outcome,outcome_label,observacao,duracao_segundos,started_at")
        .eq("lead_id", id)
        .order("started_at", { ascending: false }),
      supabase.from("lead_audit")
        .select("id,campo,valor_anterior,valor_novo,alterado_em")
        .eq("lead_id", id)
        .order("alterado_em", { ascending: false })
        .limit(100),
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
    setCalls((callsData ?? []) as Call[]);
    setAudits((auditData ?? []) as Audit[]);
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // ── Salvar edição completa ────────────────────────────────────────────────
  async function saveLead() {
    if (!lead || !user) return;
    setSaving(true);

    // ── Anti-regressão: status só avança no funil ──────────────────────────
    const STAGE_ORDER = ["A","B","C","D","E","F","G","H","I","J","K","L","M","N"];
    const LOST_S = ["sem_interesse","nao_quer_mais","perdido","ignorado",
      "numero_errado","numero_bloqueado","ja_comprou","comprou_carro","quer_casa"];
    const currentStageKey = FUNNEL_STAGE[lead.status] ?? "A";
    const newStageKey     = FUNNEL_STAGE[editStatus] ?? "A";
    const currentIdx      = STAGE_ORDER.indexOf(currentStageKey);
    const newIdx          = STAGE_ORDER.indexOf(newStageKey);
    const isLostCurrent   = LOST_STATUSES.includes(lead.status);
    const isLostNew       = LOST_S.includes(editStatus);

    // Bloqueia se tentar regredir (exceto: ir para perdido é sempre permitido,
    // e reativar de perdido também é permitido)
    if (!isLostNew && !isLostCurrent && newIdx < currentIdx) {
      toast.error(`⚠ Não é possível regredir de ${STATUS_LABELS[lead.status] ?? lead.status} para ${STATUS_LABELS[editStatus] ?? editStatus}. O funil só avança.`);
      setSaving(false);
      return;
    }

    const { error } = await supabase.from("leads").update({
      nome:             editNome.trim(),
      telefone:         editTel.trim(),
      status:           editStatus,
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
    // proximo_followup precisa ser null ou ISO string
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
      .update({ status: novoStatus })
      .eq("id", lead.id);
    if (error) {
      toast.error(error.message);
      setLead(l => l ? { ...l, status: prev } : l);
    } else {
      toast.success(`✅ ${cleanName(lead.nome)} → ${STATUS_LABELS[novoStatus] ?? novoStatus}`);
    }
  }

  // ── Computados ────────────────────────────────────────────────────────────
  const totalLigacoes = calls.length;
  const totalSec      = calls.reduce((a, c) => a + (c.duracao_segundos ?? 0), 0);
  const positivos     = calls.filter(c => {
    const k = FUNNEL_STAGE[c.outcome];
    return k && ["B","C","D","E","F","G","H","I","J","K","L","M","N"].includes(k);
  }).length;
  const taxaConv = totalLigacoes > 0 ? Math.round((positivos / totalLigacoes) * 100) : 0;

  const checkupNotas = (lead?.observacoes ?? "").split("\n")
    .map(l => { const m = l.match(/\[CHECK-UP ([^\]]+)\] Nota: ([\d.]+)\/10/); return m ? { data: m[1], nota: parseFloat(m[2]) } : null; })
    .filter(Boolean) as { data: string; nota: number }[];
  const ultimoCheckup = checkupNotas[checkupNotas.length - 1] ?? null;

  const score = lead ? calcLeadScore({
    callCount:     totalLigacoes,
    positiveCount: positivos,
    status:        lead.status,
    hasFollowup:   !!lead.proximo_followup,
  }) : 0;
  const sl = scoreLabel(score);

  const stageKey  = lead ? (FUNNEL_STAGE[lead.status] ?? null) : null;
  const stage     = stageKey ? FUNNEL_STAGES.find(s => s.key === stageKey) : null;
  const isLost    = lead ? LOST_LIST.includes(lead.status) : false;
  const outcomes  = stageKey ? (OUTCOMES_BY_STAGE[stageKey as keyof typeof OUTCOMES_BY_STAGE] ?? []) : [];
  const positiveOutcomes = outcomes.filter(o => o.type === "positive");
  const neutralOutcomes  = outcomes.filter(o => o.type === "neutral");
  const negativeOutcomes = outcomes.filter(o => o.type === "negative");

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
            {/* Badge da etapa do funil */}
            {stage && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-bold border"
                style={{ backgroundColor: stage.light, color: stage.color, borderColor: stage.color + "40" }}>
                {stage.emoji} {stage.key} · {stage.label}
              </span>
            )}
            {isLost && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-bold bg-red-50 text-red-600 border border-red-200">
                ❌ Perdido
              </span>
            )}
          </div>
          <p className="text-muted-foreground text-sm mt-0.5">
            Lead desde {new Date(lead.created_at).toLocaleDateString("pt-BR", { day:"2-digit", month:"long", year:"numeric" })}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={() => navigate(`/dialer?lead=${lead.id}`)}>
            <PhoneCall className="h-4 w-4 mr-2"/> Discar
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
                        {FUNNEL_STAGES.map(st => (
                          <div key={st.key}>
                            <div className="px-2 py-1 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                              {st.key} · {st.label}
                            </div>
                            {st.statuses.map(s => (
                              <SelectItem key={s} value={s}>{STATUS_LABELS[s] ?? s}</SelectItem>
                            ))}
                          </div>
                        ))}
                        <div className="px-2 py-1 text-[10px] font-bold text-muted-foreground uppercase tracking-wider mt-1">Perdidos</div>
                        {LOST_LIST.map(s => <SelectItem key={s} value={s}>{STATUS_LABELS[s] ?? s}</SelectItem>)}
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
                      <Badge className={STATUS_COLOR[lead.status] ?? "bg-muted text-muted-foreground"} variant="secondary">
                        {STATUS_LABELS[lead.status] ?? lead.status}
                      </Badge>
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
                      <MessageSquare className="h-3.5 w-3.5"/> WhatsApp
                    </a>
                    <button onClick={() => navigate(`/checkup?lead=${lead.id}`)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-50 border border-purple-200 text-xs font-medium text-purple-700 hover:bg-purple-100 transition-colors">
                      <Award className="h-3.5 w-3.5"/> Check-up
                    </button>
                    <button onClick={() => navigate(`/dialer?lead=${lead.id}`)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 border border-blue-200 text-xs font-medium text-blue-700 hover:bg-blue-100 transition-colors">
                      <CalendarDays className="h-3.5 w-3.5"/> Enviar mensagem
                    </button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── Botões de avanço rápido ───────────────────────────────── */}
          {!editing && !isLost && stage && (
            <Card className="shadow-card">
              <CardContent className="p-5 space-y-3">
                <div className="flex items-center gap-2 mb-1">
                  <ChevronRight className="h-4 w-4 text-muted-foreground"/>
                  <span className="font-semibold text-sm">Avançar no funil</span>
                  <span className="text-xs text-muted-foreground">— Etapa atual: {stage.key} · {stage.label}</span>
                </div>

                {/* Funil visual compacto */}
                <div className="flex items-center gap-1 overflow-x-auto pb-1">
                  {FUNNEL_STAGES.map(s => (
                    <div key={s.key}
                      className={`flex-shrink-0 flex items-center justify-center h-7 px-2.5 rounded-full text-[10px] font-bold border transition-all ${
                        s.key === stageKey
                          ? "text-white border-transparent"
                          : "text-muted-foreground border-muted bg-background"
                      }`}
                      style={s.key === stageKey ? { backgroundColor: s.color, borderColor: s.color } : {}}>
                      {s.emoji} {s.key}
                    </div>
                  ))}
                </div>

                {/* Botões positivos */}
                {positiveOutcomes.length > 0 && (
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-emerald-600 font-semibold mb-1.5">✅ Avançar</div>
                    <div className="flex flex-wrap gap-1.5">
                      {positiveOutcomes.map(o => {
                        const ns = STATUS_FROM_OUTCOME[o.outcome] ?? o.outcome;
                        return (
                          <button key={o.outcome} onClick={() => advanceStatus(ns)}
                            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-500/10 text-emerald-700 border border-emerald-200 hover:bg-emerald-500/20 transition-colors">
                            {o.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Botões neutros */}
                {neutralOutcomes.length > 0 && (
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-amber-600 font-semibold mb-1.5">⏳ Aguardando</div>
                    <div className="flex flex-wrap gap-1.5">
                      {neutralOutcomes.filter(o => o.outcome !== "nao_atendeu").map(o => {
                        const ns = STATUS_FROM_OUTCOME[o.outcome] ?? o.outcome;
                        return (
                          <button key={o.outcome} onClick={() => advanceStatus(ns)}
                            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-500/10 text-amber-700 border border-amber-200 hover:bg-amber-500/20 transition-colors">
                            {o.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Botões negativos */}
                {negativeOutcomes.length > 0 && (
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-rose-600 font-semibold mb-1.5">❌ Encerrar</div>
                    <div className="flex flex-wrap gap-1.5">
                      {negativeOutcomes.map(o => {
                        const ns = STATUS_FROM_OUTCOME[o.outcome] ?? o.outcome;
                        return (
                          <button key={o.outcome} onClick={() => advanceStatus(ns)}
                            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-rose-500/10 text-rose-700 border border-rose-200 hover:bg-rose-500/20 transition-colors">
                            {o.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Registro — destaque especial */}
                {stageKey === "N" && (
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
                    <p className="text-xs text-red-600 mt-0.5">Status: {STATUS_LABELS[lead.status] ?? lead.status}</p>
                  </div>
                  <button onClick={() => advanceStatus("retornar")}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition-colors shrink-0">
                    Reativar
                  </button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ── Histórico — abas ligações + auditoria ────────────────── */}
          <div>
            {/* Abas */}
            <div className="flex gap-1 bg-muted rounded-xl p-1 mb-4">
              <button onClick={() => setActiveTab("ligacoes")}
                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold transition-all ${
                  activeTab === "ligacoes" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}>
                <History className="h-4 w-4"/>
                Ligações
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted-foreground/20 font-bold">{totalLigacoes}</span>
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

            {/* ── Aba Ligações ─────────────────────────────────────────── */}
            {activeTab === "ligacoes" && (
            <div>

            {calls.length === 0 ? (
              <Card className="shadow-card">
                <CardContent className="py-12 text-center">
                  <Phone className="h-10 w-10 mx-auto mb-3 text-muted-foreground/20"/>
                  <p className="text-muted-foreground text-sm">Nenhuma ligação registrada ainda.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="relative">
                <div className="absolute left-4 top-0 bottom-0 w-px bg-border"/>
                <div className="space-y-3 pl-10">
                  {calls.map((call, idx) => {
                    const callStageKey = FUNNEL_STAGE[call.outcome];
                    const callStage    = callStageKey ? FUNNEL_STAGES.find(s => s.key === callStageKey) : null;
                    const isFirst      = idx === 0;
                    const date         = new Date(call.started_at);
                    const label        = OUTCOME_LABELS[call.outcome] ?? call.outcome_label ?? call.outcome;
                    return (
                      <div key={call.id} className="relative">
                        {/* Dot */}
                        <div className={`absolute -left-[26px] h-4 w-4 rounded-full border-2 border-background ${isFirst ? "bg-primary" : "bg-muted-foreground/40"}`}/>
                        <Card className={`shadow-card ${isFirst ? "border-primary/20" : ""}`}>
                          <CardContent className="p-4">
                            <div className="flex items-start justify-between gap-3 mb-2">
                              <div className="flex items-center gap-2 flex-wrap">
                                {/* Badge da etapa do outcome */}
                                {callStage ? (
                                  <span className="text-[10px] font-black px-2 py-0.5 rounded-full"
                                    style={{ backgroundColor: callStage.light, color: callStage.color }}>
                                    {callStage.emoji} {callStage.key}
                                  </span>
                                ) : (
                                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                                    —
                                  </span>
                                )}
                                <span className="text-xs font-semibold text-foreground">{label}</span>
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
                                  {call.duracao_segundos > 0 && ` · ${formatDuration(call.duracao_segundos)}`}
                                </div>
                              </div>
                            </div>
                            {call.observacao && (
                              <p className="text-xs text-muted-foreground bg-muted/40 rounded-lg px-2.5 py-2 leading-relaxed">
                                {call.observacao}
                              </p>
                            )}
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
                          if (audit.campo === "status") return <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${STATUS_COLOR[val] ?? "bg-muted text-muted-foreground"}`}>{STATUS_LABELS[val] ?? val}</span>;
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
              <p className="text-[10px] text-muted-foreground mt-2">Baseado em ligações, resultados e status atual</p>
            </CardContent>
          </Card>

          {/* Resumo stats */}
          <Card className="shadow-card">
            <CardContent className="p-5 space-y-3">
              <p className="font-semibold text-sm">Resumo</p>
              {[
                { icon: <Phone className="h-4 w-4"/>,        label: "Total de ligações",  value: totalLigacoes },
                { icon: <Clock className="h-4 w-4"/>,        label: "Tempo total",        value: totalSec > 0 ? formatDuration(totalSec) : "—" },
                { icon: <ChevronRight className="h-4 w-4"/>, label: "Resultados positivos",value: positivos },
                { icon: <Award className="h-4 w-4"/>,        label: "Taxa de conversão",  value: `${taxaConv}%` },
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
              {calls.length > 0 && (
                <>
                  <div className="text-xs text-muted-foreground">
                    Primeiro contato
                    <div className="font-medium text-foreground mt-0.5">
                      {new Date(calls[calls.length - 1].started_at).toLocaleDateString("pt-BR", { day:"2-digit", month:"long", year:"numeric" })}
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Último contato
                    <div className="font-medium text-foreground mt-0.5">
                      {new Date(calls[0].started_at).toLocaleDateString("pt-BR", { day:"2-digit", month:"long", year:"numeric" })}
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
          {calls.find(c => c.observacao) && (
            <Card className="shadow-card">
              <CardContent className="p-5">
                <p className="font-semibold text-sm mb-2">Última observação</p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {calls.find(c => c.observacao)?.observacao}
                </p>
                <p className="text-[10px] text-muted-foreground/60 mt-2">
                  {new Date(calls.find(c => c.observacao)!.started_at).toLocaleDateString("pt-BR", { day:"2-digit", month:"2-digit", year:"2-digit" })}
                </p>
              </CardContent>
            </Card>
          )}

          {/* Check-up */}
          {ultimoCheckup && (
            <Card className="shadow-card">
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-2">
                  <p className="font-semibold text-sm flex items-center gap-1.5">
                    <Award className="h-4 w-4 text-purple-600"/> Check-up ACELERA
                  </p>
                  <button onClick={() => navigate(`/checkup?lead=${lead.id}`)}
                    className="text-xs text-primary hover:underline">Refazer →</button>
                </div>
                <div className="text-3xl font-black text-purple-600">{ultimoCheckup.nota}<span className="text-base font-normal text-muted-foreground">/10</span></div>
                <div className="h-1.5 bg-muted rounded-full mt-2 overflow-hidden">
                  <div className="h-full bg-purple-500 rounded-full" style={{ width: `${ultimoCheckup.nota * 10}%` }}/>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1.5">Avaliado em {ultimoCheckup.data}</p>
              </CardContent>
            </Card>
          )}

        </div>
      </div>
    </div>
  );
}