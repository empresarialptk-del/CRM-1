-- A equipe precisa ver o histórico de contato uns dos outros (Kanban mostra o
-- último status_contato de qualquer atendente) — só o envio continua restrito
-- ao próprio atendente, pra ninguém logar mensagem em nome de outro.
DROP POLICY "mensagens select own or manager" ON public.mensagens;
CREATE POLICY "mensagens select all auth" ON public.mensagens FOR SELECT
TO authenticated USING (true);

DROP POLICY "mensagens update own or manager" ON public.mensagens;
CREATE POLICY "mensagens update all auth" ON public.mensagens FOR UPDATE
TO authenticated USING (true) WITH CHECK (true);
