import type{ Metadata } from 'next'

import ProductAdd from '@/views/apps/campaigns/add/product/ProductAdd'

export const metadata: Metadata = {
  title: 'FOCUZ - Create and Manage Your Email Marketing Campaigns',
  description:
    'Design, launch, and optimize your email marketing campaigns with FOCUZ. Utilize AI tools to enhance targeting, increase engagement, and drive conversions effortlessly. Start crafting your next successful campaign today.'
}

const demoAdd = ({ params }: { params: { slug: string } }) => {
  return <ProductAdd template_id={ params.slug} />
}

export default demoAdd
