import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Cliente Supabase. As chaves entram pelas variáveis de ambiente do Vite
 * (aba de chaves/API keys do Freebuff): VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.
 * Sem elas, o app degrada para o login local (nenhuma quebra).
 */
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export const supabase: SupabaseClient | null = supabaseConfigured
  ? createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    })
  : null;
