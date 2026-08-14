-- Aniversário e tags livres do lead, pra alimentar recompra/relacionamento
-- (a "próxima recompra estimada" é calculada no frontend a partir de compras, não fica salva).
ALTER TABLE public.leads ADD COLUMN data_nascimento DATE;
ALTER TABLE public.leads ADD COLUMN tags TEXT[] NOT NULL DEFAULT '{}';
CREATE INDEX idx_leads_tags ON public.leads USING GIN (tags);
