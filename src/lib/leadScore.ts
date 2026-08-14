export type LeadScoreData = {
  callCount?: number;
  positiveCount?: number;
  status: string;
  hasFollowup?: boolean;
};

export function calcLeadScore(d: LeadScoreData): number {
  const calls     = Math.min(d.callCount ?? 0, 10);
  const positives = Math.min(d.positiveCount ?? 0, 5);
  const followup  = d.hasFollowup ? 8 : 0;

  const statusBonus: Record<string, number> = {
    // enum real (lead_status)
    pos_venda: 100, entregue: 90, pago: 80,
    aguardando_pagamento: 70, negociacao: 55,
    interesse: 30, respondeu: 15, mensagem_zap: 15, retornar: 10,
    novo: 2, nao_atendeu: 1,
    // legado (mantido por compat com telas que ainda usam o funil antigo)
    registro: 100, repasse: 95, boleto_pago: 90,
    contrato_assinado: 85, contrato_gerado: 80,
    credito_aprovado: 75, cpf_analisado: 70,
    envio_documentos: 65, envio_doc: 65,
    visitou: 55, proposta: 50, convertido: 50,
    visita_confirmada: 42, visita_agendada: 38,
    visita_remarcada: 30, visita_faltou: 20,
    visita_pendente: 25,
    agendado: 38, visita: 25, proposta_aceita: 65,
    analise_credito: 70, aprovacao_credito: 75,
    chaves_entregues: 85,
  };

  const bonus = statusBonus[d.status] ?? 0;
  return Math.min(100, Math.round(calls * 2 + positives * 3 + bonus + followup));
}

export function scoreLabel(score: number): {
  label: string; emoji: string; color: string; bg: string;
} {
  if (score >= 85) return { label: "Fechando",  emoji: "🏆", color: "text-emerald-700", bg: "bg-emerald-100" };
  if (score >= 60) return { label: "Quente",    emoji: "🔥", color: "text-orange-700",  bg: "bg-orange-100"  };
  if (score >= 30) return { label: "Morno",     emoji: "🌡", color: "text-amber-700",   bg: "bg-amber-100"   };
  return               { label: "Frio",       emoji: "❄️", color: "text-blue-700",    bg: "bg-blue-100"    };
}