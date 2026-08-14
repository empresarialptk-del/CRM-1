CREATE TYPE public.mensagem_categoria AS ENUM ('recompra','novidade','desconto','promocao');

CREATE TABLE public.mensagens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  atendente_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  categoria mensagem_categoria NOT NULL,
  texto TEXT NOT NULL,
  canal TEXT NOT NULL DEFAULT 'whatsapp',
  respondida BOOLEAN NOT NULL DEFAULT false,
  observacao TEXT,
  enviada_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_mensagens_atendente ON public.mensagens(atendente_id);
CREATE INDEX idx_mensagens_lead ON public.mensagens(lead_id);
CREATE INDEX idx_mensagens_enviada ON public.mensagens(enviada_em);
CREATE INDEX idx_mensagens_categoria ON public.mensagens(categoria);

ALTER TABLE public.mensagens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mensagens select own or manager" ON public.mensagens FOR SELECT
TO authenticated USING (
  atendente_id = auth.uid()
  OR public.has_role(auth.uid(),'gerente')
  OR public.has_role(auth.uid(),'admin')
);
CREATE POLICY "mensagens insert own" ON public.mensagens FOR INSERT
TO authenticated WITH CHECK (atendente_id = auth.uid());
CREATE POLICY "mensagens update own or manager" ON public.mensagens FOR UPDATE
TO authenticated USING (
  atendente_id = auth.uid()
  OR public.has_role(auth.uid(),'gerente')
  OR public.has_role(auth.uid(),'admin')
);
