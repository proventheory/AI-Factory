import { NextResponse } from "next/server";

import { supabase } from "@/utils/supabase";
import stripe from "@/utils/stripe";
import urlConfig from "@/configs/urlConfig";

export async function POST(req: Request) {

    try {
        const { type, user_id, email } = await req.json()

        switch (type) {
            case 'getPlan':

                const { data: plan } = await supabase.from('subscriptions').select('price_id, created, expired_at, status, product_id').eq('user_id', user_id).order('updated_at', { ascending: false })

                if (plan?.length) {
                    const product = await stripe.products.retrieve(plan[0]?.product_id)
                    const price = await stripe.prices.retrieve(plan[0]?.price_id)

                    if (price.recurring && price.unit_amount)
                        return NextResponse.json({ created: plan[0]?.created, expired_at: plan[0]?.expired_at, name: product.name, description: product.description, type: price.recurring.interval, amount: price.unit_amount / 100, status: plan[0].status }, { status: 200 })

                } else
                    return NextResponse.json({ data: null }, { status: 500 })

            case 'createPortal':

                const { data: user } = await supabase.from('users').select('customer_id').eq('id', user_id).single()

                const { url } = await stripe.billingPortal.sessions.create({
                    customer: user?.customer_id,
                    return_url: `${urlConfig()}/account-settings`,
                });

                return NextResponse.json({ redirectUrl: url }, { status: 200 })
            case 'createCustomer':

                const customer = await stripe.customers.create({ email })

                return NextResponse.json({ customer }, { status: 200 })
            default:
                return NextResponse.json({ data: null }, { status: 500 })
        }

    } catch (error) {

        console.log('error', error)

        return NextResponse.json({ data: null }, { status: 500 })
    }


}