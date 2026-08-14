-- Calendário de promoções/eventos/novidades, opcionalmente direcionado a uma
-- lista de leads ou a um segmento de ticket (calculado no cliente, por isso
-- fica como TEXT livre em vez de enum ligado a uma tabela).
CREATE TYPE public.evento_calendario_tipo AS ENUM ('promocao', 'evento', 'novidade');

CREATE TABLE public.eventos_calendario (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo TEXT NOT NULL,
  tipo public.evento_calendario_tipo NOT NULL,
  descricao TEXT,
  data DATE NOT NULL,
  data_fim DATE,
  alvo_list_id UUID REFERENCES public.lead_lists(id) ON DELETE SET NULL,
  alvo_ticket_tier TEXT,
  criado_por UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_eventos_calendario_data ON public.eventos_calendario(data);

ALTER TABLE public.eventos_calendario ENABLE ROW LEVEL SECURITY;

CREATE POLICY "eventos_calendario select all auth" ON public.eventos_calendario FOR SELECT
TO authenticated USING (true);
CREATE POLICY "eventos_calendario insert auth" ON public.eventos_calendario FOR INSERT
TO authenticated WITH CHECK (criado_por = auth.uid());
CREATE POLICY "eventos_calendario update all auth" ON public.eventos_calendario FOR UPDATE
TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "eventos_calendario delete all auth" ON public.eventos_calendario FOR DELETE
TO authenticated USING (true);
