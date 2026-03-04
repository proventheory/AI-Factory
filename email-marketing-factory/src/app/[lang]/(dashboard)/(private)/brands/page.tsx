import type { Metadata } from 'next'

import Brands from '@/views/pages/brand'

export const metadata: Metadata = {
  title: 'FOCUZ - Create and Manage Your Brand',
  description:
    'Build and maintain your brand effortlessly with FOCUZ. Create impactful campaigns and manage your brand identity seamlessly. Start shaping your brand today!'
}

const BrandsPage = () => {
  return <Brands />
}

export default BrandsPage
