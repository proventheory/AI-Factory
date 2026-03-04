import { NextResponse } from 'next/server'

import { createClient } from '@supabase/supabase-js'

import type { RoleType, UsersType } from '@/types/apps/userTypes';

const SUPABASEURL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(SUPABASEURL, SUPABASE_ANON_KEY)

const supabaseAdmin = createClient(SUPABASEURL, SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

const adminAuthClient = supabaseAdmin.auth.admin;

interface RequestBody {
    type: string;
    data?: UsersType;
    id?: string
}

export async function POST(req: Request) {

    const getType = (plan: string) => {
        const planType = ['prod_RIQDLa3F0NECDg', 'prod_RIci7I6IhSJFSV']

        if (!plan || plan.startsWith('prod')) return plan == planType[0] ? 'core' : (plan == planType[1] ? 'startup' : 'none')

        else return plan == 'core' ? planType[0] : (plan == 'startup' ? planType[1] : null)
    }

    const getSubRoles = (role: string) => {

        const roles: RoleType[] = [{ value: 'admin', content: 'Admin' }, { value: 'a_manager', content: 'Account Manager' }, { value: 'user', content: 'Customer' }]

        let point: number = 3

        switch (role) {
            case 'superAdmin':
                point = 0
                break;
            case 'admin':
                point = 1
                break;
            case 'a_manager':
                point = 2
                break;
        }

        return roles.map((ele, index) => {
            if (index >= point) return ele
            else return null
        }).filter((ele) => ele !== null);
    }

    try {
        const data: RequestBody = await req.json()

        if (data.type === 'getList') {

            const id = data.id;

            const { data: user } = await supabase.from('user_view').select('id, data->role').eq('id', id).single()

            const query = supabase.from('user_view').select('id, email, user_status, data->name, data->avatar_url, sub_role, amanager_id, sub_status, product_id, data->role, data->address, data->website, data->phoneNumber').is('deleted_at', null).in('data->>role', getSubRoles(user?.role?.toString() as string).map(ele => ele.value)).order('data->role', { ascending: true }).order('data->name', { ascending: true })

            if (user?.role?.toString() == 'a_manager') query.eq('amanager_id', id)

            const { data: users } = await query

            if (users) {
                const result = users.map(item => {
                    const { avatar_url, sub_role, user_status, product_id, role, ...rest } = item



                    return { ...rest, avatar: avatar_url, currentPlan: getType(sub_role), status: user_status, sub_plan: getType(product_id), role: role || 'user' }
                })

                return NextResponse.json({ data: result }, { status: 200 });
            }
        } else if (data.type === 'getAManagers') {

            const { data: users } = await supabase.from('user_view').select('id, email, data->name, data->avatar_url').eq('user_status', 'active').is('deleted_at', null).eq('data->>role', 'a_manager')

            return NextResponse.json({
                data: users
            }, { status: 200 });

        } else if (data.type === 'update') {
            const userData = data.data;

            if (userData) {
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                const { id, amanager_id, sub_status, sub_plan, avatar, status, currentPlan, avatarColor, ...filtedData } = userData

                const { error: adminError } = await adminAuthClient.updateUserById(id as string, { email: userData.email, user_metadata: { ...filtedData } })

                const { error } = await supabase.from('users').update({ status: ['active', 'inactive', 'suspended'].includes(status) ? status : null, sub_role: getType(currentPlan as string), amanager_id: userData.role === 'user' && amanager_id != 'none' && amanager_id || null }).eq('id', id)

                if (error || adminError) return NextResponse.json({ data: null }, { status: 500 });
                else return NextResponse.json({ status: 200 });
            }
        } else if (data.type === 'createList') {
            const userData = data.data;

            if (userData) {
                const { error: signError } = await adminAuthClient.createUser({
                    email: userData?.email,
                    email_confirm: true,
                    password: 'focuz123',
                    user_metadata: { name: userData.name, role: userData.role, phoneNumber: userData.phoneNumber, website: userData.website, address: userData.address }
                })

                if (signError) {
                    NextResponse.json({ data: signError }, { status: 500 })
                } else {

                    const { error } = await supabase.from('users').update({ status: ['active', 'inactive', 'suspended'].includes(userData.status) ? userData.status : null, amanager_id: userData.role === 'user' && userData.amanager_id != 'none' && userData.amanager_id || null, sub_role: getType(userData.currentPlan as string) }).eq('email', userData.email)

                    return NextResponse.json({ status: error ? 500 : 200 })
                }
            }
        } else if (data.type === 'getRoles') {

            const id = data.id

            const { data: user } = await supabase.from('user_view').select('data->role').eq('id', id).single()

            if (user) {
                const roles = getSubRoles(user.role as string || "user")

                return NextResponse.json({ data: roles }, { status: 200 })
            }

            return NextResponse.json({ status: 500 })
        } else if (data.type === 'getUserCard') {

            const { count: totalUser } = await supabase.from('user_view').select('id', { count: 'exact', head: true })
            const { count: paidUser } = await supabase.from('user_view').select('id', { count: 'exact', head: true }).neq('price_id', null)
            const { count: activeUser } = await supabase.from('user_view').select('id', { count: 'exact', head: true }).eq('user_status', 'active')
            const { count: pendingUser } = await supabase.from('user_view').select('id', { count: 'exact', head: true }).eq('product_id', 'null')

            return NextResponse.json({ data: [totalUser, paidUser, activeUser, pendingUser] })

        } else if (data.type === 'resetPassword') {
            const userData = data.data

            if (userData?.email) {
                const { error: adminError } = await supabaseAdmin.auth.resetPasswordForEmail(userData?.email, { redirectTo: 'https://focuz.ai/update-password' })

                return NextResponse.json({ data: null }, { status: adminError ? 500 : 200 });
            }
            else return NextResponse.json({ status: 500 });
        }
    }
    catch (error) {
        console.log('user operator', error)

        return NextResponse.json({ data: null }, { status: 500 });
    }
}