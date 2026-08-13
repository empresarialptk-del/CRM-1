import React, { useEffect, useRef, useState, useCallback } from "react";
import { loadProfile } from "@/lib/profile";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { STATUS_COLOR, STATUS_LABELS, OUTCOME_LABELS, OUTCOMES_BY_STAGE, OBS_SUGGESTIONS, STATUS_FROM_OUTCOME as CRM_STATUS_FROM_OUTCOME, FUNNEL_STAGE, FUNNEL_STAGES, LOST_STATUSES, formatDuration, formatPhone, formatFollowup } from "@/lib/crm";
import {
  Phone, PhoneCall, PhoneOff, SkipForward, Clock, MessageSquare,
  Plus, X, Copy, Check, Undo2, GripVertical, RefreshCw,
  CheckCircle2, RotateCcw, CalendarClock, Bell, ChevronDown, ChevronRight,
  MapPin, Eye, Pencil, Save, CalendarCheck, PhoneMissed,
} from "lucide-react";
import { toast } from "sonner";

type Lead = {
  id: string;
  nome: string;
  telefone: string;
  status: string;
  observacoes: string | null;
  origem: string | null;
  proximo_followup: string | null;
  call_count?: number;        // total de tentativas de contato
  last_call_date?: string;    // data da última ligação (YYYY-MM-DD)
};

// ── Prioridade da fila ────────────────────────────────────────────────────────
// 0 = máxima prioridade (follow-up hoje)
// 1 = nunca tentou
// 2 = 1-2 tentativas
// 3 = 3-5 tentativas
// 4 = 6-7 tentativas
// 5 = 8+ tentativas (será marcado como ignorado)
const MAX_TENTATIVAS = 8;

// ── Prioridades da fila ─────────────────────────────────────────────────────
// 0  = E · Visita marcada (agendada/confirmada/remarcada)
// 1  = E · Não compareceu (faltou/cancelou) — ação urgente
// 2  = F→L · Pós-visita (visitou, docs, crédito, contrato, boleto)
// 3  = D · Quer visitar (pendente/aguardando)
// 4  = C · Interesse
// 5  = B · Respondeu / Zap (atendeu positivo, aguardando)
// 6  = Outros com follow-up marcado
// 7  = A · Lead novo (nunca tocado)
// 8  = 1-2 tentativas sem atender
// 9  = 3-5 tentativas
// 10 = 6-7 tentativas
// 11 = 8+ (auto-ignorar)
function calcPrioridade(lead: Lead, todayStr: string): number {
  const count = lead.call_count ?? 0;
  const s = lead.status;

  // E · Visita marcada
  if (["visita_agendada","visita_confirmada","visita_remarcada"].includes(s)) return 0;

  // E · Não compareceu — precisa ligar urgente
  if (["visita_faltou","visita_cancelada"].includes(s)) return 1;

  // F→L · Pós-visita — acompanhamento
  if (["visitou","proposta","aguardando_documento",
       "envio_documentos","cpf_em_analise","cpf_analisado","aguardando_aprovacao",
       "credito_aprovado","contrato_preparado","contrato_gerado",
       "contrato_assinado","boleto_pago"].includes(s)) return 2;

  // D · Quer visitar
  if (["visita_pendente","aguardando_visita"].includes(s)) return 3;

  // C · Interesse
  if (s === "interesse") return 4;

  // B · Respondeu/Zap — atendeu positivo, aguardando retorno
  if (["respondeu","mensagem_zap"].includes(s)) return 5;

  // Outros com follow-up marcado (retornar com data)
  if (lead.proximo_followup) return 6;

  // A · Lead novo (status novo + 0 calls)
  if (s === "novo" && count === 0) return 7;

  // nao_atendeu importado sem calls reais → trata como novo
  if (s === "nao_atendeu" && count === 0) return 7;

  // Por tentativas (nao_atendeu, retornar sem data, importados)
  if (count === 1)              return 8;   // 1 tentativa
  if (count === 2)              return 9;   // 2 tentativas
  if (count >= 3 && count <= 5) return 10;  // 3-5 tentativas
  if (count >= 6 && count <= 7) return 11;  // 6-7 tentativas
  return 12;                                // 8+ — auto-ignorar
}
type LeadList = { id: string; nome: string };
type Outcome =
  | "nao_atendeu" | "retornar" | "respondeu" | "mensagem_zap" | "interesse"
  | "visita_pendente" | "visita_agendada" | "visita_confirmada"
  | "visita_faltou" | "visita_cancelada" | "visita_remarcada"
  | "visitou"
  | "envio_documentos" | "cpf_analisado" | "credito_aprovado"
  | "contrato_gerado" | "contrato_assinado" | "boleto_pago" | "repasse" | "registro"
  | "sem_interesse" | "numero_errado" | "numero_bloqueado"
  | "ja_comprou" | "comprou_carro" | "nao_quer_mais" | "perdido" | "ignorado" | "quer_casa"
  | "personalizado"
  // legado
  | "visita" | "agendado" | "proposta" | "convertido" | "visita_cancelada"
  | "envio_doc" | "aprovacao_credito" | "analise_credito" | "proposta_aceita" | "chaves_entregues";

import { loadProfile } from "@/lib/profile";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { STATUS_COLOR, STATUS_LABELS, formatDuration, formatPhone } from "@/lib/crm";
import {
  Phone, PhoneCall, PhoneOff, SkipForward, Clock, MessageSquare,
  Plus, X, Copy, Check, Undo2, GripVertical, RefreshCw,
  CheckCircle2, RotateCcw, CalendarClock, Bell, ChevronDown, ChevronRight,
  MapPin, Eye, Pencil, Save, CalendarCheck, PhoneMissed,
} from "lucide-react";
import { toast } from "sonner";

type Lead = {
  id: string;
  nome: string;
  telefone: string;
  status: string;
  observacoes: string | null;
  origem: string | null;
  proximo_followup: string | null;
};

const OUTCOME_NEEDS_FOLLOWUP = new Set([
  "retornar", "nao_atendeu", "proposta", "respondeu", "mensagem_zap",
  "visita_pendente", "visita_agendada", "visita_confirmada",
  // legado
  "agendado", "visita",
]);

const OUTCOME_GROUPS = [
  {
    label: "Positivo",
    color: "bg-emerald-500/10 text-emerald-700 border-emerald-200 hover:bg-emerald-500/20",
    selectedColor: "bg-emerald-500 text-white border-emerald-500",
    items: [
      { value: "interesse",         label: "💬 Demonstrou interesse"  },
      { value: "visita_pendente",   label: "🎯 Quer visitar"          },
      { value: "visita_agendada",   label: "📅 Visita agendada"       },
      { value: "visita_confirmada", label: "✅ Visita confirmada"     },
      { value: "visitou",           label: "🏠 Visitou"               },
    ],
  },
  {
    label: "Retorno",
    color: "bg-amber-500/10 text-amber-700 border-amber-200 hover:bg-amber-500/20",
    selectedColor: "bg-amber-500 text-white border-amber-500",
    items: [
      { value: "nao_atendeu",     label: "📵 Não atendeu"         },
      { value: "retornar",        label: "🔄 Retornar"            },
      { value: "respondeu",       label: "💬 Respondeu"           },
      { value: "mensagem_zap",    label: "💚 Mensagem Zap"        },
      { value: "visita_faltou",   label: "🚫 Não veio"            },
      { value: "visita_remarcada",label: "📆 Remarcou visita"     },
    ],
  },
  {
    label: "Pós-visita",
    color: "bg-violet-500/10 text-violet-700 border-violet-200 hover:bg-violet-500/20",
    selectedColor: "bg-violet-500 text-white border-violet-500",
    items: [
      { value: "envio_documentos", label: "📄 Envio de docs"       },
      { value: "cpf_analisado",    label: "🔍 CPF analisado"       },
      { value: "credito_aprovado", label: "✅ Crédito aprovado"    },
      { value: "contrato_gerado",  label: "📝 Contrato gerado"     },
      { value: "contrato_assinado",label: "✍️ Contrato assinado"  },
      { value: "boleto_pago",      label: "💰 Boleto pago"         },
      { value: "repasse",          label: "🏦 Repasse"             },
      { value: "registro",         label: "🏆 Registro"            },
    ],
  },
  {
    label: "Encerrado",
    color: "bg-rose-500/10 text-rose-700 border-rose-200 hover:bg-rose-500/20",
    selectedColor: "bg-rose-500 text-white border-rose-500",
    items: [
      { value: "sem_interesse",    label: "Sem interesse"  },
      { value: "numero_errado",    label: "Nº errado"      },
      { value: "numero_bloqueado", label: "Bloqueado"      },
      { value: "ja_comprou",       label: "Já comprou"     },
      { value: "comprou_carro",    label: "Comprou carro"  },
      { value: "nao_quer_mais",    label: "Não quer mais"  },
      { value: "perdido",          label: "Perdido"        },
      { value: "ignorado",         label: "Ignorado"       },
      { value: "quer_casa",        label: "Quer casa"      },
    ],
  },
];

const OUTCOME_BADGE_COLOR: Record<string, string> = {
  proposta: "bg-emerald-500/15 text-emerald-700", visita: "bg-emerald-500/15 text-emerald-700",
  agendado: "bg-emerald-500/15 text-emerald-700", convertido: "bg-emerald-500/15 text-emerald-700",
  respondeu: "bg-emerald-500/15 text-emerald-700", mensagem_zap: "bg-emerald-500/15 text-emerald-700",
  nao_atendeu: "bg-amber-500/15 text-amber-700", retornar: "bg-amber-500/15 text-amber-700",
  sem_interesse: "bg-rose-500/15 text-rose-700", numero_errado: "bg-rose-500/15 text-rose-700",
  numero_bloqueado: "bg-rose-500/15 text-rose-700", ja_comprou: "bg-rose-500/15 text-rose-700",
  comprou_carro: "bg-rose-500/15 text-rose-700", nao_quer_mais: "bg-rose-500/15 text-rose-700",
  perdido: "bg-rose-500/15 text-rose-700", ignorado: "bg-rose-500/15 text-rose-700",
  quer_casa: "bg-rose-500/15 text-rose-700",
};

const OUTCOME_LABELS_SHORT: Record<string, string> = {
  proposta: "Proposta", visita: "Visita", agendado: "Agendado", convertido: "Convertido",
  respondeu: "Respondeu", mensagem_zap: "Msg Zap", nao_atendeu: "Não atendeu",
  retornar: "Retornar", sem_interesse: "Sem int.", numero_errado: "Nº errado",
  numero_bloqueado: "Bloqueado", ja_comprou: "Já comprou", comprou_carro: "Comprou carro",
  nao_quer_mais: "Não quer mais", perdido: "Perdido", ignorado: "Ignorado",
  quer_casa: "Quer casa", personalizado: "Personalizado",
};

const STATUS_FILTER_OPTIONS = [
  { value: "all",              label: "Todos os pendentes" },
  { value: "novo",             label: "Novos" },
  { value: "nao_atendeu",      label: "Não atendeu" },
  { value: "retornar",         label: "Retornar" },
  { value: "proposta",         label: "Proposta" },
  { value: "visita",           label: "Visita" },
  { value: "agendado",         label: "Agendado" },
  { value: "convertido",       label: "Convertido" },
  { value: "respondeu",        label: "Respondeu" },
  { value: "mensagem_zap",     label: "Mensagem Zap" },
  { value: "quer_casa",        label: "Quer casa" },
  { value: "sem_interesse",    label: "Sem interesse" },
  { value: "numero_errado",    label: "Nº errado" },
  { value: "numero_bloqueado", label: "Bloqueado" },
  { value: "ja_comprou",       label: "Já comprou" },
  { value: "comprou_carro",    label: "Comprou carro" },
  { value: "nao_quer_mais",    label: "Não quer mais" },
  { value: "perdido",          label: "Perdido" },
  { value: "ignorado",         label: "Ignorado" },
];

// ── Script storage key ────────────────────────────────────────────────────────
const SCRIPT_KEY = "dialer_script_text";
const WA_MSG_KEY = "dialer_wa_message";
const DEFAULT_WA_MSG = "Boa tarde, {firstName}. {corretorNome} da MRV aqui! Acabamos de falar ao telefone. Salva meu contato. Te aguardo para nossa visita, forte abraço! 😊";
function loadWaMsg(): string { try { return localStorage.getItem(WA_MSG_KEY) || DEFAULT_WA_MSG; } catch { return DEFAULT_WA_MSG; } }
function saveWaMsg(t: string) { try { localStorage.setItem(WA_MSG_KEY, t); } catch {} }
const DEFAULT_SCRIPT = `Olá, {firstName}! Vi aqui que há um tempo atrás você estava à procura de um imóvel para compra, certo? Estamos com uma incrível oportunidade de lançamento na Pecuária e eu queria saber se você tem disponibilidade de vir à loja para entender todas as nossas condições desse lançamento. Lembrando que as condições estão inacreditáveis por estar na planta.`;

function loadScript(): string {
  try { return localStorage.getItem(SCRIPT_KEY) || DEFAULT_SCRIPT; } catch { return DEFAULT_SCRIPT; }
}
function saveScript(text: string) {
  try { localStorage.setItem(SCRIPT_KEY, text); } catch {}
}

type CustomOutcome  = { id: string; label: string };
type PreviousCall   = { lead: Lead; callId: string; previousStatus: string; previousObservacoes: string | null };
type QueueItem      = Lead & { _done: boolean; _savedStatus?: string; _savedOutcome?: string; _savedOutcomeLabel?: string };
type ReturnSnapshot = { leadId: string; savedStatus: string; savedOutcome: string; savedOutcomeLabel?: string };

type RightTab = "script" | "objecoes" | "lembrete";

// ── CHANGE 1: Load "já contactados" from DB (all calls today), not session ───
// We fetch today's called lead IDs from `calls` table on mount.
// The session contactedTodayRef is still used as a write-through cache.

const CONTACTED_KEY = "dialer_contacted_ids";
function todayPrefix() { return new Date().toISOString().slice(0, 10); }
function loadContactedToday(): string[] {
  try {
    const raw = localStorage.getItem(CONTACTED_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (parsed.date !== todayPrefix()) return [];
    return parsed.ids ?? [];
  } catch { return []; }
}
function saveContactedToday(ids: string[]) {
  localStorage.setItem(CONTACTED_KEY, JSON.stringify({ date: todayPrefix(), ids }));
}

function toWhatsAppNumber(telefone: string): string {
  let d = telefone.replace(/\D/g, "");
  if (d.startsWith("0")) d = d.slice(1);
  if (!d.startsWith("55")) d = "55" + d;
  return d;
}

function toDatetimeLocal(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatFollowupDisplay(iso: string): string {
  const d = new Date(iso);
  return (
    d.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" }) +
    " às " +
    d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
  );
}

// Limpa nome: remove bullets/pontos/números do início.
// Percorre as palavras até achar uma com 3+ letras (nomes reais).
function cleanName(nome: string): string {
  if (!nome) return "";
  const parts = nome.trim().split(/\s+/);
  for (const part of parts) {
    const cleaned = part.replace(/^[^a-zA-ZÀ-ÿ]+/, "").replace(/[^a-zA-ZÀ-ÿ]+$/, "").trim();
    if (cleaned.length >= 3) return cleaned;
  }
  // Fallback: retorna primeira palavra limpa mesmo se < 3 chars
  return parts[0].replace(/^[^a-zA-ZÀ-ÿ]+/, "").trim() || parts[0];
}

export default function Dialer() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const [lead, setLead]                               = useState<Lead | null>(null);
  const [calling, setCalling]                         = useState(false);
  const [seconds, setSeconds]                         = useState(0);
  const [outcome, setOutcome]                         = useState<string>("nao_atendeu");
  const [note, setNote]                               = useState("");
  const [leadCalls, setLeadCalls]                     = useState<{outcome: string; started_at: string; observacao: string | null; duracao_segundos?: number}[]>([]);
  const [obsSuggOpen, setObsSuggOpen]                 = useState(false);
  const [skipMenuOpen, setSkipMenuOpen]               = useState(false);
  const [prioFilter, setPrioFilter]                   = useState<number | null>(null);
  const [prioMenuOpen, setPrioMenuOpen]               = useState(false);
  const [waMenuOpen, setWaMenuOpen]                   = useState(false);
  const [docsMenuOpen, setDocsMenuOpen]               = useState(false);
  const [followupDate, setFollowupDate]               = useState("");
  const [showFollowupField, setShowFollowupField]     = useState(false);
  // Busca global
  const [searchOpen, setSearchOpen]                   = useState(false);
  const [searchQuery, setSearchQuery]                 = useState("");
  const [searchResults, setSearchResults]             = useState<Lead[]>([]);
  const [searchLoading, setSearchLoading]             = useState(false);
  // CHANGE 2: "convertidos" stat now counts visita outcomes (visits)
  const [todayStats, setTodayStats]                   = useState({ count: 0, totalSec: 0, visitas: 0 });
  const [customs, setCustoms]                         = useState<CustomOutcome[]>([]);
  const [newOutcome, setNewOutcome]                   = useState("");
  const [addingOutcome, setAddingOutcome]             = useState(false);
  const [lists, setLists]                             = useState<LeadList[]>([]);
  const [activeList, setActiveList]                   = useState<string>("all");
  const [activeStatusFilter, setActiveStatusFilter]   = useState<string>("all");
  const [scriptCopied, setScriptCopied]               = useState(false);
  const [previousCall, setPreviousCall]               = useState<PreviousCall | null>(null);
  const [undoing, setUndoing]                         = useState(false);
  const [queue, setQueue]                             = useState<QueueItem[]>([]);
  const [loadingQueue, setLoadingQueue]               = useState(false);
  const [redoSnapshot, setRedoSnapshot]               = useState<ReturnSnapshot | null>(null);
  const [undoData, setUndoData]                         = useState<{leadId:string;prevStatus:string;leadNome:string} | null>(null);
  const [undoTimer, setUndoTimer]                       = useState<ReturnType<typeof setTimeout>|null>(null);
  const [followupsToday, setFollowupsToday]           = useState<Lead[]>([]);
  const [showFollowupBanner, setShowFollowupBanner]   = useState(true);
  const [showAllFollowups, setShowAllFollowups]       = useState(false);
  // CHANGE 4: Two lists for the Lembrete tab
  const [visitasComData, setVisitasComData]           = useState<Lead[]>([]);   // status=visita WITH proximo_followup
  const [visitasSemData, setVisitasSemData]           = useState<Lead[]>([]);   // status=visita WITHOUT proximo_followup
  const [rightTab, setRightTab]                       = useState<RightTab>("script");

  // CHANGE 3: Editable script
  const [scriptText, setScriptText]                   = useState<string>(loadScript);
  const [waMsg, setWaMsg]                             = useState<string>(loadWaMsg);
  const [editingWaMsg, setEditingWaMsg]               = useState(false);
  const [waMsgDraft, setWaMsgDraft]                   = useState("");
  const [editingScript, setEditingScript]             = useState(false);
  const [scriptDraft, setScriptDraft]                 = useState("");

  // ── Funil de script inteligente ─────────────────────────────────────────
  const [funilType, setFunilType]     = useState<"padrao" | "evento">("padrao");
  const [funilStep, setFunilStep]     = useState<string>("1");

  // Reseta funil quando muda o lead
  useEffect(() => { setFunilStep("1"); }, [lead?.id]);

  // CHANGE 1: Track DB-loaded contacted IDs
  const [dbContactedIds, setDbContactedIds]           = useState<Set<string>>(new Set());

  // Filtros do painel "Já contactados"
  const [queueMode, setQueueMode]                         = useState<"normal" | "visitas">("normal");
  const [contactedStatusFilter, setContactedStatusFilter] = useState<string>("all");
  const [contactedListFilter, setContactedListFilter]     = useState<string>("all");
  const [contactedDateFilter, setContactedDateFilter]     = useState<string>("today");
  const [contactedLeads, setContactedLeads]               = useState<QueueItem[]>([]);
  const [loadingContacted, setLoadingContacted]           = useState(false);

  const navHistoryRef     = useRef<Lead[]>([]);
  const startedAtRef      = useRef<Date | null>(null);
  const timerRef          = useRef<ReturnType<typeof setInterval> | null>(null);
  const dragIndexRef      = useRef<number | null>(null);
  const skippedIdsRef     = useRef<Set<string>>(new Set());
  const contactedTodayRef = useRef<Set<string>>(new Set(loadContactedToday()));

  const queuePending = queue.filter(l => !l._done);
  const queueDone    = queue.filter(l => l._done);
  const pendingCount = queuePending.length;
  const doneCount    = queueDone.length;
  const totalCount   = queue.length;
  const savedCount   = queueDone.filter(l => !!l._savedOutcome).length;

  // Render script with firstName substitution
  function renderScript(text: string, name: string): string {
    const firstName = name?.split(" ")[0] ?? "{Nome}";
    return text.replace(/\{firstName\}/g, firstName);
  }

  useEffect(() => {
    setFollowupDate("");
    setShowFollowupField(OUTCOME_NEEDS_FOLLOWUP.has(outcome) || outcome.startsWith("custom:"));
  }, [outcome]);

  // ── CHANGE 1: Load all contacts made today from DB ────────────────────────
  async function loadTodayContactedFromDB() {
    if (!user) return;
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const { data } = await supabase
      .from("calls")
      .select("lead_id")
      .eq("atendente_id", user.id)
      .gte("started_at", start.toISOString());
    const ids = new Set((data ?? []).map((c: any) => c.lead_id as string));
    setDbContactedIds(ids);
    // Merge into the local ref so queue logic stays consistent
    ids.forEach(id => contactedTodayRef.current.add(id));
    saveContactedToday(Array.from(contactedTodayRef.current));
    return ids;
  }

  // ── Load contacted leads (status + lista + data) ───────────────────────
  async function loadContactedLeads(
    statusFilter: string = contactedStatusFilter,
    listFilter: string   = contactedListFilter,
    dateFilter: string   = contactedDateFilter,
  ) {
    if (!user) return;
    setLoadingContacted(true);

    // Define o intervalo de data
    const startDate = new Date();
    if (dateFilter === "today") {
      startDate.setHours(0, 0, 0, 0);
    } else {
      // dateFilter é uma data ISO "YYYY-MM-DD"
      const [y, m, d] = dateFilter.split("-").map(Number);
      startDate.setFullYear(y, m - 1, d);
      startDate.setHours(0, 0, 0, 0);
    }
    const endDate = new Date(startDate);
    endDate.setHours(23, 59, 59, 999);

    // Busca calls no período
    const { data: callsData } = await supabase
      .from("calls")
      .select("lead_id, started_at")
      .eq("atendente_id", user.id)
      .gte("started_at", startDate.toISOString())
      .lte("started_at", endDate.toISOString())
      .order("started_at", { ascending: false });

    const calledIds = [...new Set((callsData ?? []).map((c: any) => c.lead_id as string))];
    if (calledIds.length === 0) { setContactedLeads([]); setLoadingContacted(false); return; }

    // Busca os leads em lotes de 50
    let allLeads: Lead[] = [];
    for (let i = 0; i < calledIds.length; i += 50) {
      const batch = calledIds.slice(i, i + 50);
      let q = supabase
        .from("leads")
        .select("id,nome,telefone,status,observacoes,origem,proximo_followup,list_id")
        .in("id", batch);
      if (statusFilter !== "all") q = q.eq("status", statusFilter);
      if (listFilter !== "all")   q = q.eq("list_id", listFilter);
      const { data: batchData } = await q;
      allLeads = [...allLeads, ...((batchData ?? []) as Lead[])];
    }

    // Deduplica mantendo ordem das calls (mais recente primeiro)
    const seen = new Set<string>();
    const unique = calledIds
      .map(id => allLeads.find(l => l.id === id))
      .filter((l): l is Lead => !!l && !seen.has(l.id) && (seen.add(l.id), true));

    setContactedLeads(unique.map(l => ({ ...l, _done: true })));
    setLoadingContacted(false);
  }

  // ── CHANGE 4: Load visitas split into com/sem data ───────────────────────
  async function undoLastStatus() {
    if (!undoData) return;
    await supabase.from("leads").update({ status: undoData.prevStatus as any }).eq("id", undoData.leadId);
    toast.success(`↩ ${cleanName(undoData.leadNome)} voltou para "${STATUS_LABELS[undoData.prevStatus] ?? undoData.prevStatus}"`);
    setUndoData(null);
    if (undoTimer) clearTimeout(undoTimer);
    load();
  }

  async function loadVisitas() {
    if (!user) return;
    const { data } = await supabase
      .from("leads")
      .select("id,nome,telefone,status,observacoes,origem,proximo_followup")
      .in("status", [
        "visita_pendente", "visita_agendada", "visita_confirmada", "visita_cancelada",
        // legado
        "visita", "agendado",
      ])
      .order("proximo_followup", { ascending: true, nullsFirst: false });

    const rows = (data ?? []) as Lead[];
    setVisitasComData(rows.filter(l => !!l.proximo_followup));
    setVisitasSemData(rows.filter(l => !l.proximo_followup));
  }

  async function loadFollowupsToday() {
    if (!user) return;
    const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
    const endOfDay   = new Date(); endOfDay.setHours(23, 59, 59, 999);
    const { data } = await supabase
      .from("leads")
      .select("id,nome,telefone,status,observacoes,origem,proximo_followup")
      .gte("proximo_followup", startOfDay.toISOString())
      .lte("proximo_followup", endOfDay.toISOString())
      .order("proximo_followup", { ascending: true });
    setFollowupsToday((data ?? []) as Lead[]);
  }

  const loadQueue = useCallback(async (): Promise<Lead[]> => {
    setLoadingQueue(true);
    skippedIdsRef.current = new Set();

    const statusesToFetch =
      activeStatusFilter === "all"
        ? (queueMode === "visitas"
            ? ["visita_pendente", "visita_agendada", "visita_confirmada", "visita_cancelada",
               "visita_faltou", "visita_remarcada", "visita_cancelada"]
            : [
                // A — sem contato
                "novo", "nao_atendeu",
                // B — atendeu
                "retornar", "respondeu", "mensagem_zap",
                // C — interesse
                "interesse",
                // D — quer visitar
                "visita_pendente", "aguardando_visita",
                // E — visita marcada
                "visita_agendada", "visita_confirmada", "visita_remarcada",
                "visita_faltou", "visita_cancelada",
                // F — visitou
                "visitou", "proposta", "aguardando_documento",
                // G — envio de docs
                "envio_documentos", "envio_doc", "proposta_aceita", "cpf_em_analise",
                // H — CPF análise
                "cpf_analisado", "analise_credito", "aguardando_aprovacao",
                // I — crédito
                "credito_aprovado", "aprovacao_credito", "contrato_preparado",
                // J — contrato
                "contrato_gerado",
                // K — assinado
                "contrato_assinado",
                // L — boleto
                "boleto_pago",
              ])
        : [activeStatusFilter];

    let allLeads: Lead[] = [];
    let from = 0;
    const batchSize = 1000;

    while (true) {
      let query = supabase
        .from("leads")
        .select("id,nome,telefone,status,observacoes,origem,proximo_followup")
        .in("status", statusesToFetch)
        .order("nome", { ascending: true })
        .range(from, from + batchSize - 1);

      if (activeList !== "all") query = query.eq("list_id", activeList);

      const { data, error } = await query;
      if (error) { toast.error("Erro ao carregar fila: " + error.message); break; }
      const batch = (data ?? []) as Lead[];
      allLeads = [...allLeads, ...batch];
      if (batch.length < batchSize) break;
      from += batchSize;
    }

    const today = todayPrefix();

    // ── Buscar contagem de calls via RPC — sem limite, sem problema com IN() ──
    const { data: callCountsData } = await supabase.rpc("get_call_counts");

    const callCountMap = new Map<string, number>();
    const lastCallDateMap = new Map<string, string>();
    const calledTodaySet = new Set<string>();

    for (const c of (callCountsData ?? []) as { lead_id: string; total_calls: number; last_call_date: string }[]) {
      callCountMap.set(c.lead_id, c.total_calls);
      if (c.last_call_date) {
        lastCallDateMap.set(c.lead_id, c.last_call_date);
        if (c.last_call_date === today) calledTodaySet.add(c.lead_id);
      }
    }

    // Enriquecer leads com dados de chamadas
    const enrichedLeads = allLeads.map(l => ({
      ...l,
      call_count:      callCountMap.get(l.id) ?? 0,
      last_call_date:  lastCallDateMap.get(l.id) ?? null,
    }));

    // ── Ordenar por prioridade ────────────────────────────────────────────────
    const sorted = enrichedLeads.sort((a, b) => {
      const pa = calcPrioridade(a, today);
      const pb = calcPrioridade(b, today);
      if (pa !== pb) return pa - pb; // menor prioridade = aparece primeiro
      // Dentro da mesma prioridade: quem ligou menos vezes aparece primeiro
      return (a.call_count ?? 0) - (b.call_count ?? 0);
    });

    // ── Marcar automaticamente como ignorado quem tem 8+ tentativas ──────────
    const paraIgnorar = sorted.filter(l =>
      (l.call_count ?? 0) >= MAX_TENTATIVAS &&
      l.status === "nao_atendeu"
    );
    if (paraIgnorar.length > 0) {
      // Batch update silencioso
      await Promise.all(
        paraIgnorar.map(l =>
          supabase.from("leads").update({ status: "ignorado" }).eq("id", l.id)
        )
      );
      if (paraIgnorar.length > 0) {
        toast.info(`${paraIgnorar.length} lead${paraIgnorar.length > 1 ? "s" : ""} com 8+ tentativas movido${paraIgnorar.length > 1 ? "s" : ""} para ignorados automaticamente`);
      }
    }

    // Debug
    const comCalls = sorted.filter(l => (l.call_count ?? 0) > 0).length;
    const semCalls = sorted.filter(l => (l.call_count ?? 0) === 0).length;
    console.log("[Dialer] call_counts da RPC:", callCountsData?.length, "| Leads com calls:", comCalls, "| Sem calls (novos):", semCalls);
    console.log("[Dialer] Amostra:", sorted.slice(0, 3).map(l => ({ nome: l.nome, call_count: l.call_count, id: l.id.slice(0,8) })));

    // Remover ignorados da fila e leads já contatados hoje
    const filaFinal = sorted.filter(l =>
      calcPrioridade(l, today) < 12 && // sem auto-ignorar — usuário decide
      (l.call_count ?? 0) < MAX_TENTATIVAS &&
      !calledTodaySet.has(l.id)
    );

    setQueue(prev => {
      const doneMap = new Map(prev.filter(l => l._done).map(l => [l.id, l]));
      return filaFinal.map(l => {
        const done = doneMap.get(l.id);
        if (done) return { ...l, _done: true, _savedStatus: done._savedStatus, _savedOutcome: done._savedOutcome, _savedOutcomeLabel: done._savedOutcomeLabel };
        if (contactedTodayRef.current.has(l.id)) return { ...l, _done: true };
        return { ...l, _done: false };
      });
    });

    setLoadingQueue(false);
    return filaFinal;
  }, [activeList, activeStatusFilter]);

  async function loadLists() {
    const { data } = await supabase.from("lead_lists").select("id,nome").order("created_at", { ascending: false });
    setLists((data ?? []) as LeadList[]);
  }

  // CHANGE 2: Count visitas (not convertidos) for today's stats
  async function loadStats() {
    if (!user) return;
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const { data } = await supabase
      .from("calls").select("duracao_segundos,outcome")
      .eq("atendente_id", user.id)
      .gte("started_at", start.toISOString());
    const list = data ?? [];
    setTodayStats({
      count: list.length,
      totalSec: list.reduce((a, c: any) => a + (c.duracao_segundos || 0), 0),
      // CHANGE 2: visitas = calls where outcome is "visita"
      visitas: list.filter((c: any) => ["visita","visita_pendente","visita_agendada","visita_confirmada"].includes(c.outcome)).length,
    });
  }

  async function loadCustoms() {
    if (!user) return;
    const { data } = await supabase
      .from("custom_outcomes").select("id,label")
      .eq("user_id", user.id).order("created_at", { ascending: true });
    setCustoms((data ?? []) as CustomOutcome[]);
  }

  // Carregar histórico de calls do lead atual
  useEffect(() => {
    if (!lead) { setLeadCalls([]); return; }
    supabase
      .from("calls")
      .select("outcome,started_at,observacao,duracao_segundos")
      .eq("lead_id", lead.id)
      .order("started_at", { ascending: false })
      .limit(20)
      .then(({ data }) => setLeadCalls((data ?? []) as any[]));
  }, [lead?.id]);

  useEffect(() => {
    navHistoryRef.current = [];
    setPreviousCall(null);
    const requestedId = searchParams.get("lead");
    if (requestedId) {
      supabase
        .from("leads")
        .select("id,nome,telefone,status,observacoes,origem,proximo_followup")
        .eq("id", requestedId)
        .maybeSingle()
        .then(({ data }) => setLead((data as Lead) ?? null));
      loadQueue();
      return;
    }
    loadQueue().then(q => {
      const first = q.find(l => !contactedTodayRef.current.has(l.id)) ?? q[0] ?? null;
      setLead(first);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeList, activeStatusFilter, searchParams.get("lead")]);

  useEffect(() => {
    if (!user) return;
    loadLists();
    loadStats();
    loadCustoms();
    loadFollowupsToday();
    loadVisitas();
    // CHANGE 1: Load contacts from DB on mount and merge with queue
    loadTodayContactedFromDB().then(() => {
      loadQueue().then(q => {
        if (!searchParams.get("lead")) {
          const first = q.find(l => !contactedTodayRef.current.has(l.id)) ?? q[0] ?? null;
          setLead(first);
        }
      });
    });
    loadContactedLeads("all");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Reload contacted panel when any filter changes
  useEffect(() => {
    if (user) loadContactedLeads(contactedStatusFilter, contactedListFilter, contactedDateFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contactedStatusFilter, contactedListFilter, contactedDateFilter, user?.id]);

  function advanceQueue(doneId: string, newStatus: string, savedOutcome: string, savedOutcomeLabel?: string) {
    contactedTodayRef.current.add(doneId);
    saveContactedToday(Array.from(contactedTodayRef.current));
    setDbContactedIds(prev => new Set([...prev, doneId]));
    setQueue(prev => {
      const updated = prev.map(l =>
        l.id === doneId
          ? { ...l, _done: true, status: newStatus, _savedStatus: newStatus, _savedOutcome: savedOutcome, _savedOutcomeLabel: savedOutcomeLabel }
          : l
      );
      // Respeitar filtro de prioridade — se grupo selecionado tiver mais leads,
      // fica no grupo. Só sai do grupo se acabar. Nunca volta para "Todos" automaticamente.
      const today = new Date().toISOString().slice(0, 10);
      const prioNow = prioFilter;
      let next: QueueItem | null = null;
      if (prioNow !== null) {
        // Tentar próximo do mesmo grupo
        next = updated.find(l => !l._done && l.id !== doneId && calcPrioridade(l as any, today) === prioNow) ?? null;
        // Se acabou o grupo, avisa mas NÃO muda automaticamente — usuário decide
        if (!next) {
          next = null; // fila do grupo acabou — mostra "nenhum pendente"
        }
      } else {
        next = updated.find(l => !l._done && l.id !== doneId) ?? null;
      }
      setLead(next);
      setNote(""); setOutcome("nao_atendeu"); setSeconds(0); setFollowupDate(""); setShowFollowupField(false);
      return updated;
    });
  }

  async function returnToQueue(item: QueueItem) {
    if (!user) return;

    // 1. Busca a call mais recente desse lead hoje
    const { data: lastCall } = await supabase
      .from("calls")
      .select("id")
      .eq("lead_id", item.id)
      .eq("atendente_id", user.id)
      .gte("started_at", new Date(new Date().setHours(0,0,0,0)).toISOString())
      .order("started_at", { ascending: false })
      .limit(1)
      .single();

    // 2. Busca o status anterior via lead_audit
    const { data: auditRow } = await supabase
      .from("lead_audit")
      .select("valor_anterior")
      .eq("lead_id", item.id)
      .eq("campo", "status")
      .order("alterado_em", { ascending: false })
      .limit(1)
      .single();

    // 3. Deleta a call se existir
    if (lastCall?.id) {
      await supabase.from("calls").delete().eq("id", lastCall.id);
    }

    // 4. Reverte o status para o anterior
    const previousStatus = auditRow?.valor_anterior ?? item.status;
    await supabase.from("leads").update({ status: previousStatus as any }).eq("id", item.id);

    // 5. Limpa do localStorage e recarrega
    contactedTodayRef.current.delete(item.id);
    saveContactedToday(Array.from(contactedTodayRef.current));
    setDbContactedIds(prev => { const n = new Set(prev); n.delete(item.id); return n; });
    await loadQueue();
    loadContactedLeads(contactedStatusFilter, contactedListFilter, contactedDateFilter);
    toast.success("Última ação desfeita — lead devolvido à fila");
  }

  function redoReturn() {
    if (!redoSnapshot) return;
    const { leadId, savedStatus, savedOutcome, savedOutcomeLabel } = redoSnapshot;
    contactedTodayRef.current.add(leadId);
    saveContactedToday(Array.from(contactedTodayRef.current));
    setDbContactedIds(prev => new Set([...prev, leadId]));
    setQueue(prev =>
      prev.map(l => l.id === leadId ? { ...l, _done: true, _savedStatus: savedStatus, _savedOutcome: savedOutcome || undefined, _savedOutcomeLabel: savedOutcomeLabel } : l)
    );
    setRedoSnapshot(null);
    toast.success("Ação refeita");
  }

  function selectFromQueue(l: QueueItem) {
    if (lead) navHistoryRef.current.push(lead);
    setLead(l);
    setNote(""); setOutcome("nao_atendeu"); setSeconds(0); setFollowupDate(""); setShowFollowupField(false);
  }

  function clearRequestedLead() {
    if (searchParams.get("lead")) { searchParams.delete("lead"); setSearchParams(searchParams, { replace: true }); }
  }

  async function addCustomOutcome() {
    if (!user || !newOutcome.trim()) return;
    setAddingOutcome(true);
    const { data, error } = await supabase
      .from("custom_outcomes")
      .insert({ user_id: user.id, label: newOutcome.trim() })
      .select("id,label")
      .single();
    setAddingOutcome(false);
    if (error) { toast.error(error.message); return; }
    setCustoms(c => [...c, data as CustomOutcome]);
    setOutcome(`custom:${data!.id}`);
    setNewOutcome("");
    toast.success("Resultado criado");
  }

  async function removeCustomOutcome(id: string) {
    const { error } = await supabase.from("custom_outcomes").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    setCustoms(c => c.filter(x => x.id !== id));
    if (outcome === `custom:${id}`) setOutcome("nao_atendeu");
  }

  function startCall() {
    if (!lead) return;
    let digits = (lead.telefone || "").replace(/\D/g, "");
    if (digits.length === 11 && !digits.startsWith("0")) digits = "0" + digits;
    else if (digits.length === 10 && !digits.startsWith("0")) digits = "0" + digits.slice(0, 2) + "9" + digits.slice(2);
    else if (digits.length === 9) digits = "031" + digits;
    if (digits.length !== 12 || !digits.startsWith("0")) {
      toast.error(`Número inválido (${digits.length} dígitos).`); return;
    }
    setCalling(true); setSeconds(0); startedAtRef.current = new Date();
    timerRef.current = setInterval(() => setSeconds(s => s + 1), 1000);
    window.open(`tel:${digits}`);
  }

  function stopTimer() {
    setCalling(false);
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }

  async function saveCall() {
    if (!lead || !user) return;
    const ended   = new Date();
    const started = startedAtRef.current ?? ended;
    stopTimer();

    const isCustom    = outcome.startsWith("custom:");

    // Outcomes que não existem no enum call_outcome do banco → salvar como personalizado
    const ENUM_OUTCOMES = new Set([
      "atendeu","nao_atendeu","retornar","agendado","convertido","sem_interesse",
      "numero_errado","personalizado","ignorado","perdido","proposta","visita",
      "quer_casa","ja_comprou","comprou_carro","nao_quer_mais","respondeu",
      "mensagem_zap","numero_bloqueado",
      "interesse","visita_pendente","visita_agendada","visita_confirmada",
      "visita_faltou","visita_cancelada","visita_remarcada","visitou",
      "envio_documentos","cpf_analisado","credito_aprovado","contrato_gerado",
      "contrato_assinado","boleto_pago","repasse","registro",
    ]);
    const rawOutcome = isCustom ? "personalizado" : outcome;
    const dbOutcome: Outcome = ENUM_OUTCOMES.has(rawOutcome) ? rawOutcome as Outcome : "personalizado";
    const customLabel = isCustom
      ? customs.find(c => `custom:${c.id}` === outcome)?.label ?? null
      : !ENUM_OUTCOMES.has(rawOutcome)
        ? (OUTCOME_LABELS[rawOutcome] ?? rawOutcome)
        : null;
    let newStatus = CRM_STATUS_FROM_OUTCOME[dbOutcome];
    const previousLeadState = { ...lead };

    // ── Lógica contextual do "Não atendeu" ────────────────────────────────
    // Só leads com status "novo" mudam para "nao_atendeu" (entram na fila de tentativas)
    // Qualquer outro status mantém __keep__ — o lead fica na etapa atual do funil
    // Mas agenda followup automático para amanhã para não sumir do radar
    if (dbOutcome === "nao_atendeu") {
      if (lead.status === "novo") {
        newStatus = "nao_atendeu";
      } else {
        newStatus = "__keep__";
        // Se não tem followup já definido, agenda para amanhã às 9h automaticamente
        if (!followupDate && !lead.proximo_followup) {
          const amanha = new Date();
          amanha.setDate(amanha.getDate() + 1);
          amanha.setHours(9, 0, 0, 0);
          setFollowupDate(amanha.toISOString().slice(0, 16));
        }
      }
    }

    // ── Regra anti-regressão: o status nunca volta para trás ───────────────
    const STAGE_ORDER = ["A","B","C","D","E","F","G","H","I","J","K","L","M","N"];

    // Perdidos SEMPRE são permitidos — encerrar não é regredir
    const isNewLost = newStatus && LOST_STATUSES.includes(newStatus);

    if (!isNewLost && newStatus && newStatus !== "__keep__") {
      const currentStageKey = FUNNEL_STAGE[lead.status] ?? "A";
      const newStageKey     = FUNNEL_STAGE[newStatus] ?? "A";
      const currentIdx      = STAGE_ORDER.indexOf(currentStageKey);
      const newIdx          = STAGE_ORDER.indexOf(newStageKey);
      if (newIdx < currentIdx) {
        console.warn(`[Dialer] Bloqueando regressão: ${lead.status} → ${newStatus}`);
        newStatus = "__keep__";
      }
    }

    // ── Lógica C→D: quem quer visitar passa automaticamente por interesse ────
    const currentStage = lead.status;
    const isSkippingC = (
      ["novo","nao_atendeu","retornar","respondeu","mensagem_zap"].includes(currentStage) &&
      ["visita_pendente","visita_agendada","visita_confirmada"].includes(newStatus ?? "")
    );
    if (isSkippingC) {
      await supabase.from("leads").update({ status: "interesse" }).eq("id", lead.id);
    }

    const followupISO = followupDate ? new Date(followupDate).toISOString() : null;

    const { data: callData, error: e1 } = await supabase.from("calls").insert({
      lead_id: lead.id, atendente_id: user.id,
      outcome: dbOutcome, outcome_label: customLabel,
      duracao_segundos: seconds, observacao: note || null,
      started_at: started.toISOString(), ended_at: ended.toISOString(),
    }).select("id").single();
    if (e1) { toast.error(e1.message); return; }

    // Atualizar status do lead — só campos que realmente mudam
    const updatePayload: any = { assigned_to: user.id };
    if (newStatus !== "__keep__") {
      updatePayload.status = newStatus;
    }
    // Só atualiza followup se foi definido explicitamente
    if (followupISO !== null) {
      updatePayload.proximo_followup = followupISO;
    }

    // Se só tem assigned_to (sem status nem followup), não faz update nos leads
    // para não disparar o trigger de auditoria desnecessariamente
    const hasRealChange = newStatus !== "__keep__" || followupISO !== null;
    if (hasRealChange) {
      const { error: e2 } = await supabase.from("leads").update(updatePayload).eq("id", lead.id);
      if (e2) { toast.error(e2.message); return; }
    } else {
      // Só atualiza assigned_to sem disparar auditoria
      await supabase.from("leads").update({ assigned_to: user.id }).eq("id", lead.id);
    }

    setPreviousCall({ lead: previousLeadState, callId: callData.id, previousStatus: previousLeadState.status, previousObservacoes: previousLeadState.observacoes });
    navHistoryRef.current.push(previousLeadState);

    toast.success("Ligação registrada" + (followupISO ? " · follow-up agendado" : ""));
    clearRequestedLead();
    loadStats();
    loadFollowupsToday();
    loadVisitas();
    loadContactedLeads(contactedStatusFilter, contactedListFilter, contactedDateFilter);
    advanceQueue(lead.id, newStatus === "__keep__" ? lead.status : newStatus, dbOutcome, customLabel ?? undefined);
  }

  function skipLead() {
    if (!lead) return;
    clearRequestedLead();
    const currentId = lead.id;
    skippedIdsRef.current.add(currentId);
    setQueue(prev => {
      const next =
        prev.find(l => !l._done && l.id !== currentId && !skippedIdsRef.current.has(l.id)) ??
        prev.find(l => !l._done && l.id !== currentId) ?? null;
      setLead(next);
      setNote(""); setOutcome("nao_atendeu"); setSeconds(0); setFollowupDate(""); setShowFollowupField(false);
      return prev;
    });
  }

  async function goToPrevious() {
    if (navHistoryRef.current.length === 0 && !previousCall) {
      toast.error("Nenhum contato anterior nesta sessão"); return;
    }
    setUndoing(true);
    try {
      if (previousCall && user) {
        const { error: e1 } = await supabase.from("calls").delete().eq("id", previousCall.callId);
        if (e1) throw e1;
        const { error: e2 } = await supabase.from("leads").update({
          status: previousCall.previousStatus as any,
          observacoes: previousCall.previousObservacoes,
        }).eq("id", previousCall.lead.id);
        if (e2) throw e2;
        contactedTodayRef.current.delete(previousCall.lead.id);
        saveContactedToday(Array.from(contactedTodayRef.current));
        setDbContactedIds(prev => { const n = new Set(prev); n.delete(previousCall.lead.id); return n; });
        setQueue(q => q.map(l =>
          l.id === previousCall.lead.id
            ? { ...l, _done: false, status: previousCall.previousStatus, _savedStatus: undefined, _savedOutcome: undefined }
            : l
        ));
        skippedIdsRef.current.delete(previousCall.lead.id);
        setPreviousCall(null);
        await loadStats();
        loadContactedLeads(contactedStatusFilter, contactedListFilter, contactedDateFilter);
        // Recarrega a fila e avança para o próximo lead
        const newQueue = await loadQueue();
        const next = newQueue.find(l => !l._done && l.id !== previousCall.lead.id) ?? null;
        setLead(next);
        setNote(""); setOutcome("nao_atendeu"); setSeconds(0); setFollowupDate(""); setShowFollowupField(false);
        toast.success("Ligação desfeita — lead devolvido à fila");
        return; // já tratou tudo, não cai no navHistory abaixo
      }
      const prev = navHistoryRef.current.pop();
      if (prev) { setLead(prev); setNote(""); setOutcome("nao_atendeu"); setSeconds(0); setFollowupDate(""); setShowFollowupField(false); }
    } catch (err: any) {
      toast.error(err.message ?? "Erro ao voltar");
    } finally { setUndoing(false); }
  }

  // Busca global de leads
  async function searchLeads(q: string) {
    if (q.trim().length < 2) { setSearchResults([]); return; }
    setSearchLoading(true);
    const clean = q.replace(/\D/g, "");
    let query = supabase.from("leads").select("id,nome,telefone,status,observacoes,origem,proximo_followup").limit(8);
    if (clean.length >= 8) {
      query = query.ilike("telefone", `%${clean}%`);
    } else {
      query = query.ilike("nome", `%${q.trim()}%`);
    }
    const { data } = await query;
    setSearchResults((data ?? []) as Lead[]);
    setSearchLoading(false);
  }

  function openSearch() { setSearchOpen(true); setSearchQuery(""); setSearchResults([]); }
  function closeSearch() { setSearchOpen(false); setSearchQuery(""); setSearchResults([]); }
  function selectSearchResult(l: Lead) {
    closeSearch();
    requestLead(l.id);
  }

  function buildWaMessage(nome: string): string {
    const firstName = cleanName(nome);
    return waMsg.replace(/\{firstName\}/g, firstName);
  }

  // Nome do atendente — sempre primeiro nome limpo
  const attendeeName = "Pedro";

  // Formata a data do followup do lead de forma amigável
  function formatVisitDate(): string {
    if (!lead?.proximo_followup) return "em breve";
    const d = new Date(lead.proximo_followup);
    return d.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })
      + " às "
      + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  }

  // Mensagem 1 — Acabou de falar, se apresentando
  function buildWaMsg1(nome: string): string {
    const first = cleanName(nome);
    return `Olá ${first}! 😊 Foi um prazer falar com você agora. Sou ${attendeeName} da MRV. Salva meu contato para facilitar nossa comunicação! Te aguardo na visita. Qualquer dúvida pode me chamar aqui. 🏠`;
  }

  // Mensagem 2 — Tentei ligar, sem resposta (pré-visita)
  function buildWaMsg2(nome: string): string {
    const first = cleanName(nome);
    const date  = formatVisitDate();
    return `Olá ${first}! 😊 Tentei entrar em contato agora mas não consegui. Queria confirmar sua visita para ${date}. Qualquer dúvida, pode me chamar aqui. Sou ${attendeeName} da MRV! 🏠`;
  }

  // Mensagem 3 — Faltou à visita, tentando remarcar
  function buildWaMsg3(nome: string): string {
    const first = cleanName(nome);
    return `Olá ${first}! Tentei te ligar agora. Percebi que algo deve ter acontecido e você não conseguiu vir. Sem problema! 😊 Quando seria o melhor momento para remarcarmos sua visita? Sou ${attendeeName} da MRV!`;
  }

  // ── Lista de documentos por perfil ──────────────────────────────────────────
  const DOCS_AUTONOMO = [
    "1. Identidade (RG ou CNH)",
    "2. CPF",
    "3. Comprovante de Residência (últimos 3 meses)",
    "4. Certidão de Nascimento (ou casamento, se casado)",
    "5. Extrato Bancário (6 meses + limite especial se houver)",
    "6. Imposto de Renda (se declarar)",
  ];

  const DOCS_CLT = [
    "1. Identidade (RG ou CNH)",
    "2. CPF",
    "3. Comprovante de Residência (últimos 3 meses)",
    "4. 3 Últimos Contracheques",
    "5. Certidão de Nascimento (ou casamento, se casado)",
    "6. Extrato do FGTS (app FGTS - Caixa)",
    "7. Carteira de Trabalho (todas as páginas assinadas)",
    "8. Imposto de Renda (se declarar)",
  ];

  function buildDocsMsg(perfil: "autonomo" | "clt"): string {
    const nome  = lead ? cleanName(lead.nome) : "cliente";
    const lista = perfil === "autonomo" ? DOCS_AUTONOMO : DOCS_CLT;
    const label = perfil === "autonomo" ? "Autônomo / Informal" : "CLT / Formal";
    const body = [
      `Olá ${nome}! 😊 Para darmos continuidade à sua análise de crédito, preciso dos seguintes documentos:`,
      "",
      `📋 *${label}*`,
      "",
      lista.join("\n"),
      "",
      "✅ Documentos legíveis e sem rasuras",
      "✅ Casados: incluir documentos do cônjuge",
      "",
      `Qualquer dúvida pode me chamar! Sou ${attendeeName} da MRV 🏠`,
    ].join("\n");
    return body;
  }

  function openWa(msg: string, app = false) {
    if (!lead) return;
    const phone   = toWhatsAppNumber(lead.telefone);
    const encoded = encodeURIComponent(msg);
    const url     = app
      ? `https://wa.me/${phone}?text=${encoded}`
      : `https://web.whatsapp.com/send?phone=${phone}&text=${encoded}`;
    window.open(url, "_blank");
  }
  function openWhatsAppWeb() {
    if (!lead) return;
    const msg = encodeURIComponent(buildWaMessage(lead.nome));
    window.open(`https://web.whatsapp.com/send?phone=${toWhatsAppNumber(lead.telefone)}&text=${msg}`, "_blank");
  }
  function openWhatsAppApp() {
    if (!lead) return;
    const msg = encodeURIComponent(buildWaMessage(lead.nome));
    window.open(`https://wa.me/${toWhatsAppNumber(lead.telefone)}?text=${msg}`, "_blank");
  }

  function onDragStart(index: number) { dragIndexRef.current = index; }
  function onDragOver(e: React.DragEvent, index: number) {
    e.preventDefault();
    const from = dragIndexRef.current;
    if (from === null || from === index) return;
    setQueue(prev => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(index, 0, moved);
      dragIndexRef.current = index;
      return next;
    });
  }
  function onDragEnd() { dragIndexRef.current = null; }

  // ── CHANGE 3: Script edit handlers ───────────────────────────────────────
  function startEditScript() {
    setScriptDraft(scriptText);
    setEditingScript(true);
  }
  function saveEditScript() {
    setScriptText(scriptDraft);
    saveScript(scriptDraft);
    setEditingScript(false);
    toast.success("Script atualizado");
  }
  function cancelEditScript() {
    setEditingScript(false);
    setScriptDraft("");
  }
  function resetScript() {
    setScriptDraft(DEFAULT_SCRIPT);
  }

  // WA message edit handlers
  function startEditWaMsg() { setWaMsgDraft(waMsg); setEditingWaMsg(true); }
  function saveWaMsgEdit() { setWaMsg(waMsgDraft); saveWaMsg(waMsgDraft); setEditingWaMsg(false); toast.success("Mensagem do WhatsApp atualizada"); }
  function cancelEditWaMsg() { setEditingWaMsg(false); setWaMsgDraft(""); }

  // Keyboard shortcuts
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      const inInput = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";

      // Ctrl+S funciona de qualquer lugar (inclusive dentro do textarea de observação)
      if ((e.key === "s" || e.key === "S") && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        if (lead && !calling) saveCall();
        return;
      }

      // Ctrl+K abre busca global
      if ((e.key === "k" || e.key === "K") && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        openSearch();
        return;
      }

      if (inInput) return;
      if (e.key === "Enter" && !calling && lead) { e.preventDefault(); startCall(); }
      if (e.key === " " && !calling && lead)     { e.preventDefault(); startCall(); }
      if (e.key === "ArrowRight" && !calling)    { e.preventDefault(); skipLead(); }
      // Outcome hotkeys (só quando não está ligando)
      if (!calling) {
        if (e.key === "1") { e.preventDefault(); setOutcome("nao_atendeu"); toast.info("Não atendeu"); }
        if (e.key === "2") { e.preventDefault(); setOutcome("visita_pendente"); toast.info("Quer visitar 🎯"); }
        if (e.key === "3") { e.preventDefault(); setOutcome("ja_comprou");  toast.info("Já comprou"); }
        if (e.key === "4") { e.preventDefault(); setOutcome("sem_interesse"); toast.info("Sem interesse"); }
        if (e.key === "5") { e.preventDefault(); setOutcome("retornar");    toast.info("Retornar"); }
        if (e.key === "6") { e.preventDefault(); setOutcome("proposta");    toast.info("Proposta"); }
        if (e.key === "v" || e.key === "V") { e.preventDefault(); goToPrevious(); }
        if (e.key === "s" || e.key === "S") { e.preventDefault(); if (lead) saveCall(); }
      }
    }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [calling, lead]);

  function copyScript() {
    const rendered = renderScript(scriptText, lead?.nome ?? "");
    navigator.clipboard.writeText(rendered);
    setScriptCopied(true);
    setTimeout(() => setScriptCopied(false), 2000);
  }

  // ── CHANGE 4: Visita actions (veio / não veio) ────────────────────────────
  async function markVisitaVeio(l: Lead) {
    // "convertido" = Realizada na página de Visitas
    const { error } = await supabase.from("leads").update({ status: "convertido" as any }).eq("id", l.id);
    if (error) { toast.error(error.message); return; }
    toast.success(`${l.nome.split(" ")[0]} marcado como Realizada ✅`);
    loadVisitas();
    loadStats();
  }

  async function markVisitaNaoVeio(l: Lead) {
    // "nao_atendeu" = Não compareceu na página de Visitas
    // Mantém proximo_followup para histórico; não some da fila de visitas
    const { error } = await supabase.from("leads").update({
      status: "nao_atendeu" as any,
      // NÃO altera observacoes — registrar em calls.observacao se necessário
    }).eq("id", l.id);
    if (error) { toast.error(error.message); return; }
    toast.success(`${l.nome.split(" ")[0]} marcado como Não compareceu`);
    loadVisitas();
  }

  const activeListName  = lists.find(l => l.id === activeList)?.nome ?? "Todas as listas";
  const firstName = lead ? cleanName(lead.nome) : "{Nome}";
  const visitasHoje     = visitasComData; // for badge count

  return (
    <div className="p-8 max-w-[1600px] mx-auto">

      {/* ── Modal Busca Global Ctrl+K ─────────────────────────────────────── */}
      {searchOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 bg-black/40 backdrop-blur-sm" onClick={closeSearch}>
          <div className="bg-background rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 px-4 py-3 border-b">
              <svg className="h-4 w-4 text-muted-foreground shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
              <input
                autoFocus
                className="flex-1 bg-transparent outline-none text-sm placeholder:text-muted-foreground"
                placeholder="Buscar por nome ou telefone… (Esc para fechar)"
                value={searchQuery}
                onChange={e => { setSearchQuery(e.target.value); searchLeads(e.target.value); }}
                onKeyDown={e => { if (e.key === "Escape") closeSearch(); }}
              />
              {searchLoading && <span className="text-xs text-muted-foreground">buscando…</span>}
            </div>
            <div className="max-h-80 overflow-y-auto">
              {searchResults.length === 0 && searchQuery.length >= 2 && !searchLoading && (
                <div className="p-6 text-center text-sm text-muted-foreground">Nenhum lead encontrado</div>
              )}
              {searchResults.length === 0 && searchQuery.length < 2 && (
                <div className="p-6 text-center text-sm text-muted-foreground">Digite nome ou telefone para buscar</div>
              )}
              {searchResults.map(l => (
                <button key={l.id} onClick={() => selectSearchResult(l)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors text-left border-b last:border-0">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{l.nome}</div>
                    <div className="text-xs text-muted-foreground">{formatPhone(l.telefone)}</div>
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0 ${STATUS_COLOR[l.status] ?? "bg-muted text-muted-foreground"}`}>
                    {STATUS_LABELS[l.status] ?? l.status}
                  </span>
                </button>
              ))}
            </div>
            <div className="px-4 py-2 border-t bg-muted/30 flex justify-between text-[10px] text-muted-foreground">
              <span>Enter para selecionar</span>
              <span>Esc para fechar</span>
            </div>
          </div>
        </div>
      )}

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <header className="mb-8 flex items-end justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold">Discador</h1>
          <p className="text-muted-foreground">
            {activeList === "all" ? "Todas as listas" : `Lista: ${activeListName}`}
            {" — "}
            <span className="text-foreground font-medium">{pendingCount}</span> faltam
            {doneCount > 0 && (
              <>
                {" · "}
                <span className="text-muted-foreground">{doneCount} já ligados</span>
                {" · "}
                <span className="text-foreground font-medium">{totalCount} total</span>
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <StatBox icon={<Phone className="h-4 w-4" />}  label="Hoje"        value={String(contactedLeads.length || dbContactedIds.size)} />
          <StatBox icon={<Clock className="h-4 w-4" />}  label="Tempo total" value={formatDuration(todayStats.totalSec)} />
          <StatBox icon={<MapPin className="h-4 w-4" />} label="Visitas"     value={String(todayStats.visitas)} />
          {/* Meta progress */}
          {(() => {
            const profile = loadProfile();
            const done = contactedLeads.length || dbContactedIds.size || 0;
            const pct = Math.min(100, Math.round((done / profile.metaLigacoes) * 100));
            const color = pct >= 100 ? "bg-emerald-500" : pct >= 60 ? "bg-amber-500" : "bg-blue-500";
            return (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted/50 border">
                <div className="flex flex-col min-w-[80px]">
                  <div className="flex justify-between text-[10px] mb-0.5">
                    <span className="text-muted-foreground">Meta: {profile.metaLigacoes}</span>
                    <span className={`font-bold ${pct >= 100 ? "text-emerald-600" : "text-foreground"}`}>{pct}%</span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden w-20">
                    <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }}/>
                  </div>
                </div>
                {pct >= 100 && <span className="text-sm">🎉</span>}
              </div>
            );
          })()}
        </div>
      </header>

      {/* ── Banner de desfazer ─────────────────────────────────────────────── */}
      {undoData && (
        <div className="mb-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 flex items-center gap-3">
          <span className="text-sm text-amber-800 flex-1">
            ↩ Deseja desfazer a mudança de <strong>{cleanName(undoData.leadNome)}</strong>?
          </span>
          <button onClick={undoLastStatus}
            className="px-3 py-1.5 rounded-lg bg-amber-600 text-white text-xs font-bold hover:bg-amber-700 transition-colors">
            Desfazer
          </button>
          <button onClick={() => setUndoData(null)}
            className="px-2 py-1.5 rounded-lg text-amber-600 text-xs hover:bg-amber-100 transition-colors">
            Ignorar
          </button>
        </div>
      )}

      {/* ── Banner de follow-ups do dia ─────────────────────────────────────── */}
      {followupsToday.length > 0 && showFollowupBanner && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 flex items-start gap-3">
          <Bell className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-800 mb-1">
              {followupsToday.length} follow-up{followupsToday.length > 1 ? "s" : ""} agendado{followupsToday.length > 1 ? "s" : ""} para hoje
            </p>
            <div className="flex flex-wrap gap-2">
              {(showAllFollowups ? followupsToday : followupsToday.slice(0, 5)).map(l => (
                <button
                  key={l.id}
                  onClick={() => {
                    if (lead) navHistoryRef.current.push(lead);
                    setLead(l);
                    setNote(""); setOutcome("nao_atendeu"); setSeconds(0); setFollowupDate(""); setShowFollowupField(false);
                  }}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-100 border border-amber-200 text-xs font-medium text-amber-800 hover:bg-amber-200 transition-colors"
                >
                  <CalendarClock className="h-3 w-3" />
                  {cleanName(l.nome)}
                  {l.proximo_followup && (
                    <span className="text-amber-600">
                      · {new Date(l.proximo_followup).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  )}
                  <ChevronRight className="h-3 w-3" />
                </button>
              ))}
              {followupsToday.length > 5 && !showAllFollowups && (
                <button
                  onClick={() => setShowAllFollowups(true)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-200 border border-amber-300 text-xs font-semibold text-amber-800 hover:bg-amber-300 transition-colors"
                >
                  +{followupsToday.length - 5} mais →
                </button>
              )}
              {showAllFollowups && followupsToday.length > 5 && (
                <button
                  onClick={() => setShowAllFollowups(false)}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-amber-700 hover:bg-amber-200 transition-colors"
                >
                  ← menos
                </button>
              )}
            </div>
          </div>
          <button onClick={() => setShowFollowupBanner(false)} className="text-amber-500 hover:text-amber-700 transition-colors shrink-0">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ── Filtros ──────────────────────────────────────────────────────────── */}
      <Card className="p-4 mb-6 shadow-card flex flex-wrap items-center gap-4">
        <div className="text-sm font-medium text-muted-foreground whitespace-nowrap">Discar de:</div>
        <Select value={activeList} onValueChange={setActiveList}>
          <SelectTrigger className="w-64"><SelectValue placeholder="Selecionar lista…" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">📋 Todas as listas</SelectItem>
            {lists.map(l => <SelectItem key={l.id} value={l.id}>{l.nome}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="text-sm font-medium text-muted-foreground whitespace-nowrap">Status:</div>
        <Select value={activeStatusFilter} onValueChange={setActiveStatusFilter}>
          <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
          <SelectContent>
            {STATUS_FILTER_OPTIONS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <button
          onClick={openSearch}
          className="ml-auto text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors mr-3"
        >
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          Buscar lead <kbd className="ml-1 text-[9px] bg-muted px-1 rounded">Ctrl+K</kbd>
        </button>
        <button
          onClick={() => loadQueue()}
          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loadingQueue ? "animate-spin" : ""}`} />
          Recarregar fila
        </button>
      </Card>

      <div className="grid grid-cols-[260px_1fr_260px] gap-6 items-start">

        {/* ── ESQUERDA: Já contactados + fila ─────────────────────────────── */}
        <Card className="shadow-card flex flex-col" style={{ maxHeight: "calc(100vh - 220px)" }}>
          <div className="px-3 py-3 border-b shrink-0 space-y-2">
            <h3 className="font-display font-semibold text-sm flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              Já contactados
              <span className="ml-auto text-xs font-normal text-muted-foreground">
                {contactedLeads.length}
              </span>
            </h3>

            {/* Filtro de data — hoje + últimos 7 dias */}
            <select
              value={contactedDateFilter}
              onChange={e => setContactedDateFilter(e.target.value)}
              className="w-full text-xs rounded-md border border-input bg-background px-2 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="today">Hoje</option>
              {Array.from({ length: 7 }, (_, i) => {
                const d = new Date(); d.setDate(d.getDate() - (i + 1));
                const iso = d.toISOString().slice(0, 10);
                const label = d.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" });
                return <option key={iso} value={iso}>{label}</option>;
              })}
            </select>

            {/* Filtro de lista */}
            <select
              value={contactedListFilter}
              onChange={e => setContactedListFilter(e.target.value)}
              className="w-full text-xs rounded-md border border-input bg-background px-2 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="all">Todas as listas</option>
              {lists.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
            </select>

            {/* Filtro de status */}
            <select
              value={contactedStatusFilter}
              onChange={e => setContactedStatusFilter(e.target.value)}
              className="w-full text-xs rounded-md border border-input bg-background px-2 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="all">Todos os status</option>
              <option value="retornar">Retornar</option>
              <option value="nao_atendeu">Não atendeu</option>
              <option value="visita_agendada">Visita agendada</option>
              <option value="visita_confirmada">Visita confirmada</option>
              <option value="visita_pendente">Quer visitar</option>
              <option value="visita_cancelada">Visita cancelada</option>
              <option value="proposta">Proposta</option>
              <option value="convertido">Convertido</option>
              <option value="respondeu">Respondeu</option>
              <option value="mensagem_zap">Mensagem Zap</option>
              <option value="sem_interesse">Sem interesse</option>
              <option value="numero_errado">Nº errado</option>
              <option value="numero_bloqueado">Bloqueado</option>
              <option value="ja_comprou">Já comprou</option>
              <option value="comprou_carro">Comprou carro</option>
              <option value="nao_quer_mais">Não quer mais</option>
              <option value="perdido">Perdido</option>
              <option value="ignorado">Ignorado</option>
              <option value="quer_casa">Quer casa</option>
            </select>

            {redoSnapshot && (
              <button
                onClick={redoReturn}
                className="w-full flex items-center justify-center gap-1.5 text-xs font-medium px-2 py-1.5 rounded-md bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100 transition-colors"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Refazer (marcar como contactado)
              </button>
            )}
          </div>

          <div className="overflow-y-auto" style={{ maxHeight: "288px" }}>
            {loadingContacted ? (
              <div className="p-4 text-center text-sm text-muted-foreground">Carregando…</div>
            ) : contactedLeads.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
                <CheckCircle2 className="h-8 w-8 text-muted-foreground/30" />
                <span>Nenhum contato<br />com este status hoje</span>
              </div>
            ) : (
              contactedLeads.map(l => {
                const isActive   = lead?.id === l.id;
                const badgeLabel = STATUS_LABELS[l.status] ?? l.status;
                const badgeColor = STATUS_COLOR[l.status] ?? "bg-muted text-muted-foreground";
                return (
                  <div
                    key={l.id}
                    onClick={() => selectFromQueue(l)}
                    className={`flex items-center gap-2 px-3 py-2.5 border-b last:border-b-0 cursor-pointer transition-colors select-none ${
                      isActive ? "bg-primary/10 border-l-2 border-l-primary" : "hover:bg-muted/40"
                    }`}
                  >
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className={`text-sm font-medium truncate ${isActive ? "text-primary" : ""}`}>{l.nome}</div>
                      <div className="text-xs text-muted-foreground truncate">{formatPhone(l.telefone)}</div>
                    </div>
                    <Badge variant="secondary" className={`text-[10px] px-1.5 shrink-0 ${badgeColor}`}>{badgeLabel}</Badge>
                    <button
                      onClick={e => { e.stopPropagation(); returnToQueue(l); }}
                      title="Devolver à fila"
                      className="ml-0.5 shrink-0 p-1 rounded text-muted-foreground hover:text-amber-600 hover:bg-amber-50 transition-colors"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })
            )}
          </div>

          {pendingCount > 0 && (
            <div className="border-t shrink-0">
              <div className="px-3 py-1.5 bg-muted/30 flex items-center gap-1.5">
                <GripVertical className="h-3 w-3 text-muted-foreground" />
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Fila — {pendingCount} pendentes</span>
              </div>

              {/* ── Filtro de prioridade — dropdown ────────────────────── */}
              {(() => {
                const GRUPOS = [
                  { prio: null, label: "Todos",              emoji: "📋", count: queuePending.length },
                  { prio: 0,    label: "E · Visita marcada", emoji: "📅", count: queuePending.filter(l => calcPrioridade(l as any, todayPrefix()) === 0).length },
                  { prio: 1,    label: "E · Não compareceu", emoji: "⚠️", count: queuePending.filter(l => calcPrioridade(l as any, todayPrefix()) === 1).length },
                  { prio: 2,    label: "F→L · Pós-visita",  emoji: "🏠", count: queuePending.filter(l => calcPrioridade(l as any, todayPrefix()) === 2).length },
                  { prio: 3,    label: "D · Quer visitar",  emoji: "🎯", count: queuePending.filter(l => calcPrioridade(l as any, todayPrefix()) === 3).length },
                  { prio: 4,    label: "C · Interesse",     emoji: "💬", count: queuePending.filter(l => calcPrioridade(l as any, todayPrefix()) === 4).length },
                  { prio: 5,    label: "B · Respondeu/Zap", emoji: "💬", count: queuePending.filter(l => calcPrioridade(l as any, todayPrefix()) === 5).length },
                  { prio: 6,    label: "Follow-up marcado", emoji: "🔔", count: queuePending.filter(l => calcPrioridade(l as any, todayPrefix()) === 6).length },
                  { prio: 7,    label: "A · Leads novos",   emoji: "🆕", count: queuePending.filter(l => calcPrioridade(l as any, todayPrefix()) === 7).length },
                  { prio: 8,    label: "1 tentativa",       emoji: "📞", count: queuePending.filter(l => calcPrioridade(l as any, todayPrefix()) === 8).length },
                  { prio: 9,    label: "2 tentativas",      emoji: "📞", count: queuePending.filter(l => calcPrioridade(l as any, todayPrefix()) === 9).length },
                  { prio: 10,   label: "3-5 tentativas",    emoji: "🔄", count: queuePending.filter(l => calcPrioridade(l as any, todayPrefix()) === 10).length },
                  { prio: 11,   label: "6+ tentativas",     emoji: "🔴", count: queuePending.filter(l => calcPrioridade(l as any, todayPrefix()) === 11).length },
                ] as { prio: number | null; label: string; emoji: string; count: number }[];

                const selected = GRUPOS.find(g => g.prio === prioFilter) ?? GRUPOS[0];

                return (
                  <div className="px-2 py-2 border-b bg-muted/20 relative">
                    <div className="text-[9px] uppercase tracking-widest text-muted-foreground font-semibold px-1 mb-1">Prioridade</div>
                    <div className="relative">
                      <button
                        onClick={() => setPrioMenuOpen(v => !v)}
                        className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg border bg-background text-xs font-semibold hover:bg-muted transition-colors">
                        <span>{selected.emoji}</span>
                        <span className="flex-1 text-left truncate">{selected.label}</span>
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-muted tabular-nums">{selected.count}</span>
                        <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${prioMenuOpen ? "rotate-180" : ""}`}/>
                      </button>

                      {prioMenuOpen && (
                        <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-popover border rounded-xl shadow-lg overflow-hidden">
                          {GRUPOS.map(g => (
                            <button key={String(g.prio)}
                              onClick={() => { setPrioFilter(g.prio); setPrioMenuOpen(false); }}
                              className={`w-full flex items-center gap-2 px-3 py-2 text-xs text-left transition-colors hover:bg-muted ${prioFilter === g.prio ? "bg-primary/10 font-bold" : ""}`}>
                              <span>{g.emoji}</span>
                              <span className="flex-1 truncate">{g.label}</span>
                              <span className="text-[10px] font-bold tabular-nums text-muted-foreground">{g.count}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}
              <div className="overflow-y-auto" style={{ maxHeight: "200px" }}>
                {queuePending
                .filter(l => prioFilter === null || calcPrioridade(l as any, todayPrefix()) === prioFilter)
                .map((l, idx) => {
                  const isActive = lead?.id === l.id;
                  return (
                    <div
                      key={l.id}
                      draggable
                      onDragStart={() => onDragStart(idx)}
                      onDragOver={e => onDragOver(e, idx)}
                      onDragEnd={onDragEnd}
                      onClick={() => selectFromQueue(l)}
                      className={`flex items-center gap-2 px-3 py-2 border-b last:border-b-0 cursor-pointer transition-colors select-none ${
                        isActive ? "bg-primary/10 border-l-2 border-l-primary" : "hover:bg-muted/40"
                      }`}
                    >
                      <GripVertical className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0 cursor-grab" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1">
                        {(() => {
                          const count = (l as any).call_count ?? 0;
                          const p = calcPrioridade(l as any, todayPrefix());
                          if (p === 0) return <span className="text-[8px] font-bold px-1 py-0.5 rounded bg-violet-100 text-violet-700 shrink-0">📅 E</span>;
                          if (p === 1) return <span className="text-[8px] font-bold px-1 py-0.5 rounded bg-rose-100 text-rose-700 shrink-0">⚠️ E</span>;
                          if (p === 2) return <span className="text-[8px] font-bold px-1 py-0.5 rounded bg-emerald-100 text-emerald-700 shrink-0">🏠 F+</span>;
                          if (p === 3) return <span className="text-[8px] font-bold px-1 py-0.5 rounded bg-amber-100 text-amber-700 shrink-0">🎯 D</span>;
                          if (p === 4) return <span className="text-[8px] font-bold px-1 py-0.5 rounded bg-cyan-100 text-cyan-700 shrink-0">💬 C</span>;
                          if (p === 5) return <span className="text-[8px] font-bold px-1 py-0.5 rounded bg-blue-100 text-blue-700 shrink-0">💬 B</span>;
                          if (p === 6) return <span className="text-[8px] font-bold px-1 py-0.5 rounded bg-sky-100 text-sky-700 shrink-0">🔔</span>;
                          if (p === 7) return <span className="text-[8px] font-bold px-1 py-0.5 rounded bg-green-100 text-green-700 shrink-0">🆕</span>;
                          return <span className="text-[8px] font-bold px-1 py-0.5 rounded bg-muted text-muted-foreground shrink-0">{count}x</span>;
                        })()}
                      </div>
                      <div className={`text-xs font-medium truncate ${isActive ? "text-primary" : ""}`}>
                          {idx + 1}. {l.nome}
                        </div>
                        {l.proximo_followup && (
                          <div className="text-[10px] text-amber-600 flex items-center gap-0.5">
                            <CalendarClock className="h-2.5 w-2.5" />
                            {formatFollowupDisplay(l.proximo_followup)}
                          </div>
                        )}
                      </div>
                      <Badge variant="secondary" className={`text-[10px] px-1.5 shrink-0 ${STATUS_COLOR[l.status]}`}>
                        {STATUS_LABELS[l.status]}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </Card>

        {/* ── CENTRO: Card principal ────────────────────────────────────────── */}
        <Card className="p-8 shadow-card">
          {!lead ? (
            <div className="text-center py-16">
              <p className="text-muted-foreground">Nenhum lead pendente com esse filtro. 🎉</p>
              <div className="flex gap-2 justify-center mt-4 flex-wrap">
                {activeList !== "all" && (
                  <Button variant="outline" onClick={() => setActiveList("all")}>Ver todas as listas</Button>
                )}
                {activeStatusFilter !== "all" && (
                  <Button variant="outline" onClick={() => setActiveStatusFilter("all")}>Ver todos os status</Button>
                )}
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between mb-6">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge className={STATUS_COLOR[lead.status]} variant="secondary">{STATUS_LABELS[lead.status] ?? lead.status}</Badge>
                    {FUNNEL_STAGE[lead.status] && (() => {
                      const stage = FUNNEL_STAGES.find(s => s.key === FUNNEL_STAGE[lead.status]);
                      return stage ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold border"
                          style={{ backgroundColor: stage.light, color: stage.color, borderColor: stage.color + "40" }}>
                          {stage.emoji} {stage.key} · {stage.label}
                        </span>
                      ) : null;
                    })()}
                  </div>
                  <h2 className="font-display text-2xl font-bold mt-3">{lead.nome}</h2>
                  <a href={`tel:${lead.telefone}`} className="text-3xl font-display font-semibold text-secondary tabular-nums">
                    {formatPhone(lead.telefone)}
                  </a>
                  {lead.origem && <p className="text-xs text-muted-foreground mt-1">Origem: {lead.origem}</p>}
                  {lead.proximo_followup && (
                    <div className="inline-flex items-center gap-1.5 mt-2 px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-200 text-xs font-medium text-amber-700">
                      <CalendarClock className="h-3.5 w-3.5" />
                      Follow-up: {formatFollowupDisplay(lead.proximo_followup)}
                    </div>
                  )}
                </div>
                <div className="text-right">
                  <div className="text-xs text-muted-foreground uppercase tracking-wider">Duração</div>
                  <div className="text-3xl font-display font-bold tabular-nums text-primary">{formatDuration(seconds)}</div>
                </div>
              </div>

              {/* Histórico de tentativas */}
              {leadCalls.length > 0 && (
                <div className="mb-4 rounded-xl border bg-muted/30 overflow-hidden">
                  <div className="px-3 py-2 border-b flex items-center gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {leadCalls.length === 1 ? "1ª tentativa" : `${leadCalls.length} tentativas anteriores`}
                    </span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      leadCalls.length === 0 ? "bg-blue-100 text-blue-700" :
                      leadCalls.length <= 2 ? "bg-amber-100 text-amber-700" :
                      "bg-rose-100 text-rose-700"
                    }`}>
                      {leadCalls.length === 0 ? "1º contato" :
                       leadCalls.length === 1 ? "2ª tentativa" :
                       leadCalls.length === 2 ? "3ª tentativa" :
                       `${leadCalls.length + 1}ª tentativa`}
                    </span>
                  </div>
                  <div className="divide-y max-h-32 overflow-y-auto">
                    {leadCalls.map((c, i) => {
                      const stageKey = FUNNEL_STAGE[c.outcome];
                      const stage = stageKey ? FUNNEL_STAGES.find(s => s.key === stageKey) : null;
                      const date = new Date(c.started_at);
                      const dur = c.duracao_segundos ? formatDuration(c.duracao_segundos) : null;
                      return (
                        <div key={i} className="px-3 py-2 text-xs border-b last:border-b-0">
                          <div className="flex items-center gap-2">
                            {stage && (
                              <span className="font-bold text-[10px] px-1.5 py-0.5 rounded"
                                style={{ backgroundColor: stage.light, color: stage.color }}>
                                {stage.key}
                              </span>
                            )}
                            <span className="flex-1 font-medium text-foreground">
                              {STATUS_LABELS[c.outcome] ?? c.outcome}
                            </span>
                            <span className="text-muted-foreground/60 shrink-0 tabular-nums">
                              {date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} {date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                              {dur && <span className="ml-1 text-muted-foreground/40">· {dur}</span>}
                            </span>
                          </div>
                          {c.observacao && (
                            <p className="mt-0.5 text-muted-foreground leading-relaxed pl-0.5">
                              {c.observacao}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {leadCalls.length === 0 && (
                <div className="mb-4 px-3 py-2 rounded-xl border border-dashed border-blue-200 bg-blue-50/50">
                  <span className="text-xs font-semibold text-blue-700">🆕 Primeiro contato com este lead</span>
                </div>
              )}
              {leadCalls.length > 0 && (
                <div className="mb-2 px-3 py-1.5 rounded-xl border border-amber-200 bg-amber-50/50">
                  <span className="text-xs font-semibold text-amber-700">
                    {leadCalls.length === 1 ? "2ª tentativa" : `${leadCalls.length + 1}ª tentativa`} · {leadCalls.length} contato{leadCalls.length > 1 ? "s" : ""} anteriores
                  </span>
                </div>
              )}

              {/* 💬 Última observação de ligação — contexto antes de ligar */}
              {leadCalls[0]?.observacao && (
                <div className="mb-3 p-3 rounded-lg bg-blue-50 border-l-4 border-blue-400">
                  <div className="text-[10px] uppercase text-blue-600 font-semibold mb-1">
                    💬 Na última ligação ({new Date(leadCalls[0].started_at).toLocaleDateString("pt-BR", { day:"2-digit", month:"2-digit" })} às {new Date(leadCalls[0].started_at).toLocaleTimeString("pt-BR", { hour:"2-digit", minute:"2-digit" })}) você anotou:
                  </div>
                  <p className="text-blue-900 text-xs leading-relaxed font-medium italic">"{leadCalls[0].observacao}"</p>
                </div>
              )}

              {lead.observacoes && (
                <div className="mb-4 p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm">
                  <div className="text-xs uppercase text-amber-700 font-semibold mb-1">📌 Observação do lead</div>
                  <p className="text-amber-900 text-xs leading-relaxed">{lead.observacoes}</p>
                </div>
              )}

              <div className="flex gap-2 mb-3 flex-wrap">
                {!calling ? (
                  <Button onClick={startCall} className="bg-gradient-brand shadow-elegant flex-1 h-12 text-base min-w-[150px]">
                    <PhoneCall className="h-5 w-5 mr-2" /> Iniciar ligação
                  </Button>
                ) : (
                  <Button onClick={stopTimer} variant="destructive" className="flex-1 h-12 text-base min-w-[150px]">
                    <PhoneOff className="h-5 w-5 mr-2" /> Encerrar
                  </Button>
                )}
                <Button variant="outline" onClick={skipLead} className="h-12">
                  <SkipForward className="h-4 w-4 mr-2" /> Pular
                </Button>
                <Button variant="outline" onClick={goToPrevious} disabled={undoing} className="h-12 border-amber-300 text-amber-700 hover:bg-amber-50">
                  <Undo2 className="h-4 w-4 mr-2" />
                  {undoing ? "Voltando…" : "Anterior"}
                </Button>
              </div>

              <div className="relative mb-6">
                <button onClick={() => setWaMenuOpen(v => !v)}
                  className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl border border-green-300 text-green-700 bg-green-50 hover:bg-green-100 transition-colors font-semibold text-sm">
                  <span className="flex items-center gap-2"><WaIcon /> WhatsApp</span>
                  <ChevronDown className={`h-4 w-4 transition-transform ${waMenuOpen ? "rotate-180" : ""}`} />
                </button>

                {waMenuOpen && (
                  <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-popover border border-green-200 rounded-xl shadow-lg overflow-hidden">
                    {[
                      {
                        emoji: "👋",
                        label: "Acabei de falar — me apresentando",
                        sub: "Envia o contato e confirma a visita",
                        msg: () => buildWaMsg1(lead!.nome),
                      },
                      {
                        emoji: "📵",
                        label: "Tentei ligar — sem resposta",
                        sub: "Confirma a visita e pede retorno",
                        msg: () => buildWaMsg2(lead!.nome),
                      },
                      {
                        emoji: "🔄",
                        label: "Não veio — tentando remarcar",
                        sub: "Aborda com empatia e pede nova data",
                        msg: () => buildWaMsg3(lead!.nome),
                      },
                    ].map((item, i) => (
                      <div key={i} className="border-b last:border-b-0">
                        <div className="px-3 pt-2.5 pb-1">
                          <div className="flex items-center gap-2 text-xs font-bold text-green-800">
                            <span>{item.emoji}</span>
                            <span>{item.label}</span>
                          </div>
                          <div className="text-[10px] text-muted-foreground ml-5">{item.sub}</div>
                        </div>
                        <div className="flex gap-1.5 px-3 pb-2.5">
                          <button
                            onClick={() => { openWa(item.msg(), false); setWaMenuOpen(false); }}
                            className="flex-1 py-1.5 rounded-lg text-[11px] font-semibold bg-green-100 text-green-800 hover:bg-green-200 transition-colors border border-green-200">
                            <WaIcon /> Web
                          </button>
                          <button
                            onClick={() => { openWa(item.msg(), true); setWaMenuOpen(false); }}
                            className="flex-1 py-1.5 rounded-lg text-[11px] font-semibold bg-green-600 text-white hover:bg-green-700 transition-colors">
                            <WaIcon /> App
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* ── Enviar lista de documentos ─────────────────────────── */}
              <div className="relative">
                <button onClick={() => setDocsMenuOpen(v => !v)}
                  className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl border border-violet-300 text-violet-700 bg-violet-50 hover:bg-violet-100 transition-colors font-semibold text-sm">
                  <span>📋 Enviar lista de documentos</span>
                  <ChevronDown className={`h-4 w-4 transition-transform ${docsMenuOpen ? "rotate-180" : ""}`} />
                </button>
                {docsMenuOpen && (
                  <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-popover border border-violet-200 rounded-xl shadow-lg overflow-hidden">
                    {([
                      { key: "autonomo" as const, label: "💼 Autônomo / Informal", sub: "6 documentos" },
                      { key: "clt"      as const, label: "📋 CLT / Formal",        sub: "8 documentos" },
                    ]).map(perfil => (
                      <div key={perfil.key} className="border-b last:border-b-0">
                        <div className="px-3 pt-2.5 pb-1">
                          <div className="text-xs font-bold text-violet-800">{perfil.label}</div>
                          <div className="text-[10px] text-muted-foreground">{perfil.sub}</div>
                        </div>
                        <div className="flex gap-1.5 px-3 pb-2.5">
                          <button onClick={() => { window.open(`https://web.whatsapp.com/send?phone=${lead ? toWhatsAppNumber(lead.telefone) : ""}&text=${encodeURIComponent(buildDocsMsg(perfil.key))}`, "_blank"); setDocsMenuOpen(false); }}
                            className="flex-1 py-1.5 rounded-lg text-[11px] font-semibold bg-green-100 text-green-800 hover:bg-green-200 border border-green-200 transition-colors">
                            Web
                          </button>
                          <button onClick={() => { window.open(`https://wa.me/${lead ? toWhatsAppNumber(lead.telefone) : ""}?text=${encodeURIComponent(buildDocsMsg(perfil.key))}`, "_blank"); setDocsMenuOpen(false); }}
                            className="flex-1 py-1.5 rounded-lg text-[11px] font-semibold bg-green-600 text-white hover:bg-green-700 transition-colors">
                            App
                          </button>
                          <button onClick={() => { navigator.clipboard.writeText(buildDocsMsg(perfil.key)); setDocsMenuOpen(false); toast.success("Lista copiada!"); }}
                            className="flex-1 py-1.5 rounded-lg text-[11px] font-semibold bg-violet-100 text-violet-700 hover:bg-violet-200 border border-violet-200 transition-colors">
                            Copiar
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="border-t pt-6 space-y-4">
                <div>
                  <label className="text-sm font-medium mb-3 block">Resultado da ligação</label>
                  <div className="space-y-3">
                    {/* ── Dropdown pular etapas ─────────────────────────────────── */}
                    {(() => {
                      const currentStageKey = FUNNEL_STAGE[lead.status] ?? "A";
                      const currentIdx = FUNNEL_STAGES.findIndex(s => s.key === currentStageKey);
                      const stageToOutcome: Record<string, { outcome: string; label: string }> = {
                        B: { outcome: "respondeu",        label: "B · Atendeu" },
                        C: { outcome: "interesse",        label: "C · Demonstrou interesse" },
                        D: { outcome: "visita_pendente",  label: "D · Quer visitar (sem data)" },
                        E: { outcome: "visita_agendada",  label: "E · Visita marcada!" },
                        F: { outcome: "visitou",          label: "F · Visitou!" },
                        G: { outcome: "envio_documentos", label: "G · Enviou documentos" },
                      };
                      const skipOptions = FUNNEL_STAGES.filter((s, i) =>
                        i > currentIdx && Object.keys(stageToOutcome).includes(s.key)
                      );
                      if (skipOptions.length === 0) return null;
                      return (
                        <div className="relative">
                          <button onClick={() => setSkipMenuOpen(v => !v)}
                            className="w-full flex items-center justify-between px-3 py-2 rounded-xl border border-dashed border-primary/40 text-xs font-semibold text-primary bg-primary/5 hover:bg-primary/10 transition-colors">
                            <span>⚡ Avançar direto para etapa...</span>
                            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${skipMenuOpen ? "rotate-180" : ""}`} />
                          </button>
                          {skipMenuOpen && (
                            <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-popover border rounded-xl shadow-lg overflow-hidden">
                              <div className="px-3 py-2 text-[10px] uppercase tracking-widest text-muted-foreground font-semibold border-b bg-muted/50">
                                Cliente avançou direto — selecione a etapa
                              </div>
                              {skipOptions.map(stage => {
                                const opt = stageToOutcome[stage.key];
                                if (!opt) return null;
                                const isSelected = outcome === opt.outcome;
                                return (
                                  <button key={stage.key}
                                    onClick={() => { setOutcome(opt.outcome); setSkipMenuOpen(false); }}
                                    className={`w-full flex items-center gap-3 px-3 py-2.5 text-left text-xs transition-colors hover:bg-muted ${isSelected ? "bg-primary/10 font-bold" : ""}`}>
                                    <span className="text-lg leading-none">{stage.emoji}</span>
                                    <div>
                                      <div className="font-semibold" style={{ color: stage.color }}>{opt.label}</div>
                                      <div className="text-[10px] text-muted-foreground">{stage.desc}</div>
                                    </div>
                                    {isSelected && <span className="ml-auto text-primary text-xs font-bold">✓</span>}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    {/* Botões contextuais pela etapa do funil */}
                    {(() => {
                      const stage = FUNNEL_STAGE[lead.status] ?? "A";
                      const options = OUTCOMES_BY_STAGE[stage] ?? OUTCOMES_BY_STAGE["A"];
                      const positives = options.filter(o => o.type === "positive");
                      const neutrals  = options.filter(o => o.type === "neutral");
                      const negatives = options.filter(o => o.type === "negative");
                      const btnBase = "px-3 py-1.5 rounded-full text-xs font-medium border transition-all";
                      return (
                        <>
                          {positives.length > 0 && (
                            <div>
                              <div className="text-[10px] uppercase tracking-widest text-emerald-600 mb-1.5 font-semibold">✅ Positivo</div>
                              <div className="flex flex-wrap gap-1.5">
                                {positives.map(o => (
                                  <button key={o.outcome} onClick={() => setOutcome(o.outcome)}
                                    className={`${btnBase} ${outcome === o.outcome
                                      ? "bg-emerald-500 text-white border-emerald-500"
                                      : "bg-emerald-500/10 text-emerald-700 border-emerald-200 hover:bg-emerald-500/20"}`}>
                                    {o.label}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                          {neutrals.length > 0 && (
                            <div>
                              <div className="text-[10px] uppercase tracking-widest text-amber-600 mb-1.5 font-semibold">⏳ Retorno / Espera</div>
                              <div className="flex flex-wrap gap-1.5">
                                {neutrals.map(o => (
                                  <button key={o.outcome} onClick={() => setOutcome(o.outcome)}
                                    className={`${btnBase} ${outcome === o.outcome
                                      ? "bg-amber-500 text-white border-amber-500"
                                      : "bg-amber-500/10 text-amber-700 border-amber-200 hover:bg-amber-500/20"}`}>
                                    {o.label}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                          {negatives.length > 0 && (
                            <div>
                              <div className="text-[10px] uppercase tracking-widest text-rose-600 mb-1.5 font-semibold">❌ Encerrado</div>
                              <div className="flex flex-wrap gap-1.5">
                                {negatives.map(o => (
                                  <button key={o.outcome} onClick={() => setOutcome(o.outcome)}
                                    className={`${btnBase} ${outcome === o.outcome
                                      ? "bg-rose-500 text-white border-rose-500"
                                      : "bg-rose-500/10 text-rose-700 border-rose-200 hover:bg-rose-500/20"}`}>
                                    {o.label}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </>
                      );
                    })()}

                    {customs.length > 0 && (
                      <div>
                        <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1.5">Personalizados</div>
                        <div className="flex flex-wrap gap-1.5">
                          {customs.map(c => {
                            const isSelected = outcome === `custom:${c.id}`;
                            return (
                              <div key={c.id} className="flex items-center">
                                <button
                                  onClick={() => setOutcome(`custom:${c.id}`)}
                                  className={`px-3 py-1.5 rounded-l-full text-xs font-medium border transition-all ${
                                    isSelected
                                      ? "bg-violet-500 text-white border-violet-500"
                                      : "bg-violet-500/10 text-violet-700 border-violet-200 hover:bg-violet-500/20"
                                  }`}
                                >
                                  {c.label}
                                </button>
                                <button
                                  onClick={() => removeCustomOutcome(c.id)}
                                  className="px-1.5 py-1.5 rounded-r-full text-xs border border-l-0 bg-muted hover:bg-destructive hover:text-white transition-all"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    <div className="flex gap-2 pt-1">
                      <Input
                        value={newOutcome}
                        onChange={e => setNewOutcome(e.target.value)}
                        placeholder="Criar resultado personalizado…"
                        onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addCustomOutcome(); } }}
                        className="h-8 text-sm"
                      />
                      <Button
                        type="button" size="sm" variant="outline"
                        onClick={addCustomOutcome}
                        disabled={addingOutcome || !newOutcome.trim()}
                        className="h-8"
                      >
                        <Plus className="h-3.5 w-3.5 mr-1" /> Criar
                      </Button>
                    </div>
                  </div>
                </div>

                {showFollowupField && (
                  <div>
                    {followupDate ? (
                      <div>
                        <label className="text-sm font-medium mb-2 flex items-center gap-1.5">
                          <CalendarClock className="h-4 w-4 text-amber-500" />
                          Follow-up agendado para
                        </label>
                        <Input
                          type="datetime-local"
                          value={followupDate}
                          onChange={e => setFollowupDate(e.target.value)}
                          className="h-9 text-sm"
                        />
                        <button
                          onClick={() => setFollowupDate("")}
                          className="text-xs text-muted-foreground hover:text-destructive mt-1 flex items-center gap-1"
                        >
                          <X className="h-3 w-3" /> Remover follow-up
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          const tomorrow = new Date();
                          tomorrow.setDate(tomorrow.getDate() + 1);
                          tomorrow.setHours(9, 0, 0, 0);
                          setFollowupDate(toDatetimeLocal(tomorrow.toISOString()));
                        }}
                        className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-dashed border-amber-300 text-sm text-amber-600 hover:bg-amber-50 hover:border-amber-400 transition-colors"
                      >
                        <CalendarClock className="h-4 w-4" />
                        + Adicionar follow-up
                      </button>
                    )}
                  </div>
                )}

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium">Observação da ligação</label>
                    {(() => {
                      const stage = FUNNEL_STAGE[lead.status] ?? "A";
                      const suggs = OBS_SUGGESTIONS[stage] ?? [];
                      if (!suggs.length) return null;
                      return (
                        <div className="relative">
                          <button onClick={() => setObsSuggOpen(v => !v)}
                            className="text-xs text-primary hover:underline flex items-center gap-1">
                            💡 Sugestões
                          </button>
                          {obsSuggOpen && (
                            <div className="absolute right-0 top-6 z-50 w-72 bg-popover border rounded-xl shadow-lg p-2 space-y-1">
                              {suggs.map((s, i) => (
                                <button key={i} onClick={() => { setNote(s); setObsSuggOpen(false); }}
                                  className="w-full text-left text-xs px-3 py-2 rounded-lg hover:bg-muted transition-colors">
                                  {s}
                                </button>
                              ))}
                              <button onClick={() => setObsSuggOpen(false)}
                                className="w-full text-center text-xs text-muted-foreground pt-1 hover:text-foreground">
                                fechar
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                  <Textarea
                    value={note}
                    onChange={e => setNote(e.target.value)}
                    maxLength={400}
                    rows={3}
                    placeholder="Anote o feedback desta ligação (salvo no histórico de calls)…"
                  />
                </div>

                {/* Resumo do que será salvo */}
                {outcome && outcome !== "nao_atendeu" && (() => {
                  const stageKey = FUNNEL_STAGE[CRM_STATUS_FROM_OUTCOME[outcome] ?? outcome];
                  const stage = stageKey ? FUNNEL_STAGES.find(s => s.key === stageKey) : null;
                  return (
                    <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 bg-muted/30"
                      style={{ borderColor: stage?.color ? stage.color + "40" : undefined }}>
                      {stage && (
                        <span className="text-base shrink-0">{stage.emoji}</span>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
                          Outcome selecionado
                        </div>
                        <div className="text-xs font-bold truncate" style={{ color: stage?.color }}>
                          {stage ? `${stage.key} · ${stage.label}` : ""} — {OUTCOME_LABELS[outcome] ?? outcome}
                        </div>
                      </div>
                      <button onClick={() => setOutcome("nao_atendeu")}
                        className="text-muted-foreground hover:text-destructive text-xs shrink-0">
                        ✕
                      </button>
                    </div>
                  );
                })()}

                <Button onClick={saveCall} className="w-full h-11 text-sm font-bold">
                  ✅ Salvar e próximo
                </Button>
              </div>
            </>
          )}
        </Card>

        {/* ── DIREITA: Tabs Script / Objeções / Lembrete ───────────────────── */}
        <div className="space-y-4">
          <div className="flex rounded-xl overflow-hidden border shadow-sm">
            {[
              { key: "script",   label: "Script" },
              { key: "objecoes", label: "Objeções" },
              { key: "lembrete", label: "Lembrete" },
            ].map(tab => (
              <button
                key={tab.key}
                onClick={() => setRightTab(tab.key as RightTab)}
                className={`flex-1 py-2.5 text-xs font-semibold transition-colors relative ${
                  rightTab === tab.key
                    ? "bg-primary text-primary-foreground"
                    : "bg-card text-muted-foreground hover:text-foreground hover:bg-muted/50"
                }`}
              >
                {tab.label}
                {tab.key === "lembrete" && (visitasComData.length + visitasSemData.length) > 0 && (
                  <span className={`ml-1 inline-flex items-center justify-center h-4 w-4 rounded-full text-[10px] font-bold ${
                    rightTab === "lembrete" ? "bg-white text-primary" : "bg-rose-500 text-white"
                  }`}>
                    {visitasComData.length + visitasSemData.length}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* ── Script tab ─────────────────────────────── */}
          {rightTab === "script" && (
            <div className="space-y-3">
              <ScriptFunil
                firstName={firstName}
                funilType={funilType}
                setFunilType={setFunilType}
                funilStep={funilStep}
                setFunilStep={setFunilStep}
                telefone={lead?.telefone ?? ""}
                followupDate={followupDate}
                setFollowupDate={setFollowupDate}
                setOutcome={setOutcome}
                toDatetimeLocal={toDatetimeLocal}
              />

              {/* WhatsApp message editável */}
              <Card className="p-4 shadow-card">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-display font-semibold text-xs">Mensagem WhatsApp</h3>
                  {!editingWaMsg ? (
                    <button onClick={startEditWaMsg} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                      <Pencil className="h-3 w-3" /> Editar
                    </button>
                  ) : (
                    <div className="flex gap-2">
                      <button onClick={cancelEditWaMsg} className="text-xs text-rose-500 hover:text-rose-700"><X className="h-3 w-3" /></button>
                      <button onClick={saveWaMsgEdit} className="text-xs text-emerald-600 font-semibold hover:text-emerald-800"><Save className="h-3 w-3" /></button>
                    </div>
                  )}
                </div>
                {editingWaMsg ? (
                  <div className="space-y-1.5">
                    <p className="text-[10px] text-muted-foreground">Use <code className="bg-muted px-1 rounded">{"{firstName}"}</code> para o nome.</p>
                    <Textarea value={waMsgDraft} onChange={e => setWaMsgDraft(e.target.value)} rows={3} className="text-xs resize-none" />
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">{buildWaMessage(lead?.nome ?? "{Nome}")}</p>
                )}
              </Card>

              {/* Atalhos */}
              <Card className="p-3 shadow-card bg-muted/30">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2 font-semibold">Atalhos de teclado</p>
                <div className="space-y-1.5">
                  {[
                    { key: "Enter / Espaço", action: "Iniciar ligação" },
                    { key: "→",              action: "Pular lead" },
                    { key: "V",              action: "Voltar ao anterior" },
                    { key: "Ctrl+S",         action: "Salvar e próximo" },
                    { key: "Ctrl+K",         action: "Buscar lead" },
                    { key: "1",              action: "Não atendeu" },
                    { key: "2",              action: "Visita" },
                    { key: "3",              action: "Já comprou" },
                    { key: "4",              action: "Sem interesse" },
                    { key: "5",              action: "Retornar" },
                    { key: "6",              action: "Proposta" },
                  ].map(s => (
                    <div key={s.key} className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">{s.action}</span>
                      <kbd className="px-1.5 py-0.5 rounded bg-muted border text-[10px] font-mono">{s.key}</kbd>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          )}

          {/* ── Objeções tab ─────────────────────────────── */}
          {rightTab === "objecoes" && (
            <ObjecoesPanel />
          )}

          {/* ── Lembrete tab ─────────────────────────────── */}
          {rightTab === "lembrete" && (() => {
            const todayStr = new Date().toISOString().slice(0, 10);
            const visitasHoje    = visitasComData.filter(l => l.proximo_followup?.startsWith(todayStr));
            const visitasFuturas = visitasComData.filter(l => !l.proximo_followup?.startsWith(todayStr));

            // Etapas B→L do Kanban para acompanhamento
            const KANBAN_ETAPAS = [
              { key:"B", label:"B · Atendeu",        emoji:"📞", color:"#f97316", light:"#fff7ed",
                statuses:["retornar","respondeu","mensagem_zap"] },
              { key:"C", label:"C · Interesse",      emoji:"💬", color:"#0ea5e9", light:"#f0f9ff",
                statuses:["interesse"] },
              { key:"D", label:"D · Quer visitar",   emoji:"🎯", color:"#f59e0b", light:"#fffbeb",
                statuses:["visita_pendente","aguardando_visita"] },
              { key:"E⚠", label:"E · Não veio",      emoji:"⚠️", color:"#f43f5e", light:"#fff1f2",
                statuses:["visita_faltou","visita_cancelada"] },
              { key:"F", label:"F · Visitou",        emoji:"🏠", color:"#10b981", light:"#ecfdf5",
                statuses:["visitou","proposta","aguardando_documento"] },
              { key:"G", label:"G · Envio docs",     emoji:"📄", color:"#6d28d9", light:"#f5f3ff",
                statuses:["envio_documentos","cpf_em_analise"] },
              { key:"H", label:"H · CPF análise",    emoji:"🔍", color:"#2563eb", light:"#eff6ff",
                statuses:["cpf_analisado","aguardando_aprovacao"] },
              { key:"I", label:"I · Crédito",        emoji:"✅", color:"#0891b2", light:"#ecfeff",
                statuses:["credito_aprovado","contrato_preparado"] },
              { key:"J", label:"J · Contrato",       emoji:"📝", color:"#4338ca", light:"#eef2ff",
                statuses:["contrato_gerado"] },
              { key:"K", label:"K · Assinado",       emoji:"✍️", color:"#1d4ed8", light:"#eff6ff",
                statuses:["contrato_assinado"] },
              { key:"L", label:"L · Boleto",         emoji:"💰", color:"#0f766e", light:"#f0fdfa",
                statuses:["boleto_pago"] },
            ];

            const openLead = (l: Lead) => {
              if (lead) navHistoryRef.current.push(lead);
              setLead(l);
              setNote(""); setOutcome("nao_atendeu"); setSeconds(0); setFollowupDate(""); setShowFollowupField(false);
            };

            const LeadRow = ({ l, showDate }: { l: Lead; showDate?: boolean }) => (
              <div className="flex items-center gap-2 px-3 py-2.5 border-b last:border-b-0 hover:bg-muted/30 transition-colors">
                <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center text-xs font-bold shrink-0">
                  {l.nome[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold truncate">{l.nome}</div>
                  <div className="text-[10px] text-muted-foreground truncate">{formatPhone(l.telefone)}</div>
                  {showDate && l.proximo_followup && (
                    <div className="text-[10px] text-blue-600 font-medium mt-0.5">
                      📅 {new Date(l.proximo_followup).toLocaleDateString("pt-BR", { weekday:"short", day:"2-digit", month:"2-digit" })} {new Date(l.proximo_followup).toLocaleTimeString("pt-BR", { hour:"2-digit", minute:"2-digit" })}
                    </div>
                  )}
                  {l.observacoes && (
                    <div className="text-[10px] text-muted-foreground truncate mt-0.5">{l.observacoes}</div>
                  )}
                </div>
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => openLead(l)}
                    className="p-1.5 rounded-md bg-primary/10 text-primary hover:bg-primary/20 transition-colors" title="Abrir lead">
                    <Eye className="h-3.5 w-3.5" />
                  </button>
                  <a href={`https://wa.me/${toWhatsAppNumber(l.telefone)}?text=${encodeURIComponent(buildWaMessage(l.nome))}`}
                    target="_blank" rel="noopener noreferrer"
                    className="p-1.5 rounded-md bg-green-500/10 text-green-700 hover:bg-green-500/20 transition-colors" title="WhatsApp">
                    <MessageSquare className="h-3.5 w-3.5" />
                  </a>
                </div>
              </div>
            );

            return (
              <Card className="shadow-card overflow-hidden flex flex-col" style={{ maxHeight: "calc(100vh - 220px)" }}>

                {/* ── BOX 1: HOJE ── */}
                <div className={`px-3 py-2 border-b shrink-0 flex items-center gap-2 ${visitasHoje.length > 0 ? "bg-blue-50" : "bg-muted/30"}`}>
                  <CalendarCheck className={`h-3.5 w-3.5 shrink-0 ${visitasHoje.length > 0 ? "text-blue-600" : "text-muted-foreground"}`} />
                  <span className={`text-[10px] uppercase tracking-widest font-semibold flex-1 ${visitasHoje.length > 0 ? "text-blue-700" : "text-muted-foreground"}`}>
                    Hoje — {visitasHoje.length}
                  </span>
                  {visitasHoje.length > 0 && (
                    <span className="text-[9px] font-bold text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded-full">
                      {visitasHoje.length} visita{visitasHoje.length > 1 ? "s" : ""}
                    </span>
                  )}
                </div>
                <div className="overflow-y-auto shrink-0" style={{ maxHeight: "140px" }}>
                  {visitasHoje.length === 0 ? (
                    <div className="px-4 py-3 text-center text-xs text-muted-foreground">Nenhuma visita hoje</div>
                  ) : visitasHoje.map(l => <LeadRow key={l.id} l={l} showDate={false} />)}
                </div>

                {/* ── BOX 2: COM DATA ── */}
                <div className="px-3 py-2 border-t border-b bg-emerald-50 shrink-0 flex items-center gap-2">
                  <CalendarCheck className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                  <span className="text-[10px] uppercase tracking-widest text-emerald-700 font-semibold flex-1">
                    Com data — {visitasFuturas.length}
                  </span>
                </div>
                <div className="overflow-y-auto shrink-0" style={{ maxHeight: "160px" }}>
                  {visitasFuturas.length === 0 ? (
                    <div className="px-4 py-3 text-center text-xs text-muted-foreground">Sem visitas futuras marcadas</div>
                  ) : visitasFuturas.map(l => <LeadRow key={l.id} l={l} showDate={true} />)}
                </div>

                {/* ── BOX 3: SEM DATA ── */}
                <div className="px-3 py-2 border-t border-b bg-amber-50 shrink-0 flex items-center gap-2">
                  <PhoneMissed className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                  <span className="text-[10px] uppercase tracking-widest text-amber-700 font-semibold flex-1">
                    Sem data — {visitasSemData.length}
                  </span>
                  {visitasSemData.length > 0 && (
                    <span className="text-[9px] text-amber-600">ligar para confirmar</span>
                  )}
                </div>
                <div className="overflow-y-auto flex-1">
                  {visitasSemData.length === 0 ? (
                    <div className="px-4 py-3 text-center text-xs text-muted-foreground">Todos têm data definida ✓</div>
                  ) : visitasSemData.map(l => <LeadRow key={l.id} l={l} showDate={false} />)}
                </div>

                {/* ── Etapas B→L do Kanban ── */}
                {KANBAN_ETAPAS.map(etapa => {
                  // Filtrar leads da fila que estão nesta etapa
                  const etapaLeads = queue.filter(l =>
                    etapa.statuses.includes(l.status) && !l._done
                  );
                  if (etapaLeads.length === 0) return null;
                  return (
                    <div key={etapa.key}>
                      <div className="px-3 py-1.5 border-t border-b shrink-0 flex items-center gap-2"
                        style={{ backgroundColor: etapa.light }}>
                        <span className="text-xs">{etapa.emoji}</span>
                        <span className="text-[10px] uppercase tracking-widest font-semibold flex-1"
                          style={{ color: etapa.color }}>
                          {etapa.label}
                        </span>
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                          style={{ backgroundColor: etapa.color + "20", color: etapa.color }}>
                          {etapaLeads.length}
                        </span>
                      </div>
                      <div className="overflow-y-auto" style={{ maxHeight: "120px" }}>
                        {etapaLeads.map(l => <LeadRow key={l.id} l={l} showDate={!!l.proximo_followup} />)}
                      </div>
                    </div>
                  );
                })}

                {/* Rodapé */}
                <div className="px-4 py-2.5 border-t bg-muted/20 shrink-0">
                  <a href="/visitas" className="w-full flex items-center justify-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
                    <MapPin className="h-3.5 w-3.5" /> Ver todas as visitas →
                  </a>
                </div>
              </Card>
            );
          })()}
        </div>
      </div>
    </div>
  );
}

// ── CHANGE 4: VisitaCard with veio/não veio actions ──────────────────────────
// Status labels mirror Visits.tsx STATUS_CFG
const VISIT_STATUS_LABEL: Record<string, { label: string; badge: string }> = {
  visita:        { label: "Agendada",      badge: "bg-blue-100 text-blue-700"   },
  agendado:      { label: "Confirmada",    badge: "bg-green-100 text-green-700" },
  retornar:      { label: "Reagendada",    badge: "bg-amber-100 text-amber-700" },
  nao_atendeu:   { label: "Não compareceu",badge: "bg-rose-100 text-rose-700"   },
  convertido:    { label: "Realizada",     badge: "bg-purple-100 text-purple-700"},
  sem_interesse: { label: "Cancelada",     badge: "bg-gray-100 text-gray-500"   },
  perdido:       { label: "Perdido",       badge: "bg-gray-100 text-gray-500"   },
};

function VisitaCard({
  l, onOpenLead, onVeio, onNaoVeio, buildWaMessage, toWhatsAppNumber,
}: {
  l: Lead;
  onOpenLead: () => void;
  onVeio: () => void;
  onNaoVeio: () => void;
  buildWaMessage: (nome: string) => string;
  toWhatsAppNumber: (tel: string) => string;
}) {
  const isPast = l.proximo_followup ? new Date(l.proximo_followup) < new Date() : false;
  const statusCfg = VISIT_STATUS_LABEL[l.status] ?? VISIT_STATUS_LABEL["visita"];

  return (
    <div className="px-4 py-3 hover:bg-muted/30 transition-colors">
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="font-medium text-sm truncate">{l.nome}</div>
        <div className="flex items-center gap-1 shrink-0">
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${statusCfg.badge}`}>
            {statusCfg.label}
          </span>
          {l.proximo_followup && (
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded whitespace-nowrap ${
              isPast ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-600"
            }`}>
              {new Date(l.proximo_followup).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
              {" "}
              {new Date(l.proximo_followup).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
        </div>
      </div>
      <div className="text-xs text-muted-foreground mb-2">{formatPhone(l.telefone)}</div>
      {l.observacoes && (
        <div className="text-xs text-muted-foreground bg-muted/50 rounded px-2 py-1 mb-2 line-clamp-2">
          {l.observacoes}
        </div>
      )}


      {/* Veio / Não veio — mostrar para visitas com data (hoje ou passadas) */}
      {l.proximo_followup && isPast && (
        <div className="flex gap-1.5 mb-1.5">
          <button
            onClick={onVeio}
            className="flex-1 flex items-center justify-center gap-1 text-[11px] font-semibold px-2 py-1.5 rounded-md bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/30 border border-emerald-200 transition-colors"
          >
            <CalendarCheck className="h-3 w-3" />
            Veio ✓
          </button>
          <button
            onClick={onNaoVeio}
            className="flex-1 flex items-center justify-center gap-1 text-[11px] font-semibold px-2 py-1.5 rounded-md bg-rose-500/15 text-rose-700 hover:bg-rose-500/30 border border-rose-200 transition-colors"
          >
            <PhoneMissed className="h-3 w-3" />
            Não veio
          </button>
        </div>
      )}

      <div className="flex gap-1.5">
        <button
          onClick={onOpenLead}
          className="flex-1 flex items-center justify-center gap-1 text-[11px] font-medium px-2 py-1.5 rounded-md bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
        >
          <Eye className="h-3 w-3" />
          Abrir lead
        </button>
        <a
          href={`https://wa.me/${toWhatsAppNumber(l.telefone)}?text=${encodeURIComponent(buildWaMessage(l.nome))}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 flex items-center justify-center gap-1 text-[11px] font-medium px-2 py-1.5 rounded-md bg-green-500/10 text-green-700 hover:bg-green-500/20 transition-colors"
        >
          <WaIcon />
          WhatsApp
        </a>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// OBJEÇÕES
// ═══════════════════════════════════════════════════════════════════════════

const OBJECOES_DATA = [
  {
    id: "caro",
    titulo: `"Tá caro / não tenho dinheiro"`,
    cor: "border-rose-200",
    corBadge: "bg-rose-100 text-rose-700",
    resposta: "Você tá comparando com o quê?",
    passos: [
      { fala: "Você paga aluguel hoje? Então você já paga um imóvel — só que no aluguel o dinheiro some. Aqui ele vira patrimônio." },
      { fala: "Na planta a entrada é mínima. A gente não tá falando de pagar tudo agora — tá falando de garantir o seu agora." },
      { fala: "Vem ver os números reais. Sem compromisso. Terça ou quinta?" },
    ],
  },
  {
    id: "momento",
    titulo: `"Não é o momento certo"`,
    cor: "border-amber-200",
    corBadge: "bg-amber-100 text-amber-700",
    resposta: "O que precisaria mudar pra ser o momento certo?",
    passos: [
      { fala: "O melhor momento pra comprar na planta é antes de todo mundo perceber. Depois que esquenta, as condições mudam." },
      { fala: "Eu não tô pedindo decisão agora. Só 20 minutos pra você ver o que tem. A decisão é sua, no seu tempo." },
      { fala: "O que eu não quero é você me ligar daqui a 3 meses dizendo que queria ter vindo quando eu chamei." },
    ],
  },
  {
    id: "pensar",
    titulo: `"Vou pensar / te ligo depois"`,
    cor: "border-blue-200",
    corBadge: "bg-blue-100 text-blue-700",
    resposta: "O que exatamente você ainda quer pensar?",
    passos: [
      { fala: "Faz sentido. Mas me diz — é uma questão financeira ou de decisão mesmo?" },
      { fala: "Se for financeiro, a gente resolve na visita. Se for decisão, quero que você venha ver pra decidir com mais clareza." },
      { fala: "Me dá só 20 minutos. Você não perde nada em ir ver." },
    ],
  },
  {
    id: "casa",
    titulo: `"Prefiro casa, não apartamento"`,
    cor: "border-emerald-200",
    corBadge: "bg-emerald-100 text-emerald-700",
    resposta: "O que você mais valoriza na casa — privacidade, quintal?",
    passos: [
      { fala: "Entendo. Mas o que te impede de ter isso com mais segurança e menos manutenção?" },
      { fala: "O nosso projeto tem [área de lazer / localização / tamanho] que resolve exatamente isso." },
      { fala: "Vale vir ver pessoalmente. A impressão muda quando você está lá." },
    ],
  },
];

function ObjecoesPanel() {
  const [openId, setOpenId] = React.useState<string | null>(null);

  return (
    <div className="space-y-2">
      {/* Regra de ouro */}
      <div className="px-3 py-2.5 rounded-lg bg-slate-800 text-white text-xs leading-relaxed">
        <span className="font-bold text-slate-300">Regra: </span>
        Nunca discuta. Transforme a objeção em motivo pra vir até você.
      </div>

      {OBJECOES_DATA.map(obj => {
        const isOpen = openId === obj.id;
        return (
          <Card key={obj.id} className={`shadow-card overflow-hidden border ${obj.cor}`}>
            <button
              className="w-full flex items-center gap-2 px-3 py-2.5 text-left"
              onClick={() => setOpenId(isOpen ? null : obj.id)}
            >
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${obj.corBadge}`}>
                {isOpen ? "▲" : "▼"}
              </span>
              <span className="text-xs font-semibold text-foreground flex-1">{obj.titulo}</span>
            </button>

            {isOpen && (
              <div className="px-3 pb-3 space-y-2 border-t border-border/50">
                {/* Primeira resposta */}
                <div className="mt-2 flex items-start gap-2">
                  <span className="text-[10px] font-bold text-muted-foreground shrink-0 mt-0.5">↩</span>
                  <p className="text-xs font-semibold text-foreground italic">"{obj.resposta}"</p>
                </div>

                {/* Passos */}
                {obj.passos.map((passo, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className="h-4 w-4 rounded-full bg-muted flex items-center justify-center text-[9px] font-bold text-muted-foreground shrink-0 mt-0.5">
                      {i + 1}
                    </span>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      "{passo.fala}"
                    </p>
                  </div>
                ))}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SCRIPT FUNIL — Componente de script interativo com fluxo de decisão
// ═══════════════════════════════════════════════════════════════════════════

// ENDERECO_LOJA is now loaded from profile dynamically

type FunilStep = {
  id: string;
  label: string;      // nome curto da etapa
  fala: string;       // texto exato a falar
  tipo: "fala" | "acao" | "encerrar";
  opcoes?: { label: string; emoji: string; nextStep: string; color: string; action?: "visita" | "retorno" | "wa_visita" | "wa_evento" | "encerrar" }[];
  dica?: string;
};

const FUNIL_PADRAO: Record<string, FunilStep> = {
  "1": {
    id: "1", label: "Gancho", tipo: "fala",
    fala: `{firstName}? Oi, aqui é o {corretorNome}. Tudo bem? Olha, vi que você tá buscando o primeiro imóvel. Ainda é um plano pra você?`,
    opcoes: [
      { label: "Sim, ainda quero",      emoji: "✅", nextStep: "2",       color: "bg-emerald-50 border-emerald-300 text-emerald-700 hover:bg-emerald-100" },
      { label: "Não / Já comprei",      emoji: "❌", nextStep: "encerrar", color: "bg-rose-50 border-rose-300 text-rose-700 hover:bg-rose-100",        action: "encerrar" },
      { label: "Tô ocupado agora",      emoji: "⏸", nextStep: "4",       color: "bg-amber-50 border-amber-300 text-amber-700 hover:bg-amber-100" },
    ],
  },
  "2": {
    id: "2", label: "Despertar interesse", tipo: "fala",
    fala: "Então tô ligando na hora certa. Tenho um lançamento com condições que a gente normalmente só apresenta pessoalmente — porque vale a pena ver com calma. Você teria uns 20 minutinhos essa semana pra eu te mostrar?",
    opcoes: [
      { label: "Sim, posso ir",         emoji: "✅", nextStep: "3",       color: "bg-emerald-50 border-emerald-300 text-emerald-700 hover:bg-emerald-100" },
      { label: "O que é? / Qual construtora?", emoji: "❓", nextStep: "3b", color: "bg-blue-50 border-blue-300 text-blue-700 hover:bg-blue-100" },
      { label: "Talvez / Hesitou",      emoji: "⏸", nextStep: "3b",      color: "bg-amber-50 border-amber-300 text-amber-700 hover:bg-amber-100" },
    ],
  },
  "3": {
    id: "3", label: "Fechar visita", tipo: "acao",
    fala: "Ótimo! Aqui no nosso espaço a gente monta o cenário completo pra você — entrada, parcela, tudo. Terça ou quinta fica melhor?",
    dica: "Registre a data escolhida e dispare a confirmação via WhatsApp.",
    opcoes: [
      { label: "Confirmar visita + WhatsApp", emoji: "📅", nextStep: "fim", color: "bg-emerald-50 border-emerald-300 text-emerald-700 hover:bg-emerald-100", action: "wa_visita" },
    ],
  },
  "3b": {
    id: "3b", label: "Contornar objeção", tipo: "fala",
    fala: "É um empreendimento de uma construtora com mais de 50 anos de mercado, referência nacional. Mas o que eu quero te mostrar são as condições — porque na planta é onde tá a oportunidade real. Vale 20 minutos do seu tempo.",
    opcoes: [
      { label: "Topou vir",             emoji: "✅", nextStep: "3",       color: "bg-emerald-50 border-emerald-300 text-emerald-700 hover:bg-emerald-100" },
      { label: "Não quer",              emoji: "❌", nextStep: "encerrar", color: "bg-rose-50 border-rose-300 text-rose-700 hover:bg-rose-100", action: "encerrar" },
    ],
  },
  "4": {
    id: "4", label: "Cliente ocupado", tipo: "acao",
    fala: "Sem problema! Quando seria melhor pra você? Posso te ligar amanhã de manhã ou à tarde — qual funciona mais?",
    dica: "Registre o melhor horário e agende o retorno no discador.",
    opcoes: [
      { label: "Agendar retorno", emoji: "🕐", nextStep: "fim", color: "bg-amber-50 border-amber-300 text-amber-700 hover:bg-amber-100", action: "retorno" },
    ],
  },
  "encerrar": {
    id: "encerrar", label: "Encerrar", tipo: "encerrar",
    fala: "Sem problema, {firstName}! Qualquer coisa que precisar, pode contar comigo. Tenha um ótimo dia!",
    opcoes: [],
  },
  "fim": {
    id: "fim", label: "Concluído", tipo: "encerrar",
    fala: "",
    opcoes: [],
  },
};

const FUNIL_EVENTO: Record<string, FunilStep> = {
  "1": {
    id: "1", label: "Gancho", tipo: "fala",
    fala: `{firstName}? Oi, aqui é o {corretorNome}. Tudo bem? Olha, vi que você tá buscando o primeiro imóvel — e esse sábado a gente vai fazer algo diferente aqui. Posso te contar?`,
    opcoes: [
      { label: "Sim, pode falar",       emoji: "✅", nextStep: "2",       color: "bg-emerald-50 border-emerald-300 text-emerald-700 hover:bg-emerald-100" },
      { label: "Tô ocupado agora",      emoji: "⏸", nextStep: "4",       color: "bg-amber-50 border-amber-300 text-amber-700 hover:bg-amber-100" },
    ],
  },
  "2": {
    id: "2", label: "Revelar o evento", tipo: "fala",
    fala: "A gente preparou um evento especial pra mães que têm o sonho do imóvel próprio. Vai ter condições exclusivas, atendimento personalizado — e é só das 8h30 ao meio-dia, bem tranquilo. Você teria como aparecer?",
    opcoes: [
      { label: "Sim, vou!",             emoji: "✅", nextStep: "3",       color: "bg-emerald-50 border-emerald-300 text-emerald-700 hover:bg-emerald-100" },
      { label: "Qual construtora?",     emoji: "❓", nextStep: "2b",      color: "bg-blue-50 border-blue-300 text-blue-700 hover:bg-blue-100" },
      { label: "Talvez / Hesitou",      emoji: "⏸", nextStep: "2b",      color: "bg-amber-50 border-amber-300 text-amber-700 hover:bg-amber-100" },
    ],
  },
  "2b": {
    id: "2b", label: "Contornar curiosidade", tipo: "fala",
    fala: "É uma construtora com mais de 50 anos de história, a maior da América Latina em famílias atendidas. O nome você vai reconhecer quando chegar — o que importa são as condições que a gente preparou pro evento. Vale muito a visita.",
    opcoes: [
      { label: "Topou ir",              emoji: "✅", nextStep: "3",       color: "bg-emerald-50 border-emerald-300 text-emerald-700 hover:bg-emerald-100" },
      { label: "Não quer",              emoji: "❌", nextStep: "encerrar", color: "bg-rose-50 border-rose-300 text-rose-700 hover:bg-rose-100", action: "encerrar" },
    ],
  },
  "3": {
    id: "3", label: "Confirmar presença", tipo: "acao",
    fala: "Perfeito! Sábado das 8h30 às 14h, aqui no nosso espaço. Vou te mandar o endereço agora no WhatsApp. Você vem sozinha ou com alguém?",
    dica: "Registre a presença e dispare a confirmação via WhatsApp.",
    opcoes: [
      { label: "Confirmar + WhatsApp", emoji: "🌸", nextStep: "fim", color: "bg-emerald-50 border-emerald-300 text-emerald-700 hover:bg-emerald-100", action: "wa_evento" },
    ],
  },
  "4": {
    id: "4", label: "Cliente ocupado", tipo: "acao",
    fala: "Sem problema! Posso te ligar amanhã ou depois pra te contar melhor. Manhã ou tarde fica melhor pra você?",
    dica: "Agende o retorno no discador.",
    opcoes: [
      { label: "Agendar retorno", emoji: "🕐", nextStep: "fim", color: "bg-amber-50 border-amber-300 text-amber-700 hover:bg-amber-100", action: "retorno" },
    ],
  },
  "encerrar": {
    id: "encerrar", label: "Encerrar", tipo: "encerrar",
    fala: "Sem problema, {firstName}! Se mudar de ideia, pode me chamar. Tenha um ótimo dia!",
    opcoes: [],
  },
  "fim": {
    id: "fim", label: "Concluído", tipo: "encerrar",
    fala: "",
    opcoes: [],
  },
};

function ScriptFunil({
  firstName, funilType, setFunilType, funilStep, setFunilStep,
  telefone, followupDate, setFollowupDate, setOutcome, toDatetimeLocal,
}: {
  firstName: string;
  funilType: "padrao" | "evento";
  setFunilType: (t: "padrao" | "evento") => void;
  funilStep: string;
  setFunilStep: (s: string) => void;
  telefone: string;
  followupDate: string;
  setFollowupDate: (d: string) => void;
  setOutcome: (o: string) => void;
  toDatetimeLocal: (iso: string | null | undefined) => string;
}) {
  const profile = loadProfile();
  const ENDERECO_LOJA = profile.endereco;
  const funil = funilType === "padrao" ? FUNIL_PADRAO : FUNIL_EVENTO;
  const steps = Object.values(funil).filter(s => s.id !== "fim" && s.id !== "encerrar");
  const step = funil[funilStep];

  function buildFala(text: string) {
    return text
      .replace(/\{firstName\}/g, firstName || "{Nome}")
      .replace(/\{corretorNome\}/g, profile.nome);
  }

  function toWaNumber(tel: string) {
    let d = tel.replace(/\D/g, "");
    if (d.startsWith("0")) d = d.slice(1);
    if (!d.startsWith("55")) d = "55" + d;
    return d;
  }

  function handleOpcao(opcao: NonNullable<FunilStep["opcoes"]>[number]) {
    // Executa ação se houver
    if (opcao.action === "encerrar") {
      setOutcome("sem_interesse");
    }
    if (opcao.action === "retorno") {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(9, 0, 0, 0);
      setFollowupDate(toDatetimeLocal(tomorrow.toISOString()));
      setOutcome("retornar");
    }
    if (opcao.action === "wa_visita") {
      const msg = encodeURIComponent(
        `${firstName}, foi um prazer falar com você! Confirmando sua visita aqui no nosso espaço de atendimento (${ENDERECO_LOJA}). Qualquer dúvida, pode me chamar aqui. Até lá!`
      );
      window.open(`https://wa.me/${toWaNumber(telefone)}?text=${msg}`, "_blank");
      setOutcome("visita");
    }
    if (opcao.action === "wa_evento") {
      const msg = encodeURIComponent(
        `${firstName}, que bom que vai poder vir! 🌸 Te espero sábado, das 8h30 às 14h aqui no nosso espaço (${ENDERECO_LOJA}). Preparei algo especial. Até lá!`
      );
      window.open(`https://wa.me/${toWaNumber(telefone)}?text=${msg}`, "_blank");
      setOutcome("agendado");
    }
    setFunilStep(opcao.nextStep);
  }

  const isFim = funilStep === "fim";
  const isEncerrar = funilStep === "encerrar";

  return (
    <div className="space-y-3">
      {/* Seletor de funil */}
      <div className="flex rounded-lg overflow-hidden border shadow-sm">
        <button
          onClick={() => { setFunilType("padrao"); setFunilStep("1"); }}
          className={`flex-1 py-2 text-[11px] font-semibold transition-colors ${
            funilType === "padrao"
              ? "bg-primary text-primary-foreground"
              : "bg-card text-muted-foreground hover:bg-muted/50"
          }`}
        >
          🏠 Padrão
        </button>
        <button
          onClick={() => { setFunilType("evento"); setFunilStep("1"); }}
          className={`flex-1 py-2 text-[11px] font-semibold transition-colors ${
            funilType === "evento"
              ? "bg-primary text-primary-foreground"
              : "bg-card text-muted-foreground hover:bg-muted/50"
          }`}
        >
          🌸 Dia das Mães
        </button>
      </div>

      {/* Breadcrumb de etapas */}
      <div className="flex items-center gap-1 flex-wrap">
        {steps.map((s, idx) => {
          const isActive = s.id === funilStep;
          const isPast = steps.findIndex(x => x.id === funilStep) > idx;
          return (
            <button
              key={s.id}
              onClick={() => setFunilStep(s.id)}
              className={`text-[9px] px-2 py-0.5 rounded-full font-semibold border transition-colors ${
                isActive
                  ? "bg-primary text-primary-foreground border-primary"
                  : isPast
                    ? "bg-emerald-100 text-emerald-700 border-emerald-300"
                    : "bg-muted/50 text-muted-foreground border-muted"
              }`}
            >
              {s.label}
            </button>
          );
        })}
        <button
          onClick={() => setFunilStep("1")}
          className="ml-auto text-[9px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-0.5"
          title="Reiniciar"
        >
          ↺ Reiniciar
        </button>
      </div>

      {/* Card da etapa atual */}
      {isFim ? (
        <Card className="p-4 shadow-card bg-emerald-50 border-emerald-200">
          <div className="text-center py-4">
            <div className="text-3xl mb-2">✅</div>
            <p className="font-semibold text-emerald-800 text-sm">Atendimento concluído!</p>
            <p className="text-xs text-emerald-700 mt-1">Salve a ligação para registrar o resultado.</p>
            <button
              onClick={() => setFunilStep("1")}
              className="mt-3 text-xs text-emerald-600 hover:text-emerald-800 underline"
            >
              Reiniciar script
            </button>
          </div>
        </Card>
      ) : isEncerrar ? (
        <Card className="p-4 shadow-card bg-rose-50 border-rose-200">
          <div className="text-[10px] uppercase tracking-wider text-rose-600 font-semibold mb-2 flex items-center gap-1">
            <span>Encerrar com gentileza</span>
          </div>
          <p className="text-sm text-rose-900 leading-relaxed font-medium italic">
            "{buildFala(step.fala)}"
          </p>
          <button
            onClick={() => setFunilStep("1")}
            className="mt-3 text-xs text-rose-600 hover:text-rose-800 underline"
          >
            Reiniciar script
          </button>
        </Card>
      ) : step ? (
        <Card className={`p-4 shadow-card border-2 ${
          step.tipo === "acao" ? "border-amber-200 bg-amber-50/50" : "border-primary/20"
        }`}>
          {/* Header da etapa */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                step.tipo === "acao"
                  ? "bg-amber-100 text-amber-700"
                  : "bg-primary/10 text-primary"
              }`}>
                Etapa {step.id}
              </span>
              <span className="text-[10px] text-muted-foreground font-medium">{step.label}</span>
            </div>
            {step.tipo === "acao" && (
              <span className="text-[9px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-semibold">
                AÇÃO
              </span>
            )}
          </div>

          {/* Fala */}
          {step.fala && (
            <div className="bg-white rounded-lg px-3 py-3 border border-border mb-3">
              <p className="text-sm text-foreground leading-relaxed">
                "{buildFala(step.fala).split(firstName).map((part, i, arr) =>
                  i < arr.length - 1
                    ? <span key={i}>{part}<strong className="text-primary">{firstName}</strong></span>
                    : <span key={i}>{part}</span>
                )}"
              </p>
            </div>
          )}

          {/* Dica de ação */}
          {step.dica && (
            <p className="text-[11px] text-amber-700 bg-amber-100 rounded px-2 py-1.5 mb-3 flex items-center gap-1">
              💡 {step.dica}
            </p>
          )}

          {/* Opções de resposta */}
          {step.opcoes && step.opcoes.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                {step.tipo === "acao" ? "Executar:" : "Cliente respondeu:"}
              </p>
              {step.opcoes.map((opcao, i) => (
                <button
                  key={i}
                  onClick={() => handleOpcao(opcao)}
                  className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg border text-left text-xs font-medium transition-all hover:scale-[1.01] active:scale-[0.99] ${opcao.color}`}
                >
                  <span className="text-base shrink-0">{opcao.emoji}</span>
                  <span>{opcao.label}</span>
                  <span className="ml-auto text-[10px] opacity-60">→</span>
                </button>
              ))}
            </div>
          )}
        </Card>
      ) : null}

      {/* Follow-up se retorno agendado */}
      {followupDate && (
        <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
          <p className="text-[10px] text-amber-700 font-semibold uppercase tracking-wider mb-1">
            ⏰ Retorno agendado
          </p>
          <input
            type="datetime-local"
            value={followupDate}
            onChange={e => setFollowupDate(e.target.value)}
            className="w-full text-xs border rounded px-2 py-1 bg-white"
          />
        </div>
      )}
    </div>
  );
}

function WaIcon() {
  return (
    <svg className="h-4 w-4 mr-2" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
      <path d="M12 0C5.373 0 0 5.373 0 12c0 2.136.563 4.14 1.542 5.877L.057 23.882l6.177-1.461A11.945 11.945 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.954a9.926 9.926 0 01-5.127-1.424l-.368-.218-3.812.901.964-3.715-.24-.381A9.954 9.954 0 012.046 12C2.046 6.476 6.476 2.046 12 2.046S21.954 6.476 21.954 12 17.524 21.954 12 21.954z"/>
    </svg>
  );
}

function StatBox({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Card className="px-4 py-3 shadow-card flex items-center gap-3 min-w-[130px]">
      <div className="h-9 w-9 rounded-lg bg-accent text-accent-foreground flex items-center justify-center">{icon}</div>
      <div>
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className="font-display font-bold text-lg tabular-nums">{value}</div>
      </div>
    </Card>
  );
}