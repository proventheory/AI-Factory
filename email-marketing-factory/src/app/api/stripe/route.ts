import { NextResponse } from 'next/server';

import urlConfig from '@/configs/urlConfig';
import { supabase } from '@/utils/supabase';
import stripe from '@/utils/stripe';

export async function GET() {

    try {
        const { data } = await stripe.prices.list({ active: true })

        const monthlyData: { price: number, productId: string }[] = []
        const annualData: { price: number, productId: string }[] = []

        data.map((ele: any) => {
            if (ele?.recurring.interval == 'month')
                monthlyData.push({ price: ele.unit_amount / 100, productId: ele?.id })

            else if (ele?.recurring.interval == 'year')
                annualData.push({ price: ele.unit_amount / 1200, productId: ele?.id })
        })

        return NextResponse.json({ monthlyData: monthlyData.sort(function (a, b) { return a.price - b.price }), annualData: annualData.sort(function (a, b) { return a.price - b.price }) }, { status: 200 })

    } catch (error) {
        return NextResponse.json({ data: error }, { status: 500 })
    }
}

export async function POST(req: Request) {
    try {

        const { productId, user: { email } } = await req.json()
        const { data: user } = await supabase.from('users').select('customer_id').eq('email', email).single();

        if (!user)
            return NextResponse.json({ data: null }, { status: 500 })

        const session = await stripe.checkout.sessions.create({
            customer: user.customer_id,
            payment_method_types: ['card'],
            mode: 'subscription',
            allow_promotion_codes: true,
            subscription_data: {
                trial_period_days: 14
            },
            line_items: [
                {
                    price: productId,
                    quantity: 1,
                },
            ],
            success_url: `${urlConfig()}/onboarding`,
            cancel_url: `${urlConfig()}/pricing`,
        });

        return NextResponse.json({ sessionId: session?.id }, { status: 200 })

    } catch (error) {
        return NextResponse.json({ data: null }, { status: 500 })
    }
}
