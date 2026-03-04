import { createBrowserClient } from "@supabase/ssr"

const SUPABASEURL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createBrowserClient(SUPABASEURL, SUPABASE_ANON_KEY);
