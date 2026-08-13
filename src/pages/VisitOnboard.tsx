import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  BookOpen, Star, MessageSquare, Target, ChevronDown, ChevronUp,
  Lightbulb, Users, Clock, Briefcase, DollarSign, Award, ArrowRight,
} from "lucide-react";

// ─── Estrutura do onboard ─────────────────────────────────────────────────────

const VISIT_FLOW = [
  {
    step: "01",
    label: "Aborde Conquistando",
    letter: "A",
    color: "bg-blue-500",
    textColor: "text-blue-700",
    bg: "bg-blue-50 border-blue-200",
    dicas: [
      "Vá ao encontro do cliente assim que ele entrar — não espere.",
      "Sorria genuinamente e transmita energia positiva.",
      "Apresente-se com nome e empresa, depois pergunte o nome dele.",
      "Use o nome do cliente ao longo de toda a visita.",
      "Cuide da sua apresentação pessoal — você é o produto antes do imóvel.",
    ],
  },
  {
    step: "02",
    label: "Conheça o Cliente",
    letter: "C",
    color: "bg-emerald-500",
    textColor: "text-emerald-700",
    bg: "bg-emerald-50 border-emerald-200",
    dicas: [
      "Faça perguntas abertas — deixe o cliente falar.",
      "Entenda a família: quem mora junto, filhos, rotina.",
      "Descubra o que ele valoriza no imóvel (localização, espaço, lazer?).",
      "Identifique o potencial financeiro com naturalidade.",
      "Não comece a apresentação antes de ter esse diagnóstico.",
    ],
  },
  {
    step: "03",
    label: "Encante na Apresentação",
    letter: "E",
    color: "bg-purple-500",
    textColor: "text-purple-700",
    bg: "bg-purple-50 border-purple-200",
    dicas: [
      "Apresente o produto conectando aos benefícios que ELE mencionou.",
      "Crie telas mentais: 'Imagina você e a família aqui no fim de semana…'",
      "Demonstre conhecimento da região e da concorrência.",
      "Fale dos diferenciais MRV com convicção e entusiasmo.",
      "Nunca pareça com pressa ou preguiça.",
    ],
  },
  {
    step: "04",
    label: "Lide com as Objeções",
    letter: "L",
    color: "bg-amber-500",
    textColor: "text-amber-700",
    bg: "bg-amber-50 border-amber-200",
    dicas: [
      "Receba a objeção com calma — nunca reaja com antagonismo.",
      "Devolva a objeção como pergunta: 'O que você quis dizer com isso?'",
      "Crie argumentos que neutralizem a objeção com benefícios.",
      "Seja persistente — mostre controle da situação.",
      "Reforce sempre os benefícios do produto e da MRV.",
    ],
  },
  {
    step: "05",
    label: "Encerre sem Medo",
    letter: "E",
    color: "bg-rose-500",
    textColor: "text-rose-700",
    bg: "bg-rose-50 border-rose-200",
    dicas: [
      "Identifique sinais de compra e aja na hora.",
      "Realize simulações de financiamento — torna real.",
      "Use técnicas de fechamento: alternativa, urgência, compromisso.",
      "Estabeleça um próximo passo concreto (proposta, reserva, documento).",
      "Crie senso de urgência: unidades limitadas, condições da planta.",
    ],
  },
  {
    step: "06",
    label: "Relacione-se a Longo Prazo",
    letter: "R",
    color: "bg-teal-500",
    textColor: "text-teal-700",
    bg: "bg-teal-50 border-teal-200",
    dicas: [
      "Pegue o telefone do cliente antes de sair.",
      "Entregue seu cartão e coloque-se à disposição.",
      "Entre em contato em até 48h com uma mensagem personalizada.",
      "Peça indicações — clientes satisfeitos indicam.",
      "Mantenha o cliente engajado com senso de oportunidade.",
    ],
  },
  {
    step: "07",
    label: "Amplie sua Carteira",
    letter: "A",
    color: "bg-indigo-500",
    textColor: "text-indigo-700",
    bg: "bg-indigo-50 border-indigo-200",
    dicas: [
      "Mantenha o CRM sempre atualizado — cada lead importa.",
      "Faça follow-up diário com todos os clientes do funil.",
      "Prospecte clientes com perfil alinhado ao produto.",
      "Use script de prospecção consistente.",
      "Argumente bem para trazer o cliente à visita presencial.",
    ],
  },
];

const OBJECOES_CLASSICAS = [
  {
    objecao: '"Não tenho dinheiro / não consigo dar entrada"',
    resposta: "Entendo! Mas sabia que você pode usar seu FGTS como entrada? Além disso, temos simulações com entrada mínima. Posso te mostrar como ficaria?",
    tag: "Financeiro",
    tagColor: "bg-rose-100 text-rose-700",
  },
  {
    objecao: '"Vou pensar e te ligo"',
    resposta: "Claro! O que especificamente você ainda quer pensar? Se for algo financeiro ou de decisão, posso te ajudar a clarear agora mesmo.",
    tag: "Fuga",
    tagColor: "bg-amber-100 text-amber-700",
  },
  {
    objecao: '"Prefiro casa, não apartamento"',
    resposta: "Entendo! Mas deixa eu te perguntar: o que você mais valoriza em uma casa — a privacidade, o quintal? Porque nosso projeto tem [benefício específico] que resolve exatamente isso.",
    tag: "Produto",
    tagColor: "bg-blue-100 text-blue-700",
  },
  {
    objecao: '"Está caro"',
    resposta: "Em relação ao quê você está comparando? Vamos olhar juntos o custo por m² e o que está incluso — às vezes a percepção muda bastante quando a gente coloca na ponta do lápis.",
    tag: "Preço",
    tagColor: "bg-purple-100 text-purple-700",
  },
  {
    objecao: '"Preciso falar com minha esposa/marido"',
    resposta: "Faz todo sentido! Uma decisão assim é para os dois. Que tal marcarmos uma visita com ela/ele também? Posso já deixar reservado um horário.",
    tag: "Decisão",
    tagColor: "bg-emerald-100 text-emerald-700",
  },
  {
    objecao: '"A localização não me agrada"',
    resposta: "O que especificamente na localização te preocupa? [Após resposta] Entendo — mas sabia que [argumento sobre valorização/infraestrutura/acesso]? Vamos ver se faz sentido.",
    tag: "Localização",
    tagColor: "bg-teal-100 text-teal-700",
  },
];

const POWER_QUESTIONS_SUMMARY = [
  {
    label: "Família",
    icon: <Users className="h-4 w-4" />,
    color: "text-pink-700",
    bg: "bg-pink-50 border-pink-200",
    questions: [
      "Com quem você mora atualmente?",
      "Você tem filhos? Quantos e qual a idade?",
      "Como é a rotina da sua família?",
      "Costumam receber visitas de familiares?",
      "O imóvel é para moradia ou para crescer a família?",
    ],
  },
  {
    label: "Tempo Livre",
    icon: <Star className="h-4 w-4" />,
    color: "text-orange-700",
    bg: "bg-orange-50 border-orange-200",
    questions: [
      "O que gosta de fazer nos fins de semana?",
      "Pratica algum esporte ou atividade física?",
      "Costuma sair bastante ou prefere ficar em casa?",
      "Tem animais de estimação?",
      "Prefere área de lazer no condomínio ou mais privacidade?",
    ],
  },
  {
    label: "Trabalho",
    icon: <Briefcase className="h-4 w-4" />,
    color: "text-sky-700",
    bg: "bg-sky-50 border-sky-200",
    questions: [
      "Qual é a sua profissão?",
      "Trabalha presencial ou home office?",
      "Onde fica seu trabalho? Precisa de fácil acesso?",
      "É CLT, autônomo ou empresário?",
      "Viaja com frequência a trabalho?",
    ],
  },
  {
    label: "Renda",
    icon: <DollarSign className="h-4 w-4" />,
    color: "text-green-700",
    bg: "bg-green-50 border-green-200",
    questions: [
      "Já teve experiência com financiamento imobiliário?",
      "Pretende usar o FGTS na compra?",
      "Qual parcela caberia no orçamento?",
      "Tem renda composta com cônjuge ou familiar?",
      "Prefere entrada maior ou parcelas menores?",
    ],
  },
];

// ─── Componente ───────────────────────────────────────────────────────────────

export default function VisitOnboard() {
  const navigate = useNavigate();
  const [openSteps, setOpenSteps] = useState<Set<string>>(new Set(["01"]));
  const [openObjecoes, setOpenObjecoes] = useState<Set<number>>(new Set());

  function toggleStep(step: string) {
    setOpenSteps(prev => {
      const next = new Set(prev);
      next.has(step) ? next.delete(step) : next.add(step);
      return next;
    });
  }

  function toggleObjecao(idx: number) {
    setOpenObjecoes(prev => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });
  }

  return (
    <div className="p-6 max-w-[1100px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
        <div>
          <h1 className="font-display font-bold text-3xl flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-md">
              <BookOpen className="h-5 w-5 text-white" />
            </div>
            Onboard de Visita
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Seu guia completo para um atendimento presencial de alta performance
          </p>
        </div>
        <Button onClick={() => navigate("/checkup")}>
          <Award className="h-4 w-4 mr-2" /> Fazer Check-up
        </Button>
      </div>

      {/* Banner ACELERA */}
      <div className="mb-6 p-4 rounded-xl bg-gradient-to-r from-slate-800 to-slate-700 text-white flex items-center gap-4">
        <div className="flex gap-1">
          {["A","C","E","L","E","R","A"].map((l, i) => (
            <div key={i} className="h-8 w-8 rounded-lg bg-white/10 flex items-center justify-center font-display font-bold text-sm">
              {l}
            </div>
          ))}
        </div>
        <div>
          <p className="font-semibold text-sm">Metodologia ACELERA</p>
          <p className="text-xs text-white/70">7 etapas para um atendimento de excelência — do aborde ao relacionamento</p>
        </div>
        <div className="ml-auto text-xs text-white/50">MRV DNA de Vendas</div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6">

        {/* ── Fluxo ACELERA ──────────────────────────────────────────────── */}
        <div className="space-y-3">
          <h2 className="font-display font-semibold text-base flex items-center gap-2">
            <Target className="h-4 w-4 text-muted-foreground" />
            Etapas do Atendimento
          </h2>

          {VISIT_FLOW.map(step => {
            const isOpen = openSteps.has(step.step);
            return (
              <Card key={step.step} className={`shadow-card border transition-all ${isOpen ? step.bg : "border-border"}`}>
                <button
                  className="w-full flex items-center gap-4 p-4"
                  onClick={() => toggleStep(step.step)}
                >
                  <div className={`h-9 w-9 rounded-xl ${step.color} flex items-center justify-center text-white font-display font-bold text-sm shrink-0`}>
                    {step.letter}
                  </div>
                  <div className="flex-1 text-left">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-muted-foreground font-mono">ETAPA {step.step}</span>
                    </div>
                    <div className={`font-display font-bold text-sm ${isOpen ? step.textColor : ""}`}>
                      {step.label}
                    </div>
                  </div>
                  {isOpen
                    ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
                    : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                  }
                </button>
                {isOpen && (
                  <div className="px-4 pb-4">
                    <ul className="space-y-2">
                      {step.dicas.map((dica, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm">
                          <span className={`h-5 w-5 rounded-full ${step.color} text-white flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5`}>
                            {i + 1}
                          </span>
                          <span className="text-foreground/80">{dica}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </Card>
            );
          })}

          {/* Objeções clássicas */}
          <h2 className="font-display font-semibold text-base flex items-center gap-2 pt-4">
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
            Objeções Clássicas e Como Responder
          </h2>

          {OBJECOES_CLASSICAS.map((obj, idx) => {
            const isOpen = openObjecoes.has(idx);
            return (
              <Card key={idx} className="shadow-card">
                <button
                  className="w-full flex items-center gap-3 p-4 text-left"
                  onClick={() => toggleObjecao(idx)}
                >
                  <Lightbulb className="h-4 w-4 text-amber-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium italic text-foreground/80 truncate block">{obj.objecao}</span>
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold shrink-0 ${obj.tagColor}`}>
                    {obj.tag}
                  </span>
                  {isOpen
                    ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
                    : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                  }
                </button>
                {isOpen && (
                  <div className="px-4 pb-4">
                    <div className="flex gap-2 p-3 rounded-lg bg-emerald-50 border border-emerald-200">
                      <ArrowRight className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                      <p className="text-sm text-emerald-900">{obj.resposta}</p>
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>

        {/* ── Painel direito: Perguntas Power ───────────────────────────── */}
        <div className="space-y-4">
          <h2 className="font-display font-semibold text-base flex items-center gap-2">
            <Star className="h-4 w-4 text-amber-500" />
            Perguntas Power
          </h2>
          <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800">
            <p className="font-semibold mb-1">"Cliente, para entender melhor seu perfil, eu preciso fazer algumas perguntas. Tudo bem?"</p>
            <p className="text-amber-700">Use essas perguntas para criar conexão e personalizar sua apresentação.</p>
          </div>

          {POWER_QUESTIONS_SUMMARY.map(section => (
            <Card key={section.label} className={`shadow-card border ${section.bg}`}>
              <CardContent className="p-4">
                <h3 className={`font-display font-bold text-xs flex items-center gap-2 mb-3 ${section.color}`}>
                  {section.icon} {section.label}
                </h3>
                <ul className="space-y-2">
                  {section.questions.map((q, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className={`text-[10px] font-bold shrink-0 mt-0.5 ${section.color}`}>{i + 1}</span>
                      <span className="text-xs text-foreground/80">{q}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}

          {/* CTA Check-up */}
          <Card className="shadow-card bg-gradient-to-br from-emerald-50 to-teal-50 border-emerald-200">
            <CardContent className="p-5 text-center">
              <Award className="h-10 w-10 mx-auto mb-3 text-emerald-600" />
              <p className="font-display font-bold text-sm text-emerald-900 mb-1">Após a visita</p>
              <p className="text-xs text-emerald-700 mb-4">Preencha o check-up ACELERA para avaliar seu atendimento e evoluir continuamente.</p>
              <Button
                onClick={() => navigate("/checkup")}
                className="w-full bg-emerald-600 hover:bg-emerald-700"
              >
                <Award className="h-4 w-4 mr-2" /> Ir para o Check-up
              </Button>
            </CardContent>
          </Card>

          {/* Lembrete de tempo */}
          <Card className="shadow-card border-blue-200 bg-blue-50">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <Clock className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-bold text-blue-800 mb-1">Pós-atendimento em até 48h</p>
                  <p className="text-xs text-blue-700">Entre em contato com o cliente, crie senso de oportunidade e peça indicações.</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}