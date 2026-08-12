import { useEffect, useState } from "react";

/**
 * Atrasa a propagação de um valor até ele parar de mudar por `delay` ms.
 *
 * Usado nas buscas: a `queryKey` incluía o termo cru, então cada tecla
 * disparava uma requisição HTTP — uma busca de 10 letras gerava 10 chamadas ao
 * Supabase, das quais só a última importava.
 */
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
