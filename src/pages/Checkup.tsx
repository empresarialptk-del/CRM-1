import { useEffect, useState, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatPhone } from "@/lib/crm";
import {
  CheckCircle2, Star, TrendingUp, User, Search, ChevronRight,
  BookOpen, BarChart3, Clock, Target, Award, RefreshCw, Save,
  Phone, CalendarDays, ArrowLeft,
} from "lucide-react";
import { toast } from "sonner";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer,
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";

// ─── Estrutura do Check-up ACELERA ───────────────────────────────────────────

type CheckupItem = {
  id: number;
  desc: string;
  pts: number;
};

type CheckupCategory = {
  key: string;
  label: string;
  letter: string;
  color: string;
  bg: string;
  items: CheckupItem[];
};

const CHECKUP_CATEGORIES: CheckupCategory[] = [
  {
    key: "aborde",
    label: "Aborde Conquistando",
    letter: "A",
    color: "text-blue-700",
    bg: "bg-blue-50 border-blue-200",
    items: [
      { id: 1,  desc: "O corretor estava atento e foi ao encontro do cliente ao percebê-lo entrar no stand?", pts: 1.0 },
      { id: 2,  desc: "Foi cordial na sua apresentação, transmitindo simpatia e entusiasmo?", pts: 2.0 },
      { id: 3,  desc: "Ajustou sua linguagem ao perfil do cliente?", pts: 1.0 },
      { id: 4,  desc: "Identificou-se e perguntou o nome do cliente?", pts: 2.0 },
      { id: 5,  desc: "Desde o início o corretor chamou o cliente pelo nome?", pts: 2.0 },
      { id: 6,  desc: "O corretor estava com uma boa apresentação pessoal, vestindo-se adequadamente?", pts: 1.0 },
      { id: 7,  desc: "Houve alguma falha na sua imagem (odor de cigarro, unhas sujas, sapatos sujos, barba por fazer, mascando chiclete)? SIM=-1,0 / NÃO=1,0", pts: 1.0 },
    ],
  },
  {
    key: "conheca",
    label: "Conheça o Cliente",
    letter: "C",
    color: "text-emerald-700",
    bg: "bg-emerald-50 border-emerald-200",
    items: [
      { id: 8,  desc: "Soube fazer perguntas abertas, que estimulam o cliente a falar?", pts: 2.0 },
      { id: 9,  desc: "Conseguiu obter do cliente informações suficientes, antes de iniciar a apresentação?", pts: 2.0 },
      { id: 10, desc: "Fez perguntas para entender as necessidades do cliente?", pts: 2.0 },
      { id: 11, desc: "Fez perguntas para entender os gostos, estilos e desejos do cliente?", pts: 2.0 },
      { id: 12, desc: "Descobriu os benefícios que o cliente valoriza?", pts: 1.5 },
      { id: 13, desc: "Conseguiu descobrir o potencial financeiro do cliente?", pts: 0.5 },
    ],
  },
  {
    key: "encante",
    label: "Encante na Apresentação",
    letter: "E",
    color: "text-purple-700",
    bg: "bg-purple-50 border-purple-200",
    items: [
      { id: 14, desc: "O corretor foi prestativo, sem preguiça ou pressa ao demonstrar o produto?", pts: 1.0 },
      { id: 15, desc: "Demonstrou conhecer as características e benefícios do produto oferecido?", pts: 2.0 },
      { id: 16, desc: "Envolveu o cliente com os benefícios do produto e criou telas mentais?", pts: 2.0 },
      { id: 17, desc: "Ajustou os benefícios às necessidades do cliente?", pts: 2.0 },
      { id: 18, desc: "Apresentou os benefícios da MRV?", pts: 1.0 },
      { id: 19, desc: "Demonstrou conhecimento da concorrência e da região?", pts: 1.0 },
      { id: 20, desc: "Transmitiu entusiasmo na sua apresentação?", pts: 1.0 },
    ],
  },
  {
    key: "lide",
    label: "Lide com as Objeções",
    letter: "L",
    color: "text-amber-700",
    bg: "bg-amber-50 border-amber-200",
    items: [
      { id: 21, desc: "As objeções foram aceitas pelo corretor com tranquilidade, sem reações ou antagonismo?", pts: 1.0 },
      { id: 22, desc: "Pesquisou a objeção devolvendo-a para o cliente em forma de pergunta?", pts: 2.0 },
      { id: 23, desc: "Criou uma linha de argumentação capaz de neutralizar as objeções?", pts: 2.0 },
      { id: 24, desc: "Foi persistente buscando superar as objeções, demonstrando controle da situação?", pts: 2.0 },
      { id: 25, desc: "Foi convincente nos argumentos, reforçando os benefícios do produto e/ou da MRV?", pts: 3.0 },
    ],
  },
  {
    key: "encerre",
    label: "Encerre sem Medo",
    letter: "E",
    color: "text-rose-700",
    bg: "bg-rose-50 border-rose-200",
    items: [
      { id: 26, desc: "O corretor identificou os sinais de compra e aproveitou a oportunidade?", pts: 2.0 },
      { id: 27, desc: "Realizou simulações de financiamento?", pts: 1.0 },
      { id: 28, desc: "Tomou a iniciativa e utilizou técnicas de fechamento?", pts: 2.5 },
      { id: 29, desc: "Estabeleceu algum compromisso com o cliente, como a elaboração de uma proposta?", pts: 2.0 },
      { id: 30, desc: "Criou senso de urgência e oportunidade?", pts: 2.5 },
    ],
  },
  {
    key: "relacione",
    label: "Relacione-se a Longo Prazo",
    letter: "R",
    color: "text-teal-700",
    bg: "bg-teal-50 border-teal-200",
    items: [
      { id: 31, desc: "Conseguiu o telefone do cliente para realizar o pós-atendimento?", pts: 1.0 },
      { id: 32, desc: "Entregou o seu cartão, colocando-se à disposição do cliente para outros contatos ou esclarecimentos?", pts: 1.0 },
      { id: 33, desc: "Fez o pós-atendimento entrando em contato com o cliente em até 48 horas?", pts: 2.0 },
      { id: 34, desc: "Pediu indicações ao cliente?", pts: 3.0 },
      { id: 35, desc: "No pós-atendimento, criou um senso de oportunidade para estimular o cliente a voltar à loja?", pts: 3.0 },
    ],
  },
  {
    key: "amplie",
    label: "Amplie sua Carteira",
    letter: "A",
    color: "text-indigo-700",
    bg: "bg-indigo-50 border-indigo-200",
    items: [
      { id: 36, desc: "Está com o seu CRM atualizado?", pts: 1.0 },
      { id: 37, desc: "Faz follow-up diário com os clientes do seu funil de vendas?", pts: 1.0 },
      { id: 38, desc: "Buscou realizar a ação de prospecção com clientes com o perfil alinhado ao imóvel?", pts: 1.0 },
      { id: 39, desc: "Possui um script para realizar a ação de prospecção e o aplicou?", pts: 1.5 },
      { id: 40, desc: "Utilizou bons argumentos para convencer o cliente a realizar a visita presencial?", pts: 2.5 },
      { id: 41, desc: "O cliente realizou a visita?", pts: 3.0 },
    ],
  },
];

// Perguntas Power — Conheça seu Cliente
const POWER_QUESTIONS = [
  {
    key: "familia",
    label: "Família",
    color: "text-pink-700",
    bg: "bg-pink-50 border-pink-200",
    questions: [
      "Com quem você mora atualmente?",
      "Você tem filhos? Quantos e qual a idade deles?",
      "Como é a rotina da sua família no dia a dia?",
      "Vocês costumam receber visitas de familiares em casa?",
      "O imóvel seria para moradia ou para a família crescer?",
    ],
  },
  {
    key: "tempo_livre",
    label: "Tempo Livre",
    color: "text-orange-700",
    bg: "bg-orange-50 border-orange-200",
    questions: [
      "O que você gosta de fazer nos fins de semana?",
      "Você pratica algum esporte ou atividade física?",
      "Costuma sair bastante ou prefere ficar em casa?",
      "Você tem animais de estimação?",
      "Gosta de área de lazer no condomínio ou prefere privacidade?",
    ],
  },
  {
    key: "trabalho",
    label: "Trabalho",
    color: "text-sky-700",
    bg: "bg-sky-50 border-sky-200",
    questions: [
      "Qual é a sua profissão?",
      "Você trabalha de forma presencial ou home office?",
      "Onde fica seu trabalho? Precisa de fácil acesso?",
      "Você é CLT, autônomo ou empresário?",
      "Seu trabalho exige que você viaje com frequência?",
    ],
  },
  {
    key: "renda",
    label: "Renda",
    color: "text-green-700",
    bg: "bg-green-50 border-green-200",
    questions: [
      "Você já teve alguma experiência com financiamento imobiliário?",
      "Pretende usar o FGTS na compra?",
      "Já sabe mais ou menos qual parcela caberia no seu orçamento?",
      "Tem renda composta com cônjuge ou familiar?",
      "Prefere dar uma entrada maior e parcelar menos, ou vice-versa?",
    ],
  },
];

// ─── Quadro de resultados ─────────────────────────────────────────────────────
function getResultLabel(nota: number): { label: string; color: string } {
  if (nota >= 10)        return { label: "Excelente", color: "text-emerald-600" };
  if (nota >= 8)         return { label: "Ótimo",     color: "text-green-600"   };
  if (nota >= 6)         return { label: "Bom",       color: "text-blue-600"    };
  if (nota >= 4)         return { label: "Regular",   color: "text-amber-600"   };
  if (nota >= 2)         return { label: "Fraco",     color: "text-orange-600"  };
  return                        { label: "Péssimo",   color: "text-rose-600"    };
}

type Lead = {
  id: string;
  nome: string;
  telefone: string;
  status: string;
  observacoes: string | null;
  proximo_followup: string | null;
};

// ─── Checkup salvo (localStorage por lead) ───────────────────────────────────
const STORAGE_PREFIX = "checkup_v1_";

function loadCheckup(leadId: string): Record<number, number> {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + leadId);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveCheckupLocal(leadId: string, scores: Record<number, number>) {
  try { localStorage.setItem(STORAGE_PREFIX + leadId, JSON.stringify(scores)); } catch {}
}

function loadPowerNotes(leadId: string): Record<string, string> {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + "power_" + leadId);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function savePowerNotes(leadId: string, notes: Record<string, string>) {
  try { localStorage.setItem(STORAGE_PREFIX + "power_" + leadId, JSON.stringify(notes)); } catch {}
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function Checkup() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [leads, setLeads]             = useState<Lead[]>([]);
  const [search, setSearch]           = useState("");
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [scores, setScores]           = useState<Record<number, number>>({});
  const [powerNotes, setPowerNotes]   = useState<Record<string, string>>({});
  const [activeTab, setActiveTab]     = useState<"checkup" | "power" | "evolucao" | "historico">("checkup");
  const [history, setHistory]         = useState<any[]>([]);
  const [saving, setSaving]           = useState(false);

  // Carrega leads com visita realizada ou convertido
  const loadLeads = useCallback(async () => {
    if (!user) return;
    // Busca todos os leads que já visitaram OU têm visita agendada
    const { data } = await supabase
      .from("leads")
      .select("id,nome,telefone,status,observacoes,proximo_followup")
      .in("status", [
        // Visita agendada / pendente
        "visita_agendada","visita_confirmada","visita_pendente","visita_remarcada","agendado",
        // Visitou e pós-visita
        "visitou","proposta","convertido","proposta_aceita",
        "aguardando_documento",
        "envio_documentos","envio_doc",
        "cpf_em_analise","cpf_analisado","analise_credito",
        "aguardando_aprovacao","credito_aprovado","aprovacao_credito",
        "contrato_preparado","contrato_gerado",
        "contrato_assinado","chaves_entregues",
        "boleto_pago",
        // Legado
        "visita","agendado"
      ])
      .order("nome", { ascending: true });
    setLeads((data ?? []) as Lead[]);
  }, [user]);

  // Classifica leads do checkup
  function checkupStatus(lead: Lead): "completo" | "andamento" | "sem_visita" {
    const obs = lead.observacoes ?? "";
    const hasCheckup = obs.includes("[CHECK-UP");
    if (hasCheckup) return "completo";
    // Visitou ou pós-visita = pendente urgente
    if ([
      "visitou","proposta","convertido","proposta_aceita",
      "aguardando_documento",
      "envio_documentos","envio_doc",
      "cpf_em_analise","cpf_analisado","analise_credito",
      "aguardando_aprovacao","credito_aprovado","aprovacao_credito",
      "contrato_preparado","contrato_gerado",
      "contrato_assinado","chaves_entregues",
      "boleto_pago"
    ].includes(lead.status)) return "andamento";
    // Visita agendada/confirmada/pendente = ainda não foi
    return "sem_visita";
  }

  useEffect(() => { loadLeads(); }, [loadLeads]);

  // Auto-seleciona lead via URL param
  useEffect(() => {
    const leadId = searchParams.get("lead");
    if (leadId && leads.length > 0) {
      const found = leads.find(l => l.id === leadId);
      if (found) selectLead(found);
    }
  }, [searchParams, leads]);

  function selectLead(lead: Lead) {
    setSelectedLead(lead);
    setScores(loadCheckup(lead.id));
    setPowerNotes(loadPowerNotes(lead.id));
    loadHistory(lead.id);
  }

  async function loadHistory(leadId: string) {
    const { data } = await supabase
      .from("calls")
      .select("id,outcome,outcome_label,observacao,started_at,duracao_segundos")
      .eq("lead_id", leadId)
      .order("started_at", { ascending: false });
    setHistory(data ?? []);
  }

  // Extrai histórico de check-ups das observações do lead selecionado
  function getCheckupHistory(obs: string | null): { data: string; nota: number; resumo: string }[] {
    if (!obs) return [];
    return obs.split("\n")
      .map(l => {
        const m = l.match(/\[CHECK-UP ([^\]]+)\] Nota: ([\d.]+)\/10 — (.+)/);
        return m ? { data: m[1], nota: parseFloat(m[2]), resumo: m[3] } : null;
      })
      .filter(Boolean) as { data: string; nota: number; resumo: string }[];
  }

  function setScore(itemId: number, value: number) {
    const next = { ...scores, [itemId]: value };
    setScores(next);
    if (selectedLead) saveCheckupLocal(selectedLead.id, next);
  }

  function resetScore(itemId: number) {
    const next = { ...scores };
    delete next[itemId];
    setScores(next);
    if (selectedLead) saveCheckupLocal(selectedLead.id, next);
  }

  function resetAllScores() {
    setScores({});
    if (selectedLead) saveCheckupLocal(selectedLead.id, {});
    toast.success("Check-up resetado");
  }

  function setPowerNote(key: string, value: string) {
    const next = { ...powerNotes, [key]: value };
    setPowerNotes(next);
    if (selectedLead) savePowerNotes(selectedLead.id, next);
  }

  // Calcula nota por categoria
  function categoryScore(cat: CheckupCategory): number {
    let got = 0;
    let max = 0;
    cat.items.forEach(item => {
      max += item.pts;
      got += scores[item.id] ?? 0;
    });
    // Normaliza para 0-10
    return max > 0 ? Math.round((got / max) * 10 * 10) / 10 : 0;
  }

  // Nota geral = média das categorias
  const categoryScores = CHECKUP_CATEGORIES.map(c => categoryScore(c));
  const notaGeral = categoryScores.length > 0
    ? Math.round(categoryScores.reduce((a, b) => a + b, 0) / categoryScores.length * 10) / 10
    : 0;

  // Total de itens preenchidos
  const totalItems = CHECKUP_CATEGORIES.flatMap(c => c.items).length;
  const filledItems = Object.keys(scores).length;

  async function saveCheckup() {
    if (!selectedLead || !user) return;
    setSaving(true);

    const summary = CHECKUP_CATEGORIES.map((c, i) =>
      `${c.letter}(${c.label.split(" ")[0]}): ${categoryScores[i]}/10`
    ).join(" | ");

    const checkupNote = `[CHECK-UP ${new Date().toLocaleDateString("pt-BR")}] Nota: ${notaGeral}/10 — ${summary}`;

    // Garante que não duplica check-ups do mesmo dia removendo o anterior se existir
    const obsAtual = selectedLead.observacoes ?? "";
    const hoje = new Date().toLocaleDateString("pt-BR");
    const linhasSemHoje = obsAtual
      .split("\n")
      .filter(l => !l.startsWith(`[CHECK-UP ${hoje}]`))
      .join("\n")
      .trim();

    const novaObs = linhasSemHoje
      ? `${linhasSemHoje}\n${checkupNote}`.slice(0, 500)
      : checkupNote;

    const { error } = await supabase.from("leads").update({
      observacoes: novaObs,
    }).eq("id", selectedLead.id);

    setSaving(false);
    if (error) { toast.error(error.message); return; }

    // Atualiza local também
    setSelectedLead(prev => prev ? { ...prev, observacoes: novaObs } : prev);
    toast.success(`Check-up salvo! Nota: ${notaGeral}/10 ✅`);
    loadLeads();
  }

  const filteredLeads = leads.filter(l =>
    l.nome.toLowerCase().includes(search.toLowerCase()) ||
    l.telefone.includes(search)
  );

  const result = getResultLabel(notaGeral);

  const STATUS_BADGE: Record<string, string> = {
    convertido: "bg-purple-100 text-purple-700",
    visita:     "bg-blue-100 text-blue-700",
    agendado:   "bg-green-100 text-green-700",
    proposta:   "bg-amber-100 text-amber-700",
  };
  const STATUS_LABEL: Record<string, string> = {
    convertido: "Realizada",
    visita:     "Agendada",
    agendado:   "Confirmada",
    proposta:   "Proposta",
  };

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
        <div>
          <h1 className="font-display font-bold text-3xl flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-md">
              <Award className="h-5 w-5 text-white" />
            </div>
            Check-up ACELERA
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Avalie seu atendimento presencial e evolua continuamente
          </p>
        </div>
        <Button variant="outline" onClick={() => navigate("/onboard-visita")}>
          <BookOpen className="h-4 w-4 mr-2" /> Onboard de Visita
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-6">

        {/* ── Painel esquerdo: seleção de lead ─────────────────────────── */}
        <div className="space-y-4">
          <Card className="shadow-card">
            <CardContent className="p-4">
              <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground" />
                Selecionar cliente
              </h3>
              <div className="relative mb-3">
                <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Buscar por nome…"
                  className="pl-8 h-8 text-sm"
                />
              </div>
              {/* 3 Boxes por status */}
              {(() => {
                const completos = filteredLeads.filter(l => checkupStatus(l) === "completo");
                const andamento = filteredLeads.filter(l => checkupStatus(l) === "andamento");
                const semVisita = filteredLeads.filter(l => checkupStatus(l) === "sem_visita");

                const BOXES = [
                  {
                    key: "andamento",
                    emoji: "🔴",
                    label: "Pendente",
                    sub: "Visitou — sem check-up",
                    list: andamento,
                    headerBg: "bg-rose-50 border-rose-200",
                    headerText: "text-rose-700",
                    countBg: "bg-rose-100 text-rose-700",
                    dotColor: "bg-rose-400",
                  },
                  {
                    key: "sem_visita",
                    emoji: "📅",
                    label: "Agendado",
                    sub: "Visita marcada",
                    list: semVisita,
                    headerBg: "bg-blue-50 border-blue-200",
                    headerText: "text-blue-700",
                    countBg: "bg-blue-100 text-blue-700",
                    dotColor: "bg-blue-400",
                  },
                  {
                    key: "completo",
                    emoji: "✅",
                    label: "Completo",
                    sub: "Check-up realizado",
                    list: completos,
                    headerBg: "bg-emerald-50 border-emerald-200",
                    headerText: "text-emerald-700",
                    countBg: "bg-emerald-100 text-emerald-700",
                    dotColor: "bg-emerald-400",
                  },
                ];

                return (
                  <div className="space-y-3">
                    {filteredLeads.length === 0 && (
                      <p className="text-xs text-muted-foreground text-center py-4">Nenhum lead encontrado</p>
                    )}
                    {BOXES.map(box => (
                      <div key={box.key} className={`rounded-xl border overflow-hidden ${box.headerBg}`}>
                        {/* Header da box — fixo */}
                        <div className={`flex items-center gap-2 px-3 py-2 border-b ${box.headerBg} sticky top-0 z-10`}>
                          <span className="text-base leading-none">{box.emoji}</span>
                          <div className="flex-1 min-w-0">
                            <div className={`text-xs font-bold ${box.headerText}`}>{box.label}</div>
                            <div className="text-[10px] text-muted-foreground">{box.sub}</div>
                          </div>
                          <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${box.countBg}`}>
                            {box.list.length}
                          </span>
                        </div>

                        {/* Lista de leads — scroll independente por box */}
                        {box.list.length === 0 ? (
                          <div className="px-3 py-3 bg-white/60 text-center text-[11px] text-muted-foreground">
                            Nenhum lead
                          </div>
                        ) : (
                          <div className="bg-white/60 divide-y divide-border/50 overflow-y-auto max-h-[160px]">
                            {box.list.map(l => (
                              <button key={l.id} onClick={() => selectLead(l)}
                                className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-muted/40 ${
                                  selectedLead?.id === l.id ? "bg-primary/10" : ""
                                }`}>
                                <div className={`h-2 w-2 rounded-full shrink-0 ${box.dotColor}`} />
                                <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center shrink-0 text-xs font-bold">
                                  {l.nome[0]}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="text-xs font-semibold truncate">{l.nome}</div>
                                  <div className="text-[10px] text-muted-foreground">{formatPhone(l.telefone)}</div>
                                </div>
                                {selectedLead?.id === l.id && (
                                  <ChevronRight className="h-3.5 w-3.5 text-primary shrink-0" />
                                )}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                );
              })()}
            </CardContent>
          </Card>

          {/* Score resumo se lead selecionado */}
          {selectedLead && (
            <Card className="shadow-card">
              <CardContent className="p-4">
                <div className="text-center mb-4">
                  <div className={`text-4xl font-display font-bold ${result.color}`}>{notaGeral}</div>
                  <div className={`text-sm font-semibold ${result.color}`}>{result.label}</div>
                  <div className="text-xs text-muted-foreground mt-1">{filledItems}/{totalItems} itens avaliados</div>
                </div>
                <div className="space-y-2">
                  {CHECKUP_CATEGORIES.map((cat, i) => {
                    const score = categoryScores[i];
                    const pct = (score / 10) * 100;
                    return (
                      <div key={cat.key}>
                        <div className="flex justify-between text-[10px] mb-0.5">
                          <span className={`font-medium ${cat.color}`}>{cat.letter} — {cat.label.split(" ")[0]}</span>
                          <span className="text-muted-foreground">{score}/10</span>
                        </div>
                        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              score >= 8 ? "bg-emerald-500" :
                              score >= 6 ? "bg-blue-500" :
                              score >= 4 ? "bg-amber-500" : "bg-rose-500"
                            }`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <Button
                  onClick={saveCheckup}
                  disabled={saving || filledItems === 0}
                  className="w-full mt-4 h-9 text-sm"
                >
                  <Save className="h-3.5 w-3.5 mr-2" />
                  {saving ? "Salvando…" : "Salvar Check-up"}
                </Button>
              </CardContent>
            </Card>
          )}
        </div>

        {/* ── Painel direito: formulário ────────────────────────────────── */}
        <div>
          {!selectedLead ? (
            <Card className="shadow-card">
              <CardContent className="py-24 text-center">
                <Award className="h-16 w-16 mx-auto mb-4 text-muted-foreground/20" />
                <p className="text-muted-foreground font-medium">Selecione um cliente para iniciar o check-up</p>
                <p className="text-muted-foreground/60 text-sm mt-1">
                  Avalie seu atendimento presencial após cada visita
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {/* Lead header */}
              <Card className="shadow-card">
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="h-12 w-12 rounded-full bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center text-lg font-bold text-primary">
                    {selectedLead.nome[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h2 className="font-display font-bold text-lg">{selectedLead.nome}</h2>
                    <div className="flex items-center gap-3 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Phone className="h-3 w-3" /> {formatPhone(selectedLead.telefone)}
                      </span>
                      {selectedLead.proximo_followup && (
                        <span className="flex items-center gap-1">
                          <CalendarDays className="h-3 w-3" />
                          {new Date(selectedLead.proximo_followup).toLocaleDateString("pt-BR")}
                        </span>
                      )}
                    </div>
                    {selectedLead.observacoes && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{selectedLead.observacoes}</p>
                    )}
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_BADGE[selectedLead.status] ?? "bg-muted text-muted-foreground"}`}>
                    {STATUS_LABEL[selectedLead.status] ?? selectedLead.status}
                  </span>
                </CardContent>
              </Card>

              {/* Tabs */}
              <div className="flex rounded-xl overflow-hidden border shadow-sm">
                {[
                  { key: "checkup",   label: "Check-up ACELERA", icon: <Target className="h-3.5 w-3.5" /> },
                  { key: "power",     label: "Perguntas Power",  icon: <Star className="h-3.5 w-3.5" />   },
                  { key: "evolucao",  label: "Evolução",         icon: <TrendingUp className="h-3.5 w-3.5" /> },
                  { key: "historico", label: "Histórico",        icon: <BarChart3 className="h-3.5 w-3.5" /> },
                ].map(tab => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key as any)}
                    className={`flex-1 py-2.5 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                      activeTab === tab.key
                        ? "bg-primary text-primary-foreground"
                        : "bg-card text-muted-foreground hover:bg-muted/50"
                    }`}
                  >
                    {tab.icon} {tab.label}
                  </button>
                ))}
              </div>

              {/* ── Tab: Check-up ACELERA ──────────────────────────────── */}
              {activeTab === "checkup" && (
                <div className="space-y-4">
                  {CHECKUP_CATEGORIES.map(cat => (
                    <Card key={cat.key} className={`shadow-card border ${cat.bg}`}>
                      <CardContent className="p-5">
                        <div className="flex items-center gap-3 mb-4">
                          <div className={`h-8 w-8 rounded-lg flex items-center justify-center font-display font-bold text-sm ${cat.bg} ${cat.color} border ${cat.bg.replace("bg-", "border-")}`}>
                            {cat.letter}
                          </div>
                          <div>
                            <h3 className={`font-display font-bold text-sm ${cat.color}`}>{cat.label}</h3>
                            <p className="text-[10px] text-muted-foreground">Nota da letra: {categoryScore(cat)}/10</p>
                          </div>
                          <div className="ml-auto flex items-center gap-3">
                            <div className={`text-2xl font-display font-bold ${cat.color}`}>{categoryScore(cat)}</div>
                            <button
                              onClick={() => {
                                const next = { ...scores };
                                cat.items.forEach(i => delete next[i.id]);
                                setScores(next);
                                if (selectedLead) saveCheckupLocal(selectedLead.id, next);
                              }}
                              title="Resetar esta categoria"
                              className="text-[10px] text-muted-foreground hover:text-rose-500 transition-colors px-1.5 py-0.5 rounded border border-muted hover:border-rose-300"
                            >
                              Resetar
                            </button>
                          </div>
                        </div>
                        <div className="space-y-4">
                          {cat.items.map(item => {
                            const currentScore = scores[item.id] ?? -1;
                            return (
                              <div key={item.id} className="flex items-start gap-3">
                                <span className="text-[10px] font-bold text-muted-foreground w-5 shrink-0 mt-1">{item.id}</span>
                                <div className="flex-1">
                                  <p className="text-xs text-foreground leading-relaxed mb-2">{item.desc}</p>
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="text-[10px] text-muted-foreground mr-1">({item.pts} pts)</span>
                                    {[
                                      { label: "Não", value: 0,                color: "bg-rose-100 text-rose-700 border-rose-300"   },
                                      { label: "Parcial", value: item.pts*0.5, color: "bg-amber-100 text-amber-700 border-amber-300" },
                                      { label: "Sim", value: item.pts,         color: "bg-emerald-100 text-emerald-700 border-emerald-300" },
                                    ].map(opt => (
                                      <button
                                        key={opt.label}
                                        onClick={() => setScore(item.id, opt.value)}
                                        className={`px-2.5 py-1 text-[10px] font-semibold rounded-full border transition-all ${
                                          Math.abs(currentScore - opt.value) < 0.01
                                            ? opt.color + " ring-2 ring-offset-1 ring-current"
                                            : "bg-muted/50 text-muted-foreground border-muted hover:border-foreground/30"
                                        }`}
                                      >
                                        {opt.label}
                                      </button>
                                    ))}
                                    {currentScore >= 0 && (
                                      <button
                                        onClick={() => resetScore(item.id)}
                                        title="Limpar resposta"
                                        className="ml-1 text-[10px] text-muted-foreground hover:text-rose-500 transition-colors"
                                      >
                                        ✕
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </CardContent>
                    </Card>
                  ))}

                  {/* Resultado final */}
                  <Card className="shadow-card bg-gradient-to-r from-slate-50 to-slate-100 border-slate-200">
                    <CardContent className="p-6">
                      <h3 className="font-display font-bold text-base mb-4 text-center">Quadro de Resultados</h3>
                      <div className="grid grid-cols-3 gap-3 mb-6">
                        {CHECKUP_CATEGORIES.map((cat, i) => (
                          <div key={cat.key} className={`p-3 rounded-lg border text-center ${cat.bg}`}>
                            <div className={`text-xs font-semibold ${cat.color} mb-1`}>{cat.letter}</div>
                            <div className={`text-xl font-display font-bold ${cat.color}`}>{categoryScores[i]}</div>
                            <div className="text-[9px] text-muted-foreground">{cat.label.split(" ")[0]}</div>
                          </div>
                        ))}
                      </div>
                      <div className="text-center border-t pt-4">
                        <div className={`text-5xl font-display font-bold ${result.color}`}>{notaGeral}</div>
                        <div className={`text-lg font-bold ${result.color} mt-1`}>{result.label}</div>
                        <div className="grid grid-cols-3 gap-2 mt-4 text-[10px]">
                          {[["Excelente","10"],["Ótimo","8–9,9"],["Bom","6–7,9"],["Regular","4–5,9"],["Fraco","2–3,9"],["Péssimo","0–1,9"]].map(([l,v]) => (
                            <div key={l} className="flex justify-between px-2 py-1 bg-muted/40 rounded">
                              <span className="text-muted-foreground">{l}</span>
                              <span className="font-semibold">{v}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="flex gap-2 mt-4">
                        <button
                          onClick={resetAllScores}
                          className="px-4 py-2 text-xs font-medium rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50 transition-colors"
                        >
                          Resetar tudo
                        </button>
                        <Button
                          onClick={saveCheckup}
                          disabled={saving || filledItems === 0}
                          className="flex-1"
                        >
                          <Save className="h-4 w-4 mr-2" />
                          {saving ? "Salvando…" : `Salvar Check-up (${notaGeral}/10)`}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* ── Tab: Perguntas Power ──────────────────────────────────── */}
              {activeTab === "power" && (
                <div className="space-y-4">
                  <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-800">
                    <p className="font-semibold mb-1">💡 Ferramenta Power — Conheça seu Cliente</p>
                    <p className="text-xs">Use estas perguntas durante a visita para entender melhor o perfil do cliente. Anote as respostas para personalizar sua proposta.</p>
                  </div>
                  {POWER_QUESTIONS.map(section => (
                    <Card key={section.key} className={`shadow-card border ${section.bg}`}>
                      <CardContent className="p-5">
                        <h3 className={`font-display font-bold text-sm mb-4 ${section.color}`}>
                          {section.label}
                        </h3>
                        <div className="space-y-3">
                          {section.questions.map((q, idx) => (
                            <div key={idx} className="flex gap-3">
                              <span className={`text-[10px] font-bold shrink-0 mt-1 w-4 ${section.color}`}>{idx + 1}</span>
                              <div className="flex-1">
                                <p className="text-xs font-medium text-foreground mb-1">{q}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                        <div className="mt-4">
                          <label className={`text-[10px] font-semibold uppercase tracking-wider ${section.color} mb-1 block`}>
                            Respostas / anotações
                          </label>
                          <Textarea
                            value={powerNotes[section.key] ?? ""}
                            onChange={e => setPowerNote(section.key, e.target.value)}
                            placeholder="Anote o que o cliente respondeu…"
                            rows={3}
                            className="text-xs resize-none"
                          />
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}

              {/* ── Tab: Evolução do Check-up ────────────────────────────── */}
              {activeTab === "evolucao" && (() => {
                const checkupHist = getCheckupHistory(selectedLead.observacoes);
                const radarData = CHECKUP_CATEGORIES.map((cat, i) => ({
                  cat: cat.letter + " " + cat.label.split(" ")[0],
                  nota: categoryScores[i],
                  fullMark: 10,
                }));
                const lineData = checkupHist.map(h => ({ data: h.data, nota: h.nota }));

                return (
                  <div className="space-y-4">
                    {checkupHist.length === 0 && filledItems === 0 ? (
                      <Card className="shadow-card">
                        <CardContent className="py-16 text-center">
                          <TrendingUp className="h-12 w-12 mx-auto mb-4 text-muted-foreground/20" />
                          <p className="text-muted-foreground font-medium">Nenhuma avaliação salva ainda</p>
                          <p className="text-muted-foreground/60 text-sm mt-1">Preencha o check-up e salve para ver a evolução</p>
                        </CardContent>
                      </Card>
                    ) : (
                      <>
                        {/* Radar do check-up atual */}
                        <Card className="shadow-card">
                          <CardContent className="p-5">
                            <h3 className="font-display font-semibold text-sm mb-1">Perfil atual por categoria</h3>
                            <p className="text-xs text-muted-foreground mb-4">Nota de cada letra do ACELERA</p>
                            <div className="h-56">
                              <ResponsiveContainer>
                                <RadarChart data={radarData}>
                                  <PolarGrid stroke="hsl(var(--border))" />
                                  <PolarAngleAxis dataKey="cat" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                                  <Radar dataKey="nota" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.25} strokeWidth={2} />
                                  <Tooltip formatter={(v: any) => [`${v}/10`, "Nota"]} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                                </RadarChart>
                              </ResponsiveContainer>
                            </div>
                          </CardContent>
                        </Card>

                        {/* Pontos mais fracos */}
                        <Card className="shadow-card">
                          <CardContent className="p-5">
                            <h3 className="font-display font-semibold text-sm mb-3">Pontos de atenção</h3>
                            <div className="space-y-2">
                              {CHECKUP_CATEGORIES
                                .map((cat, i) => ({ cat, score: categoryScores[i] }))
                                .sort((a, b) => a.score - b.score)
                                .slice(0, 3)
                                .map(({ cat, score }) => (
                                  <div key={cat.key} className={`flex items-center gap-3 p-2.5 rounded-lg border ${score < 6 ? "bg-rose-50 border-rose-200" : score < 8 ? "bg-amber-50 border-amber-200" : "bg-emerald-50 border-emerald-200"}`}>
                                    <div className={`h-7 w-7 rounded-lg flex items-center justify-center font-display font-bold text-xs ${cat.bg} ${cat.color}`}>
                                      {cat.letter}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-xs font-semibold">{cat.label}</p>
                                      <div className="h-1.5 bg-muted rounded-full overflow-hidden mt-1">
                                        <div className={`h-full rounded-full ${score < 6 ? "bg-rose-500" : score < 8 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${(score/10)*100}%` }} />
                                      </div>
                                    </div>
                                    <span className={`text-sm font-bold tabular-nums ${score < 6 ? "text-rose-600" : score < 8 ? "text-amber-600" : "text-emerald-600"}`}>{score}</span>
                                  </div>
                                ))
                              }
                            </div>
                          </CardContent>
                        </Card>

                        {/* Linha de evolução */}
                        {lineData.length > 1 && (
                          <Card className="shadow-card">
                            <CardContent className="p-5">
                              <h3 className="font-display font-semibold text-sm mb-1">Evolução da nota</h3>
                              <p className="text-xs text-muted-foreground mb-4">{lineData.length} avaliações registradas</p>
                              <div className="h-48">
                                <ResponsiveContainer>
                                  <LineChart data={lineData}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                                    <XAxis dataKey="data" fontSize={10} stroke="hsl(var(--muted-foreground))" />
                                    <YAxis domain={[0, 10]} fontSize={10} stroke="hsl(var(--muted-foreground))" />
                                    <Tooltip formatter={(v: any) => [`${v}/10`, "Nota"]} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                                    <Line type="monotone" dataKey="nota" stroke="#8b5cf6" strokeWidth={2.5} dot={{ fill: "#8b5cf6", r: 5 }} activeDot={{ r: 7 }} />
                                  </LineChart>
                                </ResponsiveContainer>
                              </div>
                              {/* Comparativo primeira vs última */}
                              {lineData.length >= 2 && (
                                <div className="mt-3 flex items-center gap-3 p-3 rounded-lg bg-muted/40">
                                  <div className="text-center flex-1">
                                    <p className="text-[10px] text-muted-foreground">Primeira</p>
                                    <p className="text-lg font-bold text-foreground">{lineData[0].nota}/10</p>
                                    <p className="text-[10px] text-muted-foreground">{lineData[0].data}</p>
                                  </div>
                                  <div className="text-center">
                                    {(() => {
                                      const diff = lineData[lineData.length-1].nota - lineData[0].nota;
                                      return (
                                        <span className={`text-xl font-bold ${diff > 0 ? "text-emerald-600" : diff < 0 ? "text-rose-600" : "text-muted-foreground"}`}>
                                          {diff > 0 ? "▲" : diff < 0 ? "▼" : "="} {Math.abs(diff).toFixed(1)}
                                        </span>
                                      );
                                    })()}
                                  </div>
                                  <div className="text-center flex-1">
                                    <p className="text-[10px] text-muted-foreground">Última</p>
                                    <p className="text-lg font-bold text-foreground">{lineData[lineData.length-1].nota}/10</p>
                                    <p className="text-[10px] text-muted-foreground">{lineData[lineData.length-1].data}</p>
                                  </div>
                                </div>
                              )}
                            </CardContent>
                          </Card>
                        )}

                        {/* Histórico de avaliações */}
                        {checkupHist.length > 0 && (
                          <Card className="shadow-card">
                            <CardContent className="p-5">
                              <h3 className="font-display font-semibold text-sm mb-3">Avaliações salvas</h3>
                              <div className="space-y-2">
                                {[...checkupHist].reverse().map((h, i) => (
                                  <div key={i} className="flex items-center gap-3 py-2 border-b last:border-0">
                                    <div className={`text-lg font-display font-bold tabular-nums w-12 text-center ${h.nota >= 8 ? "text-emerald-600" : h.nota >= 6 ? "text-blue-600" : h.nota >= 4 ? "text-amber-600" : "text-rose-600"}`}>
                                      {h.nota}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-xs font-semibold">{h.data}</p>
                                      <p className="text-[10px] text-muted-foreground truncate">{h.resumo}</p>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </CardContent>
                          </Card>
                        )}
                      </>
                    )}
                  </div>
                );
              })()}

              {/* ── Tab: Histórico ────────────────────────────────────────── */}
              {activeTab === "historico" && (
                <div className="space-y-3">
                  {history.length === 0 ? (
                    <Card className="shadow-card">
                      <CardContent className="py-12 text-center">
                        <Clock className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
                        <p className="text-muted-foreground text-sm">Nenhum contato registrado ainda</p>
                      </CardContent>
                    </Card>
                  ) : history.map((call: any) => (
                    <Card key={call.id} className="shadow-card">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="flex items-center gap-2">
                            <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="text-xs font-semibold">
                              {call.outcome_label ?? call.outcome}
                            </span>
                          </div>
                          <div className="text-right">
                            <div className="text-[10px] text-muted-foreground">
                              {new Date(call.started_at).toLocaleDateString("pt-BR", {
                                day: "2-digit", month: "2-digit", year: "2-digit"
                              })}
                              {" às "}
                              {new Date(call.started_at).toLocaleTimeString("pt-BR", {
                                hour: "2-digit", minute: "2-digit"
                              })}
                            </div>
                            <div className="text-[10px] text-muted-foreground">
                              {Math.floor(call.duracao_segundos / 60)}m{call.duracao_segundos % 60}s
                            </div>
                          </div>
                        </div>
                        {call.observacao && (
                          <p className="text-xs text-muted-foreground bg-muted/40 rounded px-2 py-1.5">
                            {call.observacao}
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                  {selectedLead.observacoes && (
                    <Card className="shadow-card border-amber-200 bg-amber-50">
                      <CardContent className="p-4">
                        <p className="text-[10px] uppercase tracking-wider text-amber-700 font-semibold mb-2">Observações do lead</p>
                        <p className="text-xs text-amber-900 whitespace-pre-wrap">{selectedLead.observacoes}</p>
                      </CardContent>
                    </Card>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}