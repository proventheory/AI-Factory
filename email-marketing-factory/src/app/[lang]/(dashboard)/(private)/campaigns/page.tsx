import type { Metadata } from 'next'

import Grid from '@mui/material/Grid'

// import Info from '@views/apps/campaigns/info'

import CampaignListTable from '@views/apps/campaigns/CampaignListTable'

export const metadata: Metadata = {
  title: 'FOCUZ - Create and Manage Your Email Marketing Campaigns',
  description:
    'Design, launch, and optimize your email marketing campaigns with FOCUZ. Utilize AI tools to enhance targeting, increase engagement, and drive conversions effortlessly. Start crafting your next successful campaign today.'
}

const Campaigns = async () => {

  return (
    <Grid container spacing={6}>
     
      <Grid item xs={12}>
        <CampaignListTable  />
      </Grid>
    </Grid>
  )
}

export default Campaigns
