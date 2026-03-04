'use client'

// React Imports
import { useEffect } from 'react'

// Component Imports
import HeroSection from './HeroSection'
import VideoSection from './VideoSection'
import Experts from './Experts'
import Customers from './Customers'

// import CustomersCard from './CustomersCard'

import Focus from './Focus'
import FocusCard from './FocusCard'
import GetStarted from './GetStarted'
import PaymentPlan from '../PaymentPlan'
import Faq from './Faq'

// import ContactUs from './ContactUs'

import { useSettings } from '@core/hooks/useSettings'

const LandingPageWrapper = () => {
  const { updatePageSettings } = useSettings()

  useEffect(() => {
    return updatePageSettings({
      skin: 'default'
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className='bg-backgroundPape bg-white'>
      <HeroSection />
      <VideoSection />
      <Experts />
      <Customers />
      <Focus />
      <FocusCard />
      <GetStarted />
      <PaymentPlan isSection={true} />
      <Faq />
    </div>
  )
}

export default LandingPageWrapper
