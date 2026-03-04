import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/libs/server-client";
import urlConfig from "@/configs/urlConfig";
import stripe from "@/utils/stripe";

import { createProfile } from "@api/klaviyo"

export async function GET(request: Request) {

  const { searchParams } = new URL(request.url);

  const code = searchParams.get("code");

  const type = searchParams.get("type")

  if (!code) {
    return NextResponse.redirect(`${urlConfig()}`);
  }

  const supabase = createSupabaseServerClient();
  const { data: sessionData } = await supabase.auth.exchangeCodeForSession(code);
  const session = sessionData?.session;

  if (!session) {
    return NextResponse.redirect(`${urlConfig()}`);
  }

  console.log('type', type)

  if (type && type != 'login')
    await createProfile(session.user.email!, session.user.user_metadata?.full_name.split(' ')[0], session.user.user_metadata?.full_name.split(' ')[1]).catch(() => {
      console.log('A user already exist')
    })

  try {

    const { data: user } = await supabase.from('user_view').select('id, sub_role, price_id, data->role').eq('id', session.user.id).single()

    if (user && (user.price_id || user.sub_role)) {
      const { data: profileData } = await supabase.from('profiles_brand').select('*').eq('user_id', session.user.id);

      console.log('user role', user.role)

      if (profileData) {
        const redirectUrl = profileData.length > 0 ? `${urlConfig()}/campaigns` : `${urlConfig()}/onboarding`;

        return NextResponse.redirect(redirectUrl);
      }
    }
    else {
      const { data: isCustomer } = await supabase.from('users').select('customer_id').eq('id', session.user.id).single()

      if (!isCustomer?.customer_id) {
        const customer = await stripe.customers.create({ email: session.user.email })

        await supabase.from('users').update({ 'customer_id': customer.id }).eq('email', session.user.email)
      }

      return NextResponse.redirect(`${urlConfig()}/pricing`)
    }

  } catch (error) {

    console.log('error', error)

    return NextResponse.redirect(`${urlConfig()}`);

  }

}