import type { Metadata } from 'next'

import BrandEdit from '@/views/pages/brand/edit'

export const metadata: Metadata = {
  title: 'FOCUZ - Edit Your Brand',
  description:
    'Refine and enhance your brand with FOCUZ. Easily edit and update your brand elements to maintain consistency and impact. Elevate your brand identity today!'
}

const BrandEditPage = ({ params }: { params: { slug: string } }) => {
  
  return <BrandEdit brandId={ params.slug} />
}

export default BrandEditPage
