-- Status de contato por mensagem (substitui o booleano respondida)
CREATE TYPE public.mensagem_status_contato AS ENUM ('enviada','vista','respondida','sem_retorno');

ALTER TABLE public.mensagens
  ADD COLUMN status_contato public.mensagem_status_contato NOT NULL DEFAULT 'enviada';

UPDATE public.mensagens SET status_contato = 'respondida' WHERE respondida = true;

ALTER TABLE public.mensagens DROP COLUMN respondida;

-- Qualquer atendente autenticado precisa ver o nome dos colegas para
-- poder atribuir/reatribuir leads (antes só via gerente/admin).
DROP POLICY "profiles select self or manager" ON public.profiles;
CREATE POLICY "profiles select all auth" ON public.profiles FOR SELECT
TO authenticated USING (true);
