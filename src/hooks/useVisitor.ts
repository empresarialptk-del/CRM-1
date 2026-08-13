// Hook para verificar modo visitante (somente visualização)
// Uso: const { isVisitor, blockIfVisitor } = useVisitor();
// blockIfVisitor(() => salvar()) — bloqueia se for visitante

import { toast } from "sonner";

export function useVisitor() {
  const isVisitor = localStorage.getItem("mrvcall_visitor") === "true";

  function blockIfVisitor(fn?: () => void): boolean {
    if (isVisitor) {
      toast.warning("👁 Modo visitante — somente visualização");
      return true; // bloqueado
    }
    fn?.();
    return false; // não bloqueado
  }

  return { isVisitor, blockIfVisitor };
}