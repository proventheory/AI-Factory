// React Imports
import type { ReactElement } from 'react'

import dynamic from 'next/dynamic'

import AccountSettings from '@views/pages/account-settings'

const Billing_plans = dynamic(() => import('@/views/pages/account-settings/billing-plans'))

const tabContentList = (): { [key: string]: ReactElement } => ({
  billing: <Billing_plans />
})

const AccountSettingsPage = () => {
  return <AccountSettings tabContentList={tabContentList()} />
}

export default AccountSettingsPage
