
-- Lead lists feature
CREATE TABLE public.lead_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  descricao text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.lead_lists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lists select all auth" ON public.lead_lists
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "lists insert auth" ON public.lead_lists
  FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());

CREATE POLICY "lists update owner or manager" ON public.lead_lists
  FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR has_role(auth.uid(),'gerente') OR has_role(auth.uid(),'admin'));

CREATE POLICY "lists delete owner or manager" ON public.lead_lists
  FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR has_role(auth.uid(),'gerente') OR has_role(auth.uid(),'admin'));

-- Link leads to lists
ALTER TABLE public.leads ADD COLUMN list_id uuid REFERENCES public.lead_lists(id) ON DELETE SET NULL;
CREATE INDEX idx_leads_list_id ON public.leads(list_id);
CREATE INDEX IF NOT EXISTS idx_leads_telefone ON public.leads(telefone);

-- Allow any authenticated user to insert leads (so they can add to lists they create)
DROP POLICY IF EXISTS "leads insert managers" ON public.leads;
CREATE POLICY "leads insert auth" ON public.leads
  FOR INSERT TO authenticated WITH CHECK (true);
