-- Pedido = cabeçalho da venda (cliente, pagamento, entrega, vendedor).
-- `compras` passa a ser os itens do pedido (ganha pedido_id + custo pra
-- calcular margem). Compras sem pedido_id continuam funcionando como
-- registro avulso, exatamente como já funcionava antes.
CREATE TYPE public.pedido_status_pagamento AS ENUM ('aguardando', 'pago', 'estornado');
CREATE TYPE public.pedido_status_entrega AS ENUM ('preparando', 'enviado', 'entregue');

CREATE TABLE public.pedidos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero BIGSERIAL,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  vendedor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status_pagamento public.pedido_status_pagamento NOT NULL DEFAULT 'aguardando',
  status_entrega public.pedido_status_entrega NOT NULL DEFAULT 'preparando',
  forma_pagamento TEXT,
  desconto NUMERIC(10,2) NOT NULL DEFAULT 0,
  frete NUMERIC(10,2) NOT NULL DEFAULT 0,
  endereco_entrega TEXT,
  observacoes TEXT,
  criado_por UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_pedidos_lead ON public.pedidos(lead_id);
CREATE INDEX idx_pedidos_status_pagamento ON public.pedidos(status_pagamento);
CREATE INDEX idx_pedidos_status_entrega ON public.pedidos(status_entrega);

CREATE TRIGGER trg_pedidos_updated BEFORE UPDATE ON public.pedidos
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.pedidos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pedidos select all auth" ON public.pedidos FOR SELECT
TO authenticated USING (true);
CREATE POLICY "pedidos insert auth" ON public.pedidos FOR INSERT
TO authenticated WITH CHECK (criado_por = auth.uid());
CREATE POLICY "pedidos update all auth" ON public.pedidos FOR UPDATE
TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "pedidos delete manager" ON public.pedidos FOR DELETE
TO authenticated USING (public.has_role(auth.uid(),'gerente') OR public.has_role(auth.uid(),'admin'));

-- compras vira "itens do pedido" quando pedido_id estiver preenchido
ALTER TABLE public.compras ADD COLUMN pedido_id UUID REFERENCES public.pedidos(id) ON DELETE CASCADE;
ALTER TABLE public.compras ADD COLUMN custo NUMERIC(10,2) NOT NULL DEFAULT 0;
CREATE INDEX idx_compras_pedido ON public.compras(pedido_id);
