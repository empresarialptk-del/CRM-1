-- Trilha de auditoria de alterações em leads (usada por HistoricoAlteracoes e LeadDetail)
CREATE TABLE public.lead_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  campo TEXT NOT NULL,
  valor_anterior TEXT,
  valor_novo TEXT,
  alterado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  alterado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_lead_audit_lead ON public.lead_audit(lead_id);
CREATE INDEX idx_lead_audit_alterado_em ON public.lead_audit(alterado_em);
CREATE INDEX idx_lead_audit_campo ON public.lead_audit(campo);

ALTER TABLE public.lead_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lead_audit select all auth" ON public.lead_audit FOR SELECT
TO authenticated USING (true);

-- Só o trigger (security definer) grava — ninguém insere/edita direto pela API
CREATE POLICY "lead_audit no direct write" ON public.lead_audit FOR INSERT
TO authenticated WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.log_lead_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.lead_audit (lead_id, campo, valor_anterior, valor_novo, alterado_por)
    VALUES (NEW.id, 'status', OLD.status::text, NEW.status::text, auth.uid());
  END IF;
  IF NEW.observacoes IS DISTINCT FROM OLD.observacoes THEN
    INSERT INTO public.lead_audit (lead_id, campo, valor_anterior, valor_novo, alterado_por)
    VALUES (NEW.id, 'observacoes', OLD.observacoes, NEW.observacoes, auth.uid());
  END IF;
  IF NEW.proximo_followup IS DISTINCT FROM OLD.proximo_followup THEN
    INSERT INTO public.lead_audit (lead_id, campo, valor_anterior, valor_novo, alterado_por)
    VALUES (NEW.id, 'proximo_followup', OLD.proximo_followup::text, NEW.proximo_followup::text, auth.uid());
  END IF;
  IF NEW.nome IS DISTINCT FROM OLD.nome THEN
    INSERT INTO public.lead_audit (lead_id, campo, valor_anterior, valor_novo, alterado_por)
    VALUES (NEW.id, 'nome', OLD.nome, NEW.nome, auth.uid());
  END IF;
  IF NEW.telefone IS DISTINCT FROM OLD.telefone THEN
    INSERT INTO public.lead_audit (lead_id, campo, valor_anterior, valor_novo, alterado_por)
    VALUES (NEW.id, 'telefone', OLD.telefone, NEW.telefone, auth.uid());
  END IF;
  IF NEW.origem IS DISTINCT FROM OLD.origem THEN
    INSERT INTO public.lead_audit (lead_id, campo, valor_anterior, valor_novo, alterado_por)
    VALUES (NEW.id, 'origem', OLD.origem, NEW.origem, auth.uid());
  END IF;
  IF NEW.list_id IS DISTINCT FROM OLD.list_id THEN
    INSERT INTO public.lead_audit (lead_id, campo, valor_anterior, valor_novo, alterado_por)
    VALUES (NEW.id, 'list_id', OLD.list_id::text, NEW.list_id::text, auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.log_lead_changes() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_leads_audit
AFTER UPDATE ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.log_lead_changes();
