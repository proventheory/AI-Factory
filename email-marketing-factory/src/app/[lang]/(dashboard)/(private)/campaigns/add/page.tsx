import type { Metadata } from 'next'

import type { campaignType } from '@/types/apps/campaignTypes'

import CampaignAdd from '@/views/apps/campaigns/add/CampaignAdd'

import { campaignData } from '@/utils/campaignData'

export const metadata: Metadata = {
  title: 'FOCUZ - Select the Perfect Email Campaign Type for Your Goals',
  description:
    'Discover a variety of email campaign types with FOCUZ. Choose the ideal campaign type and start creating success today.'
}

const demoAdd = () => {
  const data: campaignType[] = campaignData

  return <CampaignAdd campaignTypeData={data} />
}

export default demoAdd  
