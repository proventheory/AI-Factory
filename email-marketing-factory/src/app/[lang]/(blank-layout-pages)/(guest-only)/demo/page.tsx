
import type { Metadata } from 'next'

import DemoPage from '@views/demo'

export const metadata: Metadata = {
  title: 'Effortless Email Marketing',
  description: 'Experience seamless brand engagement with our AI-powered platform. Create perfect emails easily with our interactive demo.'
}

const Demo = () => {


  return <DemoPage />
}

export default Demo
