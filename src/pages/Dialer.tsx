import React, { useEffect, useRef, useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  LEAD_STATUS_LABELS, LEAD_STATUS_COLOR, LEAD_STATUSES, LEAD_STATUS_LOST,
  MENSAGEM_CATEGORIAS, MENSAGEM_CATEGORIA_LABELS, MENSAGEM_CATEGORIA_COLOR, MENSAGEM_CATEGORIA_EMOJI,
  MENSAGEM_STATUS_CONTATO_ORDER, MENSAGEM_STATUS_CONTATO_LABELS, MENSAGEM_STATUS_CONTATO_COLOR, MENSAGEM_STATUS_CONTATO_EMOJI,
  formatPhone, type MensagemCategoria, type MensagemStatusContato,
} from "@/lib/crm";
import {
  MessageCircle, MessageSquare, SkipForward, Send, Check, RefreshCw,
  ChevronDown, ChevronRight, Search, X, Pencil, Save, Clock,
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

type LeadList = { id: string; nome: string };

type Mensagem = {
  id: string;
  categoria: MensagemCategoria;
  texto: string;
  canal: string;
  status_contato: MensagemStatusContato;
  observacao: string | null;
  enviada_em: string;
};

type QueueItem = Lead & { _done: boolean; _lastCategoria?: MensagemCategoria };

// ── Templates padrão por categoria (editáveis, persistidos no navegador) ────
const TEMPLATE_KEY_PREFIX = "enviador_template_";
const DEFAULT_TEMPLATES: Record<MensagemCategoria, string> = {
  recompra: "Oi {firstName}! Tudo bem? 💎 Faz um tempinho que você não aparece por aqui na Renata Joias — separei umas peças que combinam com o seu estilo. Bora dar uma olhada?",
  novidade: "Oi {firstName}! ✨ Chegou novidade na Renata Joias e lembrei de você na hora! Quer que eu te mande fotos das peças novas?",
  desconto: "Oi {firstName}! 🏷️ Consegui um desconto especial pra você aqui na Renata Joias. Posso te mandar os detalhes?",
  promocao: "Oi {firstName}! 🔥 Tá rolando uma promoção imperdível na Renata Joias, mas é por tempo limitado. Corre que separei uma coisa pra você!",
};

function loadTemplate(cat: MensagemCategoria): string {
  try { return localStorage.getItem(TEMPLATE_KEY_PREFIX + cat) || DEFAULT_TEMPLATES[cat]; }
  catch { return DEFAULT_TEMPLATES[cat]; }
}
function saveTemplate(cat: MensagemCategoria, text: string) {
  try { localStorage.setItem(TEMPLATE_KEY_PREFIX + cat, text); } catch {}
}

const CONTACTED_KEY = "enviador_contacted_ids";
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
  let d = (telefone || "").replace(/\D/g, "");
  if (d.startsWith("0")) d = d.slice(1);
  if (!d.startsWith("55")) d = "55" + d;
  return d;
}

function cleanName(nome: string): string {
  if (!nome) return "";
  const parts = nome.trim().split(/\s+/);
  for (const part of parts) {
    const cleaned = part.replace(/^[^a-zA-ZÀ-ÿ]+/, "").replace(/[^a-zA-ZÀ-ÿ]+$/, "").trim();
    if (cleaned.length >= 3) return cleaned;
  }
  return parts[0]?.replace(/^[^a-zA-ZÀ-ÿ]+/, "").trim() || parts[0] || "";
}

function renderTemplate(text: string, nome: string): string {
  const firstName = cleanName(nome) || nome?.split(" ")[0] || "";
  return text.replace(/\{firstName\}/g, firstName);
}

function fmtWhen(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return (sameDay ? "Hoje" : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }))
    + " às " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export default function Dialer() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const [lead, setLead]                     = useState<Lead | null>(null);
  const [leadMensagens, setLeadMensagens]   = useState<Mensagem[]>([]);
  const [note, setNote]                     = useState("");

  const [lists, setLists]                   = useState<LeadList[]>([]);
  const [activeList, setActiveList]         = useState<string>("all");
  const [activeStatus, setActiveStatus]     = useState<string>("all");
  const [searchQuery, setSearchQuery]       = useState("");

  const [queue, setQueue]                   = useState<QueueItem[]>([]);
  const [loadingQueue, setLoadingQueue]     = useState(false);

  const [categoria, setCategoria]           = useState<MensagemCategoria>("recompra");
  const [templates, setTemplates]           = useState<Record<MensagemCategoria, string>>(() => {
    const t = {} as Record<MensagemCategoria, string>;
    for (const c of MENSAGEM_CATEGORIAS) t[c] = loadTemplate(c);
    return t;
  });
  const [editingTemplate, setEditingTemplate] = useState(false);
  const [templateDraft, setTemplateDraft]   = useState("");
  const [messageDraft, setMessageDraft]     = useState("");
  const [sending, setSending]               = useState(false);

  const [todayStats, setTodayStats]         = useState<{ total: number; byCategoria: Record<string, number> }>({ total: 0, byCategoria: {} });
  const [showContacted, setShowContacted]   = useState(false);
  const [contactedLeads, setContactedLeads] = useState<QueueItem[]>([]);
  const [loadingContacted, setLoadingContacted] = useState(false);

  const contactedTodayRef = useRef<Set<string>>(new Set(loadContactedToday()));
  const skippedIdsRef     = useRef<Set<string>>(new Set());

  const queuePending = queue.filter(l => !l._done);
  const pendingCount = queuePending.length;

  // Atualiza o rascunho da mensagem quando muda o lead ou a categoria
  useEffect(() => {
    if (!lead) { setMessageDraft(""); return; }
    setMessageDraft(renderTemplate(templates[categoria], lead.nome));
  }, [lead?.id, categoria, templates]);

  useEffect(() => {
    if (!lead) { setLeadMensagens([]); return; }
    supabase
      .from("mensagens")
      .select("id,categoria,texto,canal,status_contato,observacao,enviada_em")
      .eq("lead_id", lead.id)
      .order("enviada_em", { ascending: false })
      .limit(20)
      .then(({ data }) => setLeadMensagens((data ?? []) as Mensagem[]));
  }, [lead?.id]);

  async function loadLists() {
    const { data } = await supabase.from("lead_lists").select("id,nome").order("created_at", { ascending: false });
    setLists((data ?? []) as LeadList[]);
  }

  async function loadStats() {
    if (!user) return;
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const { data } = await supabase
      .from("mensagens")
      .select("categoria")
      .eq("atendente_id", user.id)
      .gte("enviada_em", start.toISOString());
    const rows = data ?? [];
    const byCategoria: Record<string, number> = {};
    rows.forEach((r: any) => { byCategoria[r.categoria] = (byCategoria[r.categoria] ?? 0) + 1; });
    setTodayStats({ total: rows.length, byCategoria });
  }

  const loadQueue = useCallback(async (): Promise<Lead[]> => {
    setLoadingQueue(true);
    skippedIdsRef.current = new Set();

    let query = supabase
      .from("leads")
      .select("id,nome,telefone,status,observacoes,origem,proximo_followup")
      .order("nome", { ascending: true });

    if (activeStatus !== "all") {
      query = query.eq("status", activeStatus as any);
    } else {
      query = query.not("status", "in", `(${LEAD_STATUS_LOST.join(",")})`);
    }
    if (activeList !== "all") query = query.eq("list_id", activeList);
    if (searchQuery.trim()) query = query.or(`nome.ilike.%${searchQuery}%,telefone.ilike.%${searchQuery}%`);

    const { data, error } = await query.limit(500);
    if (error) { toast.error("Erro ao carregar fila: " + error.message); setLoadingQueue(false); return []; }

    const leads = (data ?? []) as Lead[];
    setQueue(leads.map(l => ({ ...l, _done: contactedTodayRef.current.has(l.id) })));
    setLoadingQueue(false);
    return leads;
  }, [activeList, activeStatus, searchQuery]);

  async function loadContactedLeads() {
    if (!user) return;
    setLoadingContacted(true);
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const { data: msgData } = await supabase
      .from("mensagens")
      .select("lead_id,categoria,enviada_em")
      .eq("atendente_id", user.id)
      .gte("enviada_em", start.toISOString())
      .order("enviada_em", { ascending: false });

    const ids = [...new Set((msgData ?? []).map((m: any) => m.lead_id as string))];
    const catByLead = new Map<string, MensagemCategoria>();
    (msgData ?? []).forEach((m: any) => { if (!catByLead.has(m.lead_id)) catByLead.set(m.lead_id, m.categoria); });

    if (ids.length === 0) { setContactedLeads([]); setLoadingContacted(false); return; }

    let allLeads: Lead[] = [];
    for (let i = 0; i < ids.length; i += 50) {
      const batch = ids.slice(i, i + 50);
      const { data } = await supabase
        .from("leads")
        .select("id,nome,telefone,status,observacoes,origem,proximo_followup")
        .in("id", batch);
      allLeads = [...allLeads, ...((data ?? []) as Lead[])];
    }
    const byId = new Map(allLeads.map(l => [l.id, l]));
    const ordered = ids.map(id => byId.get(id)).filter((l): l is Lead => !!l);
    setContactedLeads(ordered.map(l => ({ ...l, _done: true, _lastCategoria: catByLead.get(l.id) })));
    setLoadingContacted(false);
  }

  useEffect(() => {
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
  }, [activeList, activeStatus, searchQuery, searchParams.get("lead")]);

  useEffect(() => {
    if (!user) return;
    loadLists();
    loadStats();
    loadContactedLeads();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  function clearRequestedLead() {
    if (searchParams.get("lead")) { searchParams.delete("lead"); setSearchParams(searchParams, { replace: true }); }
  }

  function advanceQueue(doneId: string) {
    contactedTodayRef.current.add(doneId);
    saveContactedToday(Array.from(contactedTodayRef.current));
    setQueue(prev => {
      const updated = prev.map(l => l.id === doneId ? { ...l, _done: true } : l);
      const next = updated.find(l => !l._done && l.id !== doneId) ?? null;
      setLead(next);
      setNote("");
      return updated;
    });
  }

  function selectFromQueue(l: QueueItem) {
    clearRequestedLead();
    setLead(l);
    setNote("");
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
      setNote("");
      return prev;
    });
  }

  async function sendMessage() {
    if (!lead || !user || !messageDraft.trim()) return;
    setSending(true);

    const { error } = await supabase.from("mensagens").insert({
      lead_id: lead.id,
      atendente_id: user.id,
      categoria,
      texto: messageDraft.trim(),
      canal: "whatsapp",
      status_contato: "enviada",
      observacao: note.trim() || null,
    });

    setSending(false);
    if (error) { toast.error(error.message); return; }

    window.open(`https://wa.me/${toWhatsAppNumber(lead.telefone)}?text=${encodeURIComponent(messageDraft.trim())}`, "_blank");

    toast.success(`Mensagem de ${MENSAGEM_CATEGORIA_LABELS[categoria].toLowerCase()} registrada para ${cleanName(lead.nome)}`);
    clearRequestedLead();
    loadStats();
    loadContactedLeads();
    setLeadMensagens(prev => [{
      id: `tmp-${Date.now()}`, categoria, texto: messageDraft.trim(), canal: "whatsapp",
      status_contato: "enviada", observacao: note.trim() || null, enviada_em: new Date().toISOString(),
    }, ...prev]);
    advanceQueue(lead.id);
  }

  async function setStatusContato(msg: Mensagem, status_contato: MensagemStatusContato) {
    if (msg.status_contato === status_contato) return;
    const { error } = await supabase.from("mensagens").update({ status_contato }).eq("id", msg.id);
    if (error) { toast.error(error.message); return; }
    setLeadMensagens(prev => prev.map(m => m.id === msg.id ? { ...m, status_contato } : m));
  }

  function startEditingTemplate() {
    setTemplateDraft(templates[categoria]);
    setEditingTemplate(true);
  }
  function saveTemplateEdit() {
    setTemplates(prev => ({ ...prev, [categoria]: templateDraft }));
    saveTemplate(categoria, templateDraft);
    setEditingTemplate(false);
    toast.success("Modelo de mensagem salvo");
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <header className="mb-5 flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold flex items-center gap-2">
            <MessageCircle className="h-7 w-7 text-primary" /> Enviador de Mensagens
          </h1>
          <p className="text-muted-foreground mt-1">{pendingCount} lead{pendingCount !== 1 ? "s" : ""} na fila</p>
        </div>
        <div className="flex gap-3 flex-wrap">
          <StatBox label="Hoje" value={String(todayStats.total)} />
          {MENSAGEM_CATEGORIAS.map(c => (
            <StatBox key={c} label={`${MENSAGEM_CATEGORIA_EMOJI[c]} ${MENSAGEM_CATEGORIA_LABELS[c]}`} value={String(todayStats.byCategoria[c] ?? 0)} />
          ))}
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-5">
        {/* ── Coluna esquerda: fila ────────────────────────────────────────── */}
        <div className="space-y-3">
          <Card className="p-3 space-y-2 shadow-card">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Buscar lead…" className="pl-8 h-9 text-sm" />
            </div>
            <Select value={activeStatus} onValueChange={setActiveStatus}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Todos os status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os pendentes</SelectItem>
                {LEAD_STATUSES.map(s => <SelectItem key={s} value={s}>{LEAD_STATUS_LABELS[s]}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={activeList} onValueChange={setActiveList}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Todas as listas" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">📋 Todas as listas</SelectItem>
                {lists.map(l => <SelectItem key={l.id} value={l.id}>{l.nome}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button variant="ghost" size="sm" className="w-full" onClick={() => loadQueue()} disabled={loadingQueue}>
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loadingQueue ? "animate-spin" : ""}`} /> Atualizar fila
            </Button>
          </Card>

          <Card className="shadow-card overflow-hidden">
            <div className="max-h-[520px] overflow-y-auto divide-y">
              {loadingQueue ? (
                <div className="p-6 text-center text-sm text-muted-foreground">Carregando…</div>
              ) : queuePending.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  <Check className="h-8 w-8 mx-auto mb-2 text-emerald-400" />
                  Fila vazia — todo mundo já foi contactado hoje.
                </div>
              ) : queuePending.map(l => (
                <button
                  key={l.id}
                  onClick={() => selectFromQueue(l)}
                  className={`w-full text-left px-3 py-2.5 hover:bg-muted/50 transition-colors flex items-center gap-2 ${lead?.id === l.id ? "bg-primary/5 border-l-2 border-primary" : ""}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{l.nome}</div>
                    <div className="text-xs text-muted-foreground">{formatPhone(l.telefone)}</div>
                  </div>
                  <Badge variant="secondary" className={`text-[10px] shrink-0 ${LEAD_STATUS_COLOR[l.status as keyof typeof LEAD_STATUS_COLOR] ?? "bg-muted"}`}>
                    {LEAD_STATUS_LABELS[l.status as keyof typeof LEAD_STATUS_LABELS] ?? l.status}
                  </Badge>
                </button>
              ))}
            </div>
          </Card>

          <Card className="shadow-card overflow-hidden">
            <button onClick={() => setShowContacted(v => !v)} className="w-full flex items-center justify-between px-3 py-2.5 text-sm font-medium hover:bg-muted/40 transition-colors">
              <span className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-600" /> Contactados hoje ({contactedLeads.length})</span>
              {showContacted ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
            {showContacted && (
              <div className="max-h-72 overflow-y-auto divide-y border-t">
                {loadingContacted ? (
                  <div className="p-4 text-center text-xs text-muted-foreground">Carregando…</div>
                ) : contactedLeads.length === 0 ? (
                  <div className="p-4 text-center text-xs text-muted-foreground">Ninguém contactado ainda hoje.</div>
                ) : contactedLeads.map(l => (
                  <button key={l.id} onClick={() => selectFromQueue(l)} className="w-full text-left px-3 py-2 hover:bg-muted/40 transition-colors flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium truncate">{l.nome}</div>
                    </div>
                    {l._lastCategoria && (
                      <span className="text-xs shrink-0">{MENSAGEM_CATEGORIA_EMOJI[l._lastCategoria]}</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* ── Coluna direita: composer ─────────────────────────────────────── */}
        <div className="space-y-4">
          {!lead ? (
            <Card className="p-12 text-center shadow-card">
              <MessageCircle className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
              <p className="text-muted-foreground">Selecione um lead na fila para começar.</p>
            </Card>
          ) : (
            <>
              <Card className="p-5 shadow-card">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <h2 className="font-display text-xl font-bold">{lead.nome}</h2>
                    <p className="text-sm text-muted-foreground">{formatPhone(lead.telefone)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className={LEAD_STATUS_COLOR[lead.status as keyof typeof LEAD_STATUS_COLOR] ?? "bg-muted"}>
                      {LEAD_STATUS_LABELS[lead.status as keyof typeof LEAD_STATUS_LABELS] ?? lead.status}
                    </Badge>
                    <Button variant="outline" size="sm" onClick={skipLead}>
                      <SkipForward className="h-3.5 w-3.5 mr-1.5" /> Pular
                    </Button>
                  </div>
                </div>
                {lead.observacoes && (
                  <p className="text-sm text-muted-foreground mt-3 border-t pt-3 whitespace-pre-wrap">{lead.observacoes}</p>
                )}
              </Card>

              <Card className="p-5 shadow-card space-y-4">
                {/* Categorias */}
                <div className="flex gap-2 flex-wrap">
                  {MENSAGEM_CATEGORIAS.map(c => (
                    <button
                      key={c}
                      onClick={() => { setCategoria(c); setEditingTemplate(false); }}
                      className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg border text-sm font-medium transition-colors ${
                        categoria === c ? MENSAGEM_CATEGORIA_COLOR[c] + " ring-1 ring-inset ring-current" : "bg-background border-input text-muted-foreground hover:bg-muted/50"
                      }`}
                    >
                      <span>{MENSAGEM_CATEGORIA_EMOJI[c]}</span> {MENSAGEM_CATEGORIA_LABELS[c]}
                    </button>
                  ))}
                </div>

                {/* Modelo / mensagem */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Mensagem</label>
                    {!editingTemplate ? (
                      <button onClick={startEditingTemplate} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                        <Pencil className="h-3 w-3" /> Editar modelo padrão
                      </button>
                    ) : (
                      <div className="flex gap-2">
                        <button onClick={() => setEditingTemplate(false)} className="flex items-center gap-1 text-xs text-rose-500 hover:text-rose-700">
                          <X className="h-3 w-3" /> Cancelar
                        </button>
                        <button onClick={saveTemplateEdit} className="flex items-center gap-1 text-xs text-emerald-600 font-semibold hover:text-emerald-800">
                          <Save className="h-3 w-3" /> Salvar modelo
                        </button>
                      </div>
                    )}
                  </div>
                  {editingTemplate ? (
                    <Textarea value={templateDraft} onChange={e => setTemplateDraft(e.target.value)} rows={4} className="text-sm"
                      placeholder="Use {firstName} para o primeiro nome do cliente" />
                  ) : (
                    <Textarea value={messageDraft} onChange={e => setMessageDraft(e.target.value)} rows={4} className="text-sm" />
                  )}
                  <p className="text-[11px] text-muted-foreground mt-1">Use <code>{"{firstName}"}</code> no modelo para inserir o primeiro nome do cliente automaticamente.</p>
                </div>

                <Input value={note} onChange={e => setNote(e.target.value)} placeholder="Observação interna (opcional)" className="text-sm" />

                <Button onClick={sendMessage} disabled={sending || !messageDraft.trim()} className="w-full" size="lg">
                  <Send className="h-4 w-4 mr-2" /> Enviar pelo WhatsApp
                </Button>
              </Card>

              {/* Histórico de mensagens do lead */}
              <Card className="p-5 shadow-card">
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-muted-foreground" /> Mensagens anteriores
                </h3>
                {leadMensagens.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhuma mensagem enviada ainda para este lead.</p>
                ) : (
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {leadMensagens.map(m => (
                      <div key={m.id} className="flex items-start gap-2 p-2.5 rounded-lg bg-muted/30">
                        <span className="text-lg shrink-0">{MENSAGEM_CATEGORIA_EMOJI[m.categoria]}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-semibold">{MENSAGEM_CATEGORIA_LABELS[m.categoria]}</span>
                            <span className="text-[11px] text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" />{fmtWhen(m.enviada_em)}</span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5 truncate">{m.texto}</p>
                        </div>
                        <div className="shrink-0 flex gap-0.5">
                          {MENSAGEM_STATUS_CONTATO_ORDER.map(s => (
                            <button
                              key={s}
                              onClick={() => setStatusContato(m, s)}
                              title={MENSAGEM_STATUS_CONTATO_LABELS[s]}
                              className={`h-6 w-6 flex items-center justify-center rounded-full text-[11px] transition-colors ${
                                m.status_contato === s ? MENSAGEM_STATUS_CONTATO_COLOR[s] + " ring-1 ring-inset ring-current" : "text-muted-foreground/40 hover:bg-muted"
                              }`}
                            >
                              {MENSAGEM_STATUS_CONTATO_EMOJI[s]}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <Card className="px-3.5 py-2.5 shadow-card flex flex-col items-center min-w-[76px]">
      <div className="font-display font-bold text-lg tabular-nums">{value}</div>
      <div className="text-[10px] text-muted-foreground text-center leading-tight">{label}</div>
    </Card>
  );
}
