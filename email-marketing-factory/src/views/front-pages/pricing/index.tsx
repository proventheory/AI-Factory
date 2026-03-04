'use client'

import PaymentPlanSection from '../PaymentPlan'
import Footer from './pricingFooter'

const PricingWrapper = () => {
  return (
    <div className='bg-backgroundPaper'>
      <PaymentPlanSection isSection={false} />
      <Footer />
    </div>
  )
}

export default PricingWrapper
