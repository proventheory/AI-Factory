import Grid from '@mui/material/Grid'

import type { Metadata } from 'next'

import EmailPreview from '@/views/apps/campaigns/edit/preview'

export const metadata: Metadata = {
  title: 'FOCUZ - Preview Your Email Marketing Campaigns',
  description:
    'Enhance your email marketing with FOCUZ. Effortlessly design, preview, and optimize campaigns for all platforms. Improve engagement and conversions with streamlined tools. Start today!'
}


const CampaignPage = async ({ params }: { params: { slug: string } }) => {
  return (
    <Grid container spacing={6}>
     <EmailPreview emailId={params.slug} />
    </Grid>
  )
}

export default CampaignPage
