CREATE TABLE public.compras (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  produto TEXT NOT NULL,
  quantidade SMALLINT NOT NULL DEFAULT 1,
  valor NUMERIC(10,2) NOT NULL DEFAULT 0,
  origem TEXT NOT NULL DEFAULT 'loja', -- loja | site | nuvemshop
  data_compra TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_compras_lead ON public.compras(lead_id);
CREATE INDEX idx_compras_data ON public.compras(data_compra);

ALTER TABLE public.compras ENABLE ROW LEVEL SECURITY;

CREATE POLICY "compras select all auth" ON public.compras FOR SELECT
TO authenticated USING (true);
CREATE POLICY "compras insert auth" ON public.compras FOR INSERT
TO authenticated WITH CHECK (true);
CREATE POLICY "compras update auth" ON public.compras FOR UPDATE
TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "compras delete manager" ON public.compras FOR DELETE
TO authenticated USING (public.has_role(auth.uid(),'gerente') OR public.has_role(auth.uid(),'admin'));
