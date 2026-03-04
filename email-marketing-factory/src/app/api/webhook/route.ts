import { NextResponse } from 'next/server';

import type Stripe from 'stripe'

import stripe from '@/utils/stripe';
import { supabase } from '@/utils/supabase';


const relevantEvents = new Set([
    'product.created',
    'product.updated',
    'product.deleted',
    'price.created',
    'price.updated',
    'price.deleted',
    'checkout.session.completed',
    'customer.subscription.created',
    'customer.subscription.updated',
    'customer.subscription.deleted'
]);

export async function POST(req: Request) {

    const body = await req.text()
    const sig = req.headers.get('stripe-signature') as string

    let event: Stripe.Event

    try {
        if (!sig || !process.env.STRIPE_WEBHOOK_SECRET) {

            return NextResponse.json({ data: "Webhook secret not found" }, { status: 400 })
        }

        event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);

    } catch (error: any) {

        return NextResponse.json({ data: `Webhook Error: ${error.message}` }, { status: 400 })
    }

    if (relevantEvents.has(event.type)) {
        try {
            switch (event.type) {
                case 'product.created':
                case 'product.updated':
                case 'price.created':
                case 'price.updated':
                case 'price.deleted':
                case 'product.deleted':
                case 'customer.subscription.created':
                case 'customer.subscription.updated':
                    const u_subscription = event.data.object as Stripe.Subscription
                    const u_result = await manageSubscriptionStatusChange(u_subscription.id, u_subscription.customer as string)

                    if (!u_result) console.log('Update subscription')

                    break;

                case 'customer.subscription.deleted':
                    const d_subscription = event.data.object as Stripe.Subscription
                    const d_result = await manageSubscriptionStatusChange(d_subscription.id, d_subscription.customer as string)

                    if (!d_result) console.log('Update d_subscription')

                    break;
                case 'checkout.session.completed':
                    const checkoutSession = event.data.object as Stripe.Checkout.Session;

                    if (checkoutSession.mode === 'subscription') {

                        const subscriptionId = checkoutSession.subscription;

                        const result = await manageSubscriptionStatusChange(subscriptionId as string, checkoutSession.customer as string)

                        if (!result) console.log('Update subscription')
                    }

                    break;
                default:
                    throw new Error('Unhandled relevant event!');
            }
        } catch (error: any) {

            console.log('error', error)

            return NextResponse.json({ data: 'Webhook handler failed.' }, { status: 400 })
        }
    } else {

        return NextResponse.json({ data: `Unsupported event type ${event.type}` }, { status: 400 })
    }

    return NextResponse.json({})
}

const manageSubscriptionStatusChange = async (subscriptionId: string, customerId: string) => {

    const { data: user } = await supabase.from('users').select('id').eq('customer_id', customerId).single()

    const subscription = await stripe.subscriptions.retrieve(subscriptionId);

    if (user?.id) {

        console.log('status', subscription.status)
        console.log('id', subscriptionId)

        const subscriptionData = {
            id: subscriptionId,
            price_id: subscription.items.data[0].price.id,
            user_id: user.id,
            created: subscription.current_period_start ? new Date(subscription.current_period_start * 1000).toISOString() : null,
            expired_at: subscription.current_period_end ? new Date(subscription.current_period_end * 1000).toISOString() : null,
            status: subscription.status,
            product_id: subscription.items.data[0].price.product,
            updated_at: new Date().toISOString()
        }

        const { error: upsertError } = await supabase.from('subscriptions').upsert([subscriptionData])

        console.log('subscription sync-----', upsertError)

        if (upsertError)
            return false

        return true

    }
}