// ══════════════════════════════════════════════════════════════════════════════
// CRM Renata Perfumes — fonte única de verdade para status, labels, cores e
// lógica do funil de vendas + motor de recorrência de recompra.
// Importe daqui em TODOS os arquivos. Nunca duplique constantes em páginas.
// ══════════════════════════════════════════════════════════════════════════════
//
// FUNIL A→N (fluxo positivo — cliente perfeito):
//   A  Sem contato       novo | nao_atendeu
//   B  Atendeu           retornar | respondeu | mensagem_zap
//   C  Interesse         interesse
//   D  Quer comprar      pedido_pendente
//   E  Pedido fechado    pedido_confirmado | pedido_aguard_pagamento
//                        + variantes: pedido_desistiu | pedido_cancelado | pedido_remarcado
//   F  Pagamento OK      pagamento_confirmado
//   G  Em separação      em_separacao
//   H  Enviado           enviado
//   I  Em transporte     em_transporte
//   J  Saiu p/ entrega   saiu_entrega
//   K  Entregue          entregue
//   L  Pós-venda         pos_venda
//   M  Aguard. recompra  aguardando_recompra   (gerado automaticamente pelo motor de recorrência)
//   N  Recomprou         recomprou 🏆
//
// VARIANTES DE PEDIDO (etapa E — ainda no funil, precisam de ação):
//   pedido_desistiu  = desistiu antes de pagar → tentar reverter
//   pedido_cancelado = cancelou o pedido       → remarcar ou desistir
//   pedido_remarcado = decidiu comprar depois  → volta ao fluxo confirmado
//
// PERDIDOS (saem do funil):
//   sem_interesse | nao_quer_mais | perdido | ignorado |
//   numero_errado | numero_bloqueado | achou_caro | comprou_concorrente

// ── Tipos ─────────────────────────────────────────────────────────────────────
export type FunnelStageKey = "A"|"B"|"C"|"D"|"E"|"F"|"G"|"H"|"I"|"J"|"K"|"L"|"M"|"N";

export interface FunnelStage {
  key: FunnelStageKey;
  label: string;
  desc: string;
  color: string;
  light: string;
  emoji: string;
  statuses: string[];
}

export interface OutcomeOption {
  outcome: string;
  label: string;
  type: "positive" | "neutral" | "negative";
}

// ── Definição das etapas do funil ─────────────────────────────────────────────
export const FUNNEL_STAGES: FunnelStage[] = [
  { key:"A", label:"Sem contato",      desc:"Nunca atendeu",           color:"#94a3b8", light:"#f1f5f9", emoji:"📵",
    statuses:["novo","nao_atendeu"] },
  { key:"B", label:"Atendeu",          desc:"Falou com alguém",        color:"#f97316", light:"#fff7ed", emoji:"📞",
    statuses:["retornar","respondeu","mensagem_zap"] },
  { key:"C", label:"Interesse",        desc:"Quer mas não fechou",     color:"#0ea5e9", light:"#f0f9ff", emoji:"💬",
    // C existe só se o cliente demonstrou interesse mas AINDA não quer fechar pedido
    // Quem vai direto para D (quer comprar) já implica C — não precisa passar por C
    statuses:["interesse"] },
  { key:"D", label:"Quer comprar",     desc:"Sem pedido fechado",      color:"#f59e0b", light:"#fffbeb", emoji:"🎯",
    statuses:["pedido_pendente"] },
  { key:"E", label:"Pedido fechado",   desc:"Aguardando pagamento",    color:"#8b5cf6", light:"#f5f3ff", emoji:"🛒",
    statuses:["pedido_confirmado","pedido_aguard_pagamento","pedido_desistiu","pedido_cancelado","pedido_remarcado"] },
  { key:"F", label:"Pagamento OK",     desc:"Pagamento confirmado",    color:"#10b981", light:"#ecfdf5", emoji:"💳",
    statuses:["pagamento_confirmado"] },
  { key:"G", label:"Em separação",     desc:"Preparando o pedido",     color:"#6d28d9", light:"#f5f3ff", emoji:"📦",
    statuses:["em_separacao"] },
  { key:"H", label:"Enviado",          desc:"Postado / código gerado", color:"#2563eb", light:"#eff6ff", emoji:"🚚",
    statuses:["enviado"] },
  { key:"I", label:"Em transporte",    desc:"A caminho",               color:"#0891b2", light:"#ecfeff", emoji:"🛣️",
    statuses:["em_transporte"] },
  { key:"J", label:"Saiu p/ entrega",  desc:"Último trecho",           color:"#4338ca", light:"#eef2ff", emoji:"🏍️",
    statuses:["saiu_entrega"] },
  { key:"K", label:"Entregue",         desc:"Recebido pelo cliente",   color:"#1d4ed8", light:"#eff6ff", emoji:"✅",
    statuses:["entregue"] },
  { key:"L", label:"Pós-venda",        desc:"Feedback / satisfação",   color:"#0f766e", light:"#f0fdfa", emoji:"⭐",
    statuses:["pos_venda"] },
  { key:"M", label:"Aguard. recompra", desc:"Motor de recorrência",    color:"#0369a1", light:"#f0f9ff", emoji:"⏳",
    statuses:["aguardando_recompra"] },
  { key:"N", label:"Recomprou",        desc:"Cliente fiel!",           color:"#059669", light:"#ecfdf5", emoji:"🏆",
    statuses:["recomprou"] },
];

// ── Lookup rápido: status → letra do funil ────────────────────────────────────
export const FUNNEL_STAGE: Record<string, FunnelStageKey> = {};
for (const stage of FUNNEL_STAGES) {
  for (const s of stage.statuses) {
    FUNNEL_STAGE[s] = stage.key;
  }
}

// ── Status perdidos ───────────────────────────────────────────────────────────
export const LOST_STATUSES: string[] = [
  "sem_interesse","nao_quer_mais","perdido","ignorado",
  "numero_errado","numero_bloqueado","achou_caro","comprou_concorrente",
];

// ── Helpers de classificação ──────────────────────────────────────────────────
export function getFunnelStage(status: string): FunnelStageKey | null {
  return FUNNEL_STAGE[status] ?? null;
}

export function isLost(status: string): boolean {
  return LOST_STATUSES.includes(status);
}

export function isActive(status: string): boolean {
  return !!FUNNEL_STAGE[status] && !isLost(status);
}

// ── Helpers de pedido (substituem os antigos helpers de "visita") ────────────
export const PEDIDO_ACTIVE_STATUSES: string[] = [
  "pedido_pendente","pedido_confirmado","pedido_aguard_pagamento",
  "pedido_desistiu","pedido_cancelado","pedido_remarcado",
];
export const PEDIDO_DONE_STATUSES: string[] = ["pagamento_confirmado","em_separacao","enviado","em_transporte","saiu_entrega","entregue"];
export const PEDIDO_ALL_STATUSES: string[] = [...PEDIDO_ACTIVE_STATUSES, ...PEDIDO_DONE_STATUSES];

export function isPedidoConfirmado(status: string): boolean {
  return ["pedido_confirmado","pedido_remarcado"].includes(status);
}
export function isPedidoProblema(status: string): boolean {
  return ["pedido_desistiu","pedido_cancelado"].includes(status);
}
export function isPedidoEntregue(status: string): boolean {
  return status === "entregue" || status === "pos_venda";
}

// ── Labels de status do cliente ───────────────────────────────────────────────
export const STATUS_LABELS: Record<string, string> = {
  novo:"Novo", nao_atendeu:"Não atendeu",
  retornar:"Atendeu — retornar", respondeu:"Atendeu — respondeu", mensagem_zap:"Atendeu — Zap",
  interesse:"Interesse",
  pedido_pendente:"Quer comprar",
  pedido_confirmado:"Pedido fechado", pedido_aguard_pagamento:"Aguardando pagamento",
  pedido_desistiu:"Desistiu do pedido", pedido_cancelado:"Cancelou o pedido", pedido_remarcado:"Vai comprar depois",
  pagamento_confirmado:"Pagamento confirmado",
  em_separacao:"Em separação",
  enviado:"Enviado",
  em_transporte:"Em transporte",
  saiu_entrega:"Saiu para entrega",
  entregue:"Entregue",
  pos_venda:"Pós-venda",
  aguardando_recompra:"Aguardando recompra",
  recomprou:"Recomprou 🏆",
  sem_interesse:"Sem interesse", nao_quer_mais:"Não quer mais", perdido:"Perdido",
  ignorado:"Ignorado", numero_errado:"Número errado", numero_bloqueado:"Bloqueado",
  achou_caro:"Achou caro", comprou_concorrente:"Comprou de outra loja",
};

// ── Labels de desfecho de ligação ────────────────────────────────────────────
export const OUTCOME_LABELS: Record<string, string> = {
  nao_atendeu:"Não atendeu", retornar:"Retornar", respondeu:"Respondeu",
  mensagem_zap:"Mensagem Zap", interesse:"Demonstrou interesse",
  pedido_pendente:"Quer comprar", pedido_confirmado:"Pedido fechado",
  pedido_aguard_pagamento:"Aguardando pagamento", pedido_desistiu:"Desistiu",
  pedido_cancelado:"Cancelou pedido", pedido_remarcado:"Remarcou compra",
  pagamento_confirmado:"Pagamento confirmado", em_separacao:"Em separação",
  enviado:"Enviado", em_transporte:"Em transporte", saiu_entrega:"Saiu p/ entrega",
  entregue:"Entregue", pos_venda:"Pós-venda", aguardando_recompra:"Aguardando recompra",
  recomprou:"Recomprou 🏆",
  sem_interesse:"Sem interesse", numero_errado:"Número errado",
  numero_bloqueado:"Bloqueado", achou_caro:"Achou caro", comprou_concorrente:"Comprou de outra loja",
  nao_quer_mais:"Não quer mais", perdido:"Perdido", ignorado:"Ignorado",
  personalizado:"Personalizado",
};

// ── Cores de badge (Tailwind) ─────────────────────────────────────────────────
export const STATUS_COLOR: Record<string, string> = {
  novo:"bg-slate-100 text-slate-600", nao_atendeu:"bg-amber-100 text-amber-700",
  retornar:"bg-blue-100 text-blue-700", respondeu:"bg-sky-100 text-sky-700",
  mensagem_zap:"bg-green-100 text-green-700", interesse:"bg-cyan-100 text-cyan-700",
  pedido_pendente:"bg-orange-100 text-orange-700",
  pedido_confirmado:"bg-violet-100 text-violet-700",
  pedido_aguard_pagamento:"bg-amber-100 text-amber-700",
  pedido_desistiu:"bg-rose-100 text-rose-700",
  pedido_cancelado:"bg-rose-200 text-rose-800",
  pedido_remarcado:"bg-amber-100 text-amber-700",
  pagamento_confirmado:"bg-emerald-100 text-emerald-800",
  em_separacao:"bg-violet-100 text-violet-700",
  enviado:"bg-blue-100 text-blue-700",
  em_transporte:"bg-cyan-100 text-cyan-700",
  saiu_entrega:"bg-indigo-100 text-indigo-700",
  entregue:"bg-blue-200 text-blue-800",
  pos_venda:"bg-teal-100 text-teal-700",
  aguardando_recompra:"bg-sky-100 text-sky-700",
  recomprou:"bg-emerald-200 text-emerald-800",
  sem_interesse:"bg-gray-100 text-gray-600", nao_quer_mais:"bg-red-100 text-red-700",
  perdido:"bg-gray-100 text-gray-500", ignorado:"bg-gray-100 text-gray-500",
  numero_errado:"bg-red-100 text-red-600", numero_bloqueado:"bg-red-200 text-red-700",
  achou_caro:"bg-orange-100 text-orange-600", comprou_concorrente:"bg-red-100 text-red-600",
};

// ── Opções de desfecho por etapa — usado pelo Discador ───────────────────────
export const OUTCOMES_BY_STAGE: Record<FunnelStageKey, OutcomeOption[]> = {
  A: [
    { outcome:"retornar",             label:"Atendeu — retornar",   type:"positive" },
    { outcome:"respondeu",            label:"Atendeu — respondeu",  type:"positive" },
    { outcome:"mensagem_zap",         label:"Atendeu — Zap",        type:"positive" },
    { outcome:"nao_atendeu",          label:"Não atendeu",          type:"neutral"  },
    { outcome:"sem_interesse",        label:"Sem interesse",        type:"negative" },
    { outcome:"numero_errado",        label:"Número errado",        type:"negative" },
    { outcome:"numero_bloqueado",     label:"Número bloqueado",     type:"negative" },
  ],
  B: [
    { outcome:"pedido_confirmado",    label:"Fechou pedido!",       type:"positive" },
    { outcome:"pedido_pendente",      label:"Quer comprar",         type:"positive" },
    { outcome:"interesse",            label:"Interesse (sem fechar)",type:"positive" },
    { outcome:"retornar",             label:"Retornar",             type:"neutral"  },
    { outcome:"respondeu",            label:"Respondeu",            type:"neutral"  },
    { outcome:"mensagem_zap",         label:"Mensagem Zap",         type:"neutral"  },
    { outcome:"nao_atendeu",          label:"Não atendeu",          type:"neutral"  },
    { outcome:"sem_interesse",        label:"Sem interesse",        type:"negative" },
    { outcome:"nao_quer_mais",        label:"Não quer mais",        type:"negative" },
    { outcome:"achou_caro",           label:"Achou caro",           type:"negative" },
    { outcome:"comprou_concorrente",  label:"Comprou de outra loja",type:"negative" },
    { outcome:"ignorado",             label:"Ignorado",             type:"negative" },
  ],
  C: [
    { outcome:"pedido_confirmado",    label:"Fechou pedido!",       type:"positive" },
    { outcome:"pedido_pendente",      label:"Quer comprar (sem fechar)",type:"positive" },
    { outcome:"retornar",             label:"Ainda pensando",       type:"neutral"  },
    { outcome:"mensagem_zap",         label:"Respondeu no Zap",     type:"neutral"  },
    { outcome:"nao_atendeu",          label:"Não atendeu",          type:"neutral"  },
    { outcome:"sem_interesse",        label:"Desistiu",             type:"negative" },
    { outcome:"achou_caro",           label:"Achou caro",           type:"negative" },
    { outcome:"perdido",              label:"Perdido",              type:"negative" },
  ],
  D: [
    { outcome:"pedido_confirmado",    label:"Fechou o pedido!",     type:"positive" },
    { outcome:"retornar",             label:"Vai decidir e retorna",type:"neutral"  },
    { outcome:"nao_atendeu",          label:"Não atendeu",          type:"neutral"  },
    { outcome:"sem_interesse",        label:"Desistiu",             type:"negative" },
    { outcome:"achou_caro",           label:"Achou caro",           type:"negative" },
    { outcome:"perdido",              label:"Perdido",              type:"negative" },
  ],
  E: [
    { outcome:"pagamento_confirmado", label:"Pagou!",               type:"positive" },
    { outcome:"pedido_aguard_pagamento",label:"Aguardando pagamento",type:"neutral" },
    { outcome:"pedido_remarcado",     label:"Vai comprar depois",   type:"neutral"  },
    { outcome:"pedido_desistiu",      label:"Desistiu (sem avisar)",type:"neutral"  },
    { outcome:"pedido_cancelado",     label:"Cancelou (avisou)",    type:"neutral"  },
    { outcome:"nao_atendeu",          label:"Não atendeu",          type:"neutral"  },
    { outcome:"sem_interesse",        label:"Desistiu definitivo",  type:"negative" },
    { outcome:"perdido",              label:"Perdido",              type:"negative" },
  ],
  F: [
    { outcome:"em_separacao",         label:"Pagamento OK → separação",type:"positive" },
    { outcome:"retornar",             label:"Aguardando confirmação",type:"neutral" },
    { outcome:"nao_atendeu",          label:"Não atendeu",          type:"neutral"  },
    { outcome:"sem_interesse",        label:"Sem interesse",        type:"negative" },
    { outcome:"perdido",              label:"Estorno / perdido",    type:"negative" },
  ],
  G: [
    { outcome:"enviado",              label:"Separado → enviado",   type:"positive" },
    { outcome:"retornar",             label:"Falta item no estoque",type:"neutral"  },
    { outcome:"nao_atendeu",          label:"Não atendeu",          type:"neutral"  },
    { outcome:"sem_interesse",        label:"Sem interesse",        type:"negative" },
    { outcome:"perdido",              label:"Perdido",              type:"negative" },
  ],
  H: [
    { outcome:"em_transporte",        label:"Código gerado — em transporte",type:"positive" },
    { outcome:"retornar",             label:"Aguardando transportadora",type:"neutral" },
    { outcome:"nao_atendeu",          label:"Não atendeu",          type:"neutral"  },
    { outcome:"sem_interesse",        label:"Sem interesse",        type:"negative" },
    { outcome:"perdido",              label:"Extraviado",           type:"negative" },
  ],
  I: [
    { outcome:"saiu_entrega",         label:"Saiu para entrega",    type:"positive" },
    { outcome:"retornar",             label:"Ainda a caminho",      type:"neutral"  },
    { outcome:"nao_atendeu",          label:"Não atendeu",          type:"neutral"  },
    { outcome:"sem_interesse",        label:"Sem interesse",        type:"negative" },
    { outcome:"perdido",              label:"Perdido",              type:"negative" },
  ],
  J: [
    { outcome:"entregue",             label:"Entregue!",            type:"positive" },
    { outcome:"retornar",             label:"Tentativa de entrega falhou",type:"neutral" },
    { outcome:"nao_atendeu",          label:"Não atendeu",          type:"neutral"  },
    { outcome:"sem_interesse",        label:"Sem interesse",        type:"negative" },
    { outcome:"perdido",              label:"Devolvido",            type:"negative" },
  ],
  K: [
    { outcome:"pos_venda",            label:"Confirmou recebimento",type:"positive" },
    { outcome:"retornar",             label:"Aguardando retorno",   type:"neutral"  },
    { outcome:"nao_atendeu",          label:"Não atendeu",          type:"neutral"  },
    { outcome:"sem_interesse",        label:"Sem interesse",        type:"negative" },
    { outcome:"perdido",              label:"Reclamação / troca",   type:"negative" },
  ],
  L: [
    { outcome:"aguardando_recompra",  label:"Feedback OK → aguardar recompra",type:"positive" },
    { outcome:"retornar",             label:"Aguardando avaliação", type:"neutral"  },
    { outcome:"nao_atendeu",          label:"Não atendeu",          type:"neutral"  },
    { outcome:"sem_interesse",        label:"Insatisfeito",         type:"negative" },
    { outcome:"perdido",              label:"Perdido",              type:"negative" },
  ],
  M: [
    { outcome:"pedido_confirmado",    label:"Recomprou — novo pedido!",type:"positive" },
    { outcome:"retornar",             label:"Ainda tem perfume",    type:"neutral"  },
    { outcome:"nao_atendeu",          label:"Não atendeu",          type:"neutral"  },
    { outcome:"sem_interesse",        label:"Não quer recomprar",   type:"negative" },
    { outcome:"comprou_concorrente",  label:"Comprou de outra loja",type:"negative" },
    { outcome:"perdido",              label:"Perdido",              type:"negative" },
  ],
  N: [
    { outcome:"pagamento_confirmado", label:"Recompra paga!",       type:"positive" },
    { outcome:"retornar",             label:"Fechando detalhes",    type:"neutral"  },
    { outcome:"sem_interesse",        label:"Sem interesse",        type:"negative" },
    { outcome:"perdido",              label:"Perdido",              type:"negative" },
  ],
};

// ── Sugestões de observação por etapa (dropdown no discador) ─────────────────
export const OBS_SUGGESTIONS: Record<FunnelStageKey, string[]> = {
  A: [
    "Caixa postal — tentar outro horário",
    "Tocou mas não atendeu",
    "Número ocupado",
    "Atendeu errado — confirmar número",
  ],
  B: [
    "Pediu para ligar à tarde",
    "Pediu para ligar amanhã",
    "Conversou brevemente — sem tempo agora",
    "Demonstrou curiosidade, sem compromisso",
    "Já usa outra marca",
    "Aguardando aprovação do cônjuge/orçamento",
  ],
  C: [
    "Gostou do perfume, vai pensar",
    "Quer comparar com outra fragrância",
    "Perguntou sobre parcelamento",
    "Perguntou sobre frete/prazo",
    "Quer amostra antes de decidir",
  ],
  D: [
    "Vai confirmar forma de pagamento",
    "Prefere fechar no fim de semana",
    "Aguardando cair salário",
    "Quer decidir entre dois frascos",
  ],
  E: [
    "Confirmou que vai pagar",
    "Pediu para remarcar — motivo pessoal",
    "Não atendeu — tentando confirmar",
    "Desistiu sem dar satisfação",
    "Cancelou — quer remarcar depois",
    "Cancelou — não tem mais interesse",
    "Remarcado para nova data",
  ],
  F: [
    "Pagamento via Pix confirmado",
    "Pagamento no cartão confirmado",
    "Aguardando compensação",
    "Comprovante recebido — conferindo",
  ],
  G: [
    "Pedido separado, conferindo itens",
    "Falta 1 item no estoque",
    "Embalando com brinde",
    "Aguardando etiqueta de envio",
  ],
  H: [
    "Código de rastreio enviado ao cliente",
    "Postado nos Correios",
    "Postado em transportadora",
  ],
  I: [
    "Rastreio atualizado — em rota",
    "Parado no centro de distribuição",
    "Previsão de entrega confirmada",
  ],
  J: [
    "Saiu para entrega hoje",
    "Tentativa de entrega sem sucesso",
  ],
  K: [
    "Cliente confirmou recebimento",
    "Recebeu e adorou",
    "Recebeu com avaria — tratando troca",
  ],
  L: [
    "Enviou feedback positivo",
    "Pediu indicação de outra fragrância",
    "Sem retorno ainda",
  ],
  M: [
    "Cliente ainda tem produto",
    "Lembrete de recompra enviado",
    "Perguntou por lançamentos",
  ],
  N: [
    "Recomprou o mesmo perfume",
    "Recomprou perfume diferente",
    "Aumentou o pedido (kit/combo)",
  ],
};

// ── Mapeamento outcome → novo status do cliente ────────────────────────────────
export const STATUS_FROM_OUTCOME: Record<string, string> = {
  // ── Neutros — registram a ligação mas NÃO mudam o status ────────────────
  nao_atendeu:              "__keep__",
  retornar:                 "retornar",
  respondeu:                "respondeu",
  mensagem_zap:              "mensagem_zap",
  personalizado:             "__keep__",

  // ── Positivos — só avançam o funil (nunca regridem) ─────────────────────
  interesse:                 "interesse",
  pedido_pendente:            "pedido_pendente",
  pedido_confirmado:          "pedido_confirmado",
  pedido_aguard_pagamento:    "pedido_aguard_pagamento",
  pedido_desistiu:            "pedido_desistiu",
  pedido_cancelado:           "pedido_cancelado",
  pedido_remarcado:           "pedido_remarcado",
  pagamento_confirmado:       "pagamento_confirmado",
  em_separacao:               "em_separacao",
  enviado:                    "enviado",
  em_transporte:              "em_transporte",
  saiu_entrega:                "saiu_entrega",
  entregue:                    "entregue",
  pos_venda:                   "pos_venda",
  aguardando_recompra:         "aguardando_recompra",
  recomprou:                   "recomprou",

  // ── Negativos — encerram o cliente ───────────────────────────────────────
  sem_interesse:              "sem_interesse",
  nao_quer_mais:               "nao_quer_mais",
  numero_errado:               "numero_errado",
  numero_bloqueado:            "numero_bloqueado",
  achou_caro:                  "achou_caro",
  comprou_concorrente:         "comprou_concorrente",
  perdido:                     "perdido",
  ignorado:                    "ignorado",
};

// ── Mapeamento planilha → status interno (enum lead_status real) ─────────────
export const SHEET_STATUS_MAP: Record<string, string> = {
  "novo": "novo",
  "não atendeu": "nao_atendeu", "nao atendeu": "nao_atendeu", "não atende": "nao_atendeu", "nao atende": "nao_atendeu",
  "retornar": "retornar", "ligação": "retornar", "ligacao": "retornar",
  "respondeu": "respondeu",
  "mensagem zap": "mensagem_zap", "msg zap": "mensagem_zap", "whatsapp": "mensagem_zap", "zap": "mensagem_zap",
  "interesse": "interesse",
  "negociação": "negociacao", "negociacao": "negociacao",
  "aguardando pagamento": "aguardando_pagamento", "aguardando pgto": "aguardando_pagamento",
  "pago": "pago", "pagamento confirmado": "pago",
  "entregue": "entregue",
  "pós-venda": "pos_venda", "pos venda": "pos_venda", "pos-venda": "pos_venda",
  "sem interesse": "sem_interesse",
  "número errado": "numero_errado", "numero errado": "numero_errado",
  "perdido": "perdido", "perdido?": "perdido",
};

export function normalizeSheetStatus(raw: string | null | undefined): string {
  if (!raw) return "novo";
  const key = raw.toString().trim().toLowerCase();
  if ((LEAD_STATUSES as string[]).includes(key)) return key;
  return SHEET_STATUS_MAP[key] ?? "novo";
}

// ── Formatadores ──────────────────────────────────────────────────────────────
export function formatPhone(p: string): string {
  const d = p.replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("0")) return `0 (${d.slice(1,3)}) ${d.slice(3,8)}-${d.slice(8)}`;
  if (d.length === 11 && d.startsWith("0")) return `0 (${d.slice(1,3)}) ${d.slice(3,7)}-${d.slice(7)}`;
  if (d.length === 11) return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`;
  return p;
}

export function formatDuration(s: number): string {
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

export function formatFollowup(iso: string | null | undefined): string {
  if (!iso) return "Sem data";
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR", { weekday:"short", day:"2-digit", month:"2-digit" })
    + " às "
    + d.toLocaleTimeString("pt-BR", { hour:"2-digit", minute:"2-digit" });
}

export function formatCurrency(v: number): string {
  return v.toLocaleString("pt-BR", { style:"currency", currency:"BRL" });
}

// ══════════════════════════════════════════════════════════════════════════════
// MOTOR DE RECORRÊNCIA
// Regra de negócio (v1, ajustável em Settings > Recorrência):
//   Cada produto tem uma "duração estimada em dias de uso" (duracao_dias).
//   O prazo de recompra de um pedido = soma ponderada das durações dos itens
//   comprados, multiplicada pela quantidade — ou seja, quanto maior a compra
//   (mais frascos, frascos maiores), mais tempo até a próxima recompra prevista.
//   Isso é intencionalmente simples no v1: dá pra trocar a fórmula depois sem
//   mexer no resto do sistema, porque tudo passa por calcularPrevisaoRecompra().
// ══════════════════════════════════════════════════════════════════════════════

export interface PedidoItemParaRecorrencia {
  quantidade: number;
  duracao_dias_por_unidade: number; // vem do cadastro do produto
}

/** Quantos dias até a recompra prevista, a partir dos itens de um pedido. */
export function calcularDiasAteRecompra(itens: PedidoItemParaRecorrencia[]): number {
  if (!itens.length) return 45; // fallback conservador se não houver itens cadastrados
  const dias = itens.reduce((soma, item) => soma + item.quantidade * item.duracao_dias_por_unidade, 0);
  return Math.max(15, Math.round(dias));
}

/** Data prevista de recompra a partir da data do pedido + itens comprados. */
export function calcularPrevisaoRecompra(dataPedidoISO: string, itens: PedidoItemParaRecorrencia[]): string {
  const dias = calcularDiasAteRecompra(itens);
  const d = new Date(dataPedidoISO);
  d.setDate(d.getDate() + dias);
  return d.toISOString();
}

export type RecorrenciaUrgencia = "em_dia" | "proxima" | "atrasada" | "critica";

/** Classifica a urgência de contato com base na data prevista de recompra. */
export function classificarUrgenciaRecompra(previsaoISO: string | null | undefined, hoje: Date = new Date()): RecorrenciaUrgencia {
  if (!previsaoISO) return "em_dia";
  const previsao = new Date(previsaoISO);
  const diffDias = Math.floor((previsao.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDias > 7) return "em_dia";
  if (diffDias >= 0) return "proxima";      // dentro de 7 dias — hora de esquentar contato
  if (diffDias >= -15) return "atrasada";   // já passou, até 15 dias de atraso
  return "critica";                          // mais de 15 dias sem recomprar — risco de perda
}

export const URGENCIA_LABEL: Record<RecorrenciaUrgencia, string> = {
  em_dia:  "Em dia",
  proxima: "Recompra próxima",
  atrasada:"Recompra atrasada",
  critica: "Risco de perda",
};

export const URGENCIA_COLOR: Record<RecorrenciaUrgencia, string> = {
  em_dia:  "bg-slate-100 text-slate-600",
  proxima: "bg-amber-100 text-amber-700",
  atrasada:"bg-orange-100 text-orange-700",
  critica: "bg-red-100 text-red-700",
};

// ══════════════════════════════════════════════════════════════════════════════
// STATUS REAL DO LEAD (enum public.lead_status no banco atual)
// Os mapas STATUS_LABELS/STATUS_COLOR/FUNNEL_STAGES acima são de um funil antigo
// (perfumes) que não bate mais com o enum do banco. Estes dois mapas abaixo são
// a fonte correta pro enum atual — usar em qualquer tela nova que trabalhe com
// leads.status diretamente.
// ══════════════════════════════════════════════════════════════════════════════
export type LeadStatus =
  | "novo" | "nao_atendeu" | "retornar" | "respondeu" | "mensagem_zap"
  | "interesse" | "negociacao"
  | "aguardando_pagamento" | "pago" | "entregue" | "pos_venda"
  | "sem_interesse" | "numero_errado" | "perdido";

export const LEAD_STATUSES: LeadStatus[] = [
  "novo", "nao_atendeu", "retornar", "respondeu", "mensagem_zap",
  "interesse", "negociacao",
  "aguardando_pagamento", "pago", "entregue", "pos_venda",
  "sem_interesse", "numero_errado", "perdido",
];

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  novo: "Novo",
  nao_atendeu: "Não atendeu",
  retornar: "Retornar",
  respondeu: "Respondeu",
  mensagem_zap: "Mensagem Zap",
  interesse: "Interesse",
  negociacao: "Negociação",
  aguardando_pagamento: "Aguardando pagamento",
  pago: "Pago",
  entregue: "Entregue",
  pos_venda: "Pós-venda",
  sem_interesse: "Sem interesse",
  numero_errado: "Número errado",
  perdido: "Perdido",
};

export const LEAD_STATUS_COLOR: Record<LeadStatus, string> = {
  novo: "bg-slate-100 text-slate-600",
  nao_atendeu: "bg-amber-100 text-amber-700",
  retornar: "bg-blue-100 text-blue-700",
  respondeu: "bg-sky-100 text-sky-700",
  mensagem_zap: "bg-green-100 text-green-700",
  interesse: "bg-cyan-100 text-cyan-700",
  negociacao: "bg-violet-100 text-violet-700",
  aguardando_pagamento: "bg-orange-100 text-orange-700",
  pago: "bg-emerald-100 text-emerald-800",
  entregue: "bg-blue-200 text-blue-800",
  pos_venda: "bg-teal-100 text-teal-700",
  sem_interesse: "bg-gray-100 text-gray-600",
  numero_errado: "bg-red-100 text-red-600",
  perdido: "bg-gray-100 text-gray-500",
};

export const LEAD_STATUS_LOST: LeadStatus[] = ["sem_interesse", "numero_errado", "perdido"];

// ── Colunas do Kanban / funil — agrupamento do enum real para exibição ───────
export interface LeadFunnelColumn {
  key: string;
  label: string;
  emoji: string;
  color: string;
  light: string;
  statuses: LeadStatus[];
}

export const LEAD_FUNNEL_COLUMNS: LeadFunnelColumn[] = [
  { key: "novo",       label: "Novo",                emoji: "📥", color: "#64748b", light: "#f1f5f9", statuses: ["novo"] },
  { key: "nao_atendeu",label: "Não atendeu",         emoji: "📵", color: "#f59e0b", light: "#fffbeb", statuses: ["nao_atendeu"] },
  { key: "atendeu",    label: "Atendeu",             emoji: "📞", color: "#0ea5e9", light: "#f0f9ff", statuses: ["retornar", "respondeu", "mensagem_zap"] },
  { key: "interesse",  label: "Interesse",           emoji: "💬", color: "#06b6d4", light: "#ecfeff", statuses: ["interesse"] },
  { key: "negociacao", label: "Negociação",          emoji: "🤝", color: "#8b5cf6", light: "#f5f3ff", statuses: ["negociacao"] },
  { key: "pagamento",  label: "Aguard. pagamento",   emoji: "⏳", color: "#f97316", light: "#fff7ed", statuses: ["aguardando_pagamento"] },
  { key: "pago",       label: "Pago",                emoji: "💳", color: "#10b981", light: "#ecfdf5", statuses: ["pago"] },
  { key: "entregue",   label: "Entregue",            emoji: "📦", color: "#2563eb", light: "#eff6ff", statuses: ["entregue"] },
  { key: "pos_venda",  label: "Pós-venda",           emoji: "⭐", color: "#0f766e", light: "#f0fdfa", statuses: ["pos_venda"] },
];

export const LEAD_FUNNEL_LOST_COLUMN: LeadFunnelColumn = {
  key: "perdido", label: "Perdidos", emoji: "❌", color: "#ef4444", light: "#fef2f2", statuses: LEAD_STATUS_LOST,
};

export function getLeadFunnelColumn(status: string): LeadFunnelColumn | undefined {
  if (LEAD_STATUS_LOST.includes(status as LeadStatus)) return LEAD_FUNNEL_LOST_COLUMN;
  return LEAD_FUNNEL_COLUMNS.find(c => c.statuses.includes(status as LeadStatus));
}

// ── Categorias de mensagem (enum public.mensagem_categoria) ──────────────────
export type MensagemCategoria = "recompra" | "novidade" | "desconto" | "promocao";

export const MENSAGEM_CATEGORIAS: MensagemCategoria[] = ["recompra", "novidade", "desconto", "promocao"];

export const MENSAGEM_CATEGORIA_LABELS: Record<MensagemCategoria, string> = {
  recompra: "Recompra",
  novidade: "Novidade",
  desconto: "Desconto",
  promocao: "Promoção",
};

export const MENSAGEM_CATEGORIA_COLOR: Record<MensagemCategoria, string> = {
  recompra: "bg-sky-100 text-sky-700 border-sky-200",
  novidade: "bg-violet-100 text-violet-700 border-violet-200",
  desconto: "bg-amber-100 text-amber-700 border-amber-200",
  promocao: "bg-rose-100 text-rose-700 border-rose-200",
};

export const MENSAGEM_CATEGORIA_EMOJI: Record<MensagemCategoria, string> = {
  recompra: "💎",
  novidade: "✨",
  desconto: "🏷️",
  promocao: "🔥",
};

// ── Status de contato de cada mensagem (enum public.mensagem_status_contato) ─
// "vista" e "sem_retorno" são sempre marcados manualmente pelo atendente —
// não há integração com a API oficial do WhatsApp para detectar isso.
export type MensagemStatusContato = "enviada" | "vista" | "respondida" | "sem_retorno";

export const MENSAGEM_STATUS_CONTATO_ORDER: MensagemStatusContato[] = ["enviada", "vista", "respondida", "sem_retorno"];

export const MENSAGEM_STATUS_CONTATO_LABELS: Record<MensagemStatusContato, string> = {
  enviada: "Enviada",
  vista: "Vista",
  respondida: "Respondida",
  sem_retorno: "Sem retorno",
};

export const MENSAGEM_STATUS_CONTATO_COLOR: Record<MensagemStatusContato, string> = {
  enviada: "bg-slate-100 text-slate-600",
  vista: "bg-blue-100 text-blue-700",
  respondida: "bg-emerald-100 text-emerald-700",
  sem_retorno: "bg-rose-100 text-rose-700",
};

export const MENSAGEM_STATUS_CONTATO_EMOJI: Record<MensagemStatusContato, string> = {
  enviada: "📤",
  vista: "👁️",
  respondida: "✅",
  sem_retorno: "🚫",
};

// ══════════════════════════════════════════════════════════════════════════════
// SEGMENTAÇÃO POR TICKET — calculada a partir do histórico de compras (tabela
// `compras`). As faixas de valor são configuráveis em Configurações
// (UserProfile.ticketAltoMin / ticketMedioMin).
// ══════════════════════════════════════════════════════════════════════════════
export type TicketTier = "alto" | "medio" | "baixo" | "sem_compras";

export const TICKET_TIER_LABELS: Record<TicketTier, string> = {
  alto: "Ticket alto",
  medio: "Ticket médio",
  baixo: "Ticket baixo",
  sem_compras: "Sem compras",
};

export const TICKET_TIER_COLOR: Record<TicketTier, string> = {
  alto: "bg-emerald-100 text-emerald-700",
  medio: "bg-amber-100 text-amber-700",
  baixo: "bg-slate-100 text-slate-600",
  sem_compras: "bg-muted text-muted-foreground",
};

export const TICKET_TIER_EMOJI: Record<TicketTier, string> = {
  alto: "💎",
  medio: "🏷️",
  baixo: "🪙",
  sem_compras: "—",
};

/** ticketMedio = valor médio por compra do lead (null se nunca comprou). */
export function classifyTicketTier(ticketMedio: number | null, thresholds: { ticketAltoMin: number; ticketMedioMin: number }): TicketTier {
  if (ticketMedio === null) return "sem_compras";
  if (ticketMedio >= thresholds.ticketAltoMin) return "alto";
  if (ticketMedio >= thresholds.ticketMedioMin) return "medio";
  return "baixo";
}

export type CompraResumo = { totalGasto: number; qtdCompras: number; ticketMedio: number | null; ultimaCompraEm: string | null };

export function summarizeCompras(compras: { valor: number; quantidade: number; data_compra: string }[]): CompraResumo {
  if (compras.length === 0) return { totalGasto: 0, qtdCompras: 0, ticketMedio: null, ultimaCompraEm: null };
  const totalGasto = compras.reduce((a, c) => a + c.valor, 0);
  const ultimaCompraEm = compras.reduce((max, c) => c.data_compra > max ? c.data_compra : max, compras[0].data_compra);
  return { totalGasto, qtdCompras: compras.length, ticketMedio: totalGasto / compras.length, ultimaCompraEm };
}

// ══════════════════════════════════════════════════════════════════════════════
// PEDIDOS — cabeçalho da venda (pagamento, entrega, vendedor). Os itens do
// pedido são linhas da tabela `compras` com `pedido_id` preenchido.
// ══════════════════════════════════════════════════════════════════════════════
export type PedidoStatusPagamento = "aguardando" | "pago" | "estornado";
export type PedidoStatusEntrega = "preparando" | "enviado" | "entregue";

export const PEDIDO_STATUS_PAGAMENTO_LABELS: Record<PedidoStatusPagamento, string> = {
  aguardando: "Aguardando pagamento",
  pago: "Pago",
  estornado: "Estornado",
};
export const PEDIDO_STATUS_PAGAMENTO_COLOR: Record<PedidoStatusPagamento, string> = {
  aguardando: "bg-amber-100 text-amber-700",
  pago: "bg-emerald-100 text-emerald-700",
  estornado: "bg-rose-100 text-rose-700",
};
export const PEDIDO_STATUS_PAGAMENTO_EMOJI: Record<PedidoStatusPagamento, string> = {
  aguardando: "⏳", pago: "✅", estornado: "↩️",
};
export const PEDIDO_STATUS_PAGAMENTO_ORDER: PedidoStatusPagamento[] = ["aguardando", "pago", "estornado"];

export const PEDIDO_STATUS_ENTREGA_LABELS: Record<PedidoStatusEntrega, string> = {
  preparando: "Preparando",
  enviado: "Enviado",
  entregue: "Entregue",
};
export const PEDIDO_STATUS_ENTREGA_COLOR: Record<PedidoStatusEntrega, string> = {
  preparando: "bg-slate-100 text-slate-600",
  enviado: "bg-blue-100 text-blue-700",
  entregue: "bg-emerald-100 text-emerald-700",
};
export const PEDIDO_STATUS_ENTREGA_EMOJI: Record<PedidoStatusEntrega, string> = {
  preparando: "📦", enviado: "🚚", entregue: "✅",
};
export const PEDIDO_STATUS_ENTREGA_ORDER: PedidoStatusEntrega[] = ["preparando", "enviado", "entregue"];

export const FORMAS_PAGAMENTO = ["Pix", "Cartão de crédito", "Cartão de débito", "Dinheiro", "Boleto"];

export type PedidoResumo = {
  subtotal: number; desconto: number; frete: number; total: number;
  custoTotal: number; margem: number; margemPct: number | null;
};

/** valor/custo de cada item já são o total da linha (não unitário). */
export function summarizePedido(
  itens: { valor: number; custo: number }[],
  pedido: { desconto: number; frete: number }
): PedidoResumo {
  const subtotal   = itens.reduce((a, i) => a + i.valor, 0);
  const custoTotal = itens.reduce((a, i) => a + (i.custo ?? 0), 0);
  const total  = subtotal - pedido.desconto + pedido.frete;
  const margem = subtotal - pedido.desconto - custoTotal;
  const margemPct = subtotal > 0 ? Math.round((margem / subtotal) * 100) : null;
  return { subtotal, desconto: pedido.desconto, frete: pedido.frete, total, custoTotal, margem, margemPct };
}

// ══════════════════════════════════════════════════════════════════════════════
// CALENDÁRIO — promoções, eventos e novidades planejados (tabela
// eventos_calendario), opcionalmente direcionados a uma lista ou a um
// segmento de ticket.
// ══════════════════════════════════════════════════════════════════════════════
export type EventoCalendarioTipo = "promocao" | "evento" | "novidade";

export const EVENTO_CALENDARIO_TIPOS: EventoCalendarioTipo[] = ["promocao", "evento", "novidade"];

export const EVENTO_CALENDARIO_LABELS: Record<EventoCalendarioTipo, string> = {
  promocao: "Promoção",
  evento: "Evento",
  novidade: "Novidade",
};

export const EVENTO_CALENDARIO_COLOR: Record<EventoCalendarioTipo, string> = {
  promocao: "bg-rose-100 text-rose-700 border-rose-200",
  evento: "bg-violet-100 text-violet-700 border-violet-200",
  novidade: "bg-sky-100 text-sky-700 border-sky-200",
};

export const EVENTO_CALENDARIO_EMOJI: Record<EventoCalendarioTipo, string> = {
  promocao: "🔥",
  evento: "🎉",
  novidade: "✨",
};

// ══════════════════════════════════════════════════════════════════════════════
// CLIENTE 360 — aniversário (leads.data_nascimento), tags livres (leads.tags)
// e recompra estimada calculada a partir do intervalo entre compras do próprio
// lead. Reaproveita classificarUrgenciaRecompra()/URGENCIA_LABEL/URGENCIA_COLOR
// (motor de recorrência acima) pra classificar a urgência da data prevista.
// ══════════════════════════════════════════════════════════════════════════════

export type RecompraEstimativa = {
  proximaDataEstimada: string | null; // ISO
  intervaloMedioDias: number | null;
};

/** Precisa de pelo menos 2 compras pra estimar um intervalo. */
export function estimateNextPurchase(compras: { data_compra: string }[]): RecompraEstimativa {
  if (compras.length < 2) return { proximaDataEstimada: null, intervaloMedioDias: null };
  const datas = compras.map(c => new Date(c.data_compra).getTime()).sort((a, b) => a - b);
  const intervalos: number[] = [];
  for (let i = 1; i < datas.length; i++) intervalos.push((datas[i] - datas[i - 1]) / 86_400_000);
  const intervaloMedioDias = Math.round(intervalos.reduce((a, b) => a + b, 0) / intervalos.length);
  const ultimaData = datas[datas.length - 1];
  const proximaDataEstimada = new Date(ultimaData + intervaloMedioDias * 86_400_000).toISOString();
  return { proximaDataEstimada, intervaloMedioDias };
}

/** Compara mês/dia (ignora ano) pra saber se o aniversário cai numa data específica. */
export function isBirthdayOn(dataNascimento: string | null | undefined, date: Date): boolean {
  if (!dataNascimento) return false;
  const b = new Date(dataNascimento + "T12:00:00");
  return b.getMonth() === date.getMonth() && b.getDate() === date.getDate();
}

/** Dias até o próximo aniversário (0 = hoje). Null se não houver data cadastrada. */
export function daysUntilBirthday(dataNascimento: string | null | undefined, from: Date = new Date()): number | null {
  if (!dataNascimento) return null;
  const b = new Date(dataNascimento + "T12:00:00");
  const hoje = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  let next = new Date(from.getFullYear(), b.getMonth(), b.getDate());
  if (next < hoje) next = new Date(from.getFullYear() + 1, b.getMonth(), b.getDate());
  return Math.round((next.getTime() - hoje.getTime()) / 86_400_000);
}
