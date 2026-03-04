// Component Imports
import type { Metadata } from 'next'

import Onboarding from '@views/pages/onboarding'



/**
 * ! If you need data using an API call, uncomment the below API code, update the `process.env.API_URL` variable in the
 * ! `.env` file found at root of your project and also update the API endpoints like `/pages/pricing` in below example.
 * ! Also, remove the above server action import and the action itself from the `src/app/server/actions.ts` file to clean up unused code
 * ! because we've used the server action for getting our static data.
 */

/* const getPricingData = async () => {
  // Vars
  const res = await fetch(`${process.env.API_URL}/pages/pricing`)

  if (!res.ok) {
    throw new Error('Failed to fetch data')
  }

  return res.json()
} */


export const metadata: Metadata = {
  title: 'FOCUZ - Easy Onboarding for Effective Email Marketing',
  description: 'Get started with FOCUZ in minutes. Our intuitive onboarding process helps you set up your account, integrate your data, and launch your first AI-optimized email campaign quickly and easily. Join now and see the difference.'
}

const PricePage = async () => {
  // Vars

  return <Onboarding />
}

export default PricePage
