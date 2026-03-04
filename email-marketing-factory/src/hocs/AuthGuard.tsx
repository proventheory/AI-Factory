'use client'

// Imports
import { useEffect, useState } from 'react'

import { useRouter, usePathname } from 'next/navigation'

import Lottie from "lottie-react";
import { useSelector } from 'react-redux';
import { ToastContainer } from 'react-toastify'

import loading from '@/utils/loading.json'
import loading1 from '@/utils/loading1.json'

import 'react-toastify/dist/ReactToastify.css'

import type { Locale } from '@configs/i18n'
import type { ChildrenType } from '@core/types'
import type { RootState } from '@/redux-store';
import { getSession } from '@/utils/queries';

export default function AuthGuard({ children, locale }: ChildrenType & { locale: Locale }) {
  const { visible, commonVisible } = useSelector((state: RootState) => state.loadingReducer)

  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null)
  const [isRoleAllowed, setIsRoleAllowed] = useState<boolean>(true) // New state to handle role-based redirection

  const router = useRouter()
  const pathName: string = usePathname()

  useEffect(() => {
    const checkSession = async () => {
      const [session]: any = await Promise.all([getSession()])
      const userRole: string = session?.user?.user_metadata?.role || 'user'

      if (session) {
        setIsAuthenticated(true)

        if (!['superAdmin', 'admin', 'a_manager'].includes(userRole) && pathName.includes('admin')) {
          setIsRoleAllowed(false)
        } else {
          setIsRoleAllowed(true)
        }
      } else {
        setIsAuthenticated(false)
        router.push(`/login?lang=${locale}`)
      }
    }

    checkSession()
  }, [locale, pathName, router])

  useEffect(() => {
    // Redirect to "not-found" if the role is not allowed
    if (isAuthenticated && !isRoleAllowed) {
      router.push('/not-found')
    }
  }, [isAuthenticated, isRoleAllowed, router])

  if (isAuthenticated === null || (isAuthenticated && !isRoleAllowed)) {
    return (
      <div className="z-50 absolute h-screen w-screen flex bg-white/80 items-center justify-center">
        <Lottie animationData={loading1} className="!w-[150px] !h-[150px]" />
      </div>
    )
  }

  if (!isAuthenticated) {
    return null
  }

  return (
    <>
      <ToastContainer
        position='top-right'
        hideProgressBar
        containerId={'authGuard'}
      />
      <div className={`z-50 fixed inset-0 flex items-center justify-center bg-white/80 ${!visible ? 'hidden' : ''}`}>
        <Lottie animationData={loading} className="!w-[200px] !h-[200px]" />
      </div>
      <div className={`z-50 fixed inset-0 flex items-center justify-center bg-white/80 ${!commonVisible ? 'hidden' : ''}`}>
        <Lottie animationData={loading1} className="!w-[150px] !h-[150px]" />
      </div>
      {isRoleAllowed && children}
    </>
  )
}
