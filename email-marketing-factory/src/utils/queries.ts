import { cache } from 'react'

import type { Session } from '@supabase/supabase-js';

import { supabase } from "./supabase";
import { demoPattern } from '.';

type CustomSession = Session | { user: { id: string, email: string } };

export const getSession = cache(async (pathName?: string): Promise<CustomSession | null> => {
    const { data: { session } } = await supabase.auth.getSession();

    if (!session && process.env.NEXT_PUBLIC_DEMO_USER_ID) {
        if (pathName && demoPattern.test(pathName)) {
            return { user: { id: process.env.NEXT_PUBLIC_DEMO_USER_ID!, email: '' } };
        }

        return null;
    }

    return session as CustomSession;
});

export const getUser = cache(async () => {

    const { data: { user } } = await supabase.auth.getUser()

    return user
})
