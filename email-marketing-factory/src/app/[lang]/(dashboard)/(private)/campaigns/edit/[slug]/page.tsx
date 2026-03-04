import type { Metadata } from 'next'

import EmailEdit from '@/views/apps/campaigns/edit/edit'

export const metadata: Metadata = {
  title: 'FOCUZ - Edit Your Email Marketing Campaigns',
  description:
    'Streamline your email campaigns with FOCUZ. Easily edit and customize your marketing emails for maximum impact and engagement. Start refining your campaigns today!'
}

const EmailEditPage = ({ params }: { params: { slug: string } }) => {
  console.log(params.slug)

  return <EmailEdit emailId={ params.slug} />
}

export default EmailEditPage
