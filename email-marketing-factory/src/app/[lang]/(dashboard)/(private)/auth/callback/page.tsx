'use client'

import { useEffect } from 'react'

import { useRouter } from 'next/navigation'

import Lottie from 'lottie-react'

import { supabase } from '@/utils/supabase'

import { getSession } from '@/utils/queries'
import urlConfig from '@/configs/urlConfig'

import loadingData from '@/utils/loading1.json'


const Callback = () => {
  const router = useRouter()

  useEffect(() => {
    const checkSession = async () => {
      const [session] = await Promise.all([getSession()])

      if (session) {
        const { data: user } = await supabase.from('user_view').select('id, sub_role, price_id, data->role').eq('id', session.user.id).single()

        if (user && (user.price_id || user.sub_role)) {
          const { data: profileData } = await supabase.from('profiles_brand').select('*').eq('user_id', session.user.id);

          console.log('user role', user.role)

          if (profileData) {
            const redirectUrl = profileData.length > 0 ? `${urlConfig()}/campaigns` : `${urlConfig()}/onboarding`;

            return router.push(redirectUrl);
          }
        } else {
          const { data: isCustomer } = await supabase.from('users').select('customer_id').eq('id', session.user.id).single()

          if (!isCustomer?.customer_id) {
            const res = await fetch('/api/subscription', { method: 'POST', body: JSON.stringify({ type: 'createCustomer', email: session?.user.email }) })

            const { customer } = await res.json();

            if (!customer) return router.push(`${urlConfig()}`)

            await supabase.from('users').update({ 'customer_id': customer.id }).eq('email', session.user?.email)
          }

          return router.push(`${urlConfig()}/pricing`)
        }
      } else {
        console.log('No session found, redirecting to login')
        router.push('/login')
      }
    }

    checkSession()
  }, [router])

  return <div className={`flex w-full h-full items-center justify-center `}>
    <Lottie animationData={loadingData} className="!w-[200px] !h-[200px]" />
  </div>
}

export default Callback

