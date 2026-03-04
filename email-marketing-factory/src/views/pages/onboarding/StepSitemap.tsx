import Grid from '@mui/material/Grid'

import { MenuItem } from '@mui/material'

import CustomTextField from '@core/components/mui/TextField'

type Props = {
  sitemap: { url: string, type: string }
  saveChange: (sitemap: { url: string, type: string }) => void
}

const StepSitemap = ({ sitemap, saveChange }: Props) => {
  const handleUrl = (e: React.ChangeEvent<HTMLInputElement>) => {
    saveChange({ url: e.target.value, type: sitemap.type })
  }

  const handleType = (e: React.ChangeEvent<HTMLInputElement>) => {
    saveChange({ type: e.target.value, url: sitemap.url })
  }

  return (
    <Grid container spacing={6}>
      <Grid item xs={12} lg={12} className='flex flex-col gap-6'>
        <div className='grid grid-cols-1 sm:grid-cols-4 items-center gap-4'>
          <CustomTextField fullWidth size='medium' value={sitemap.type} defaultValue='' label='Type' onChange={handleType} className='col-span-1' select>
            <MenuItem value='shopify'>Shopify</MenuItem>
            <MenuItem value='drupal'>Drupal</MenuItem>
            <MenuItem value='ecommerce'>WooCommerce</MenuItem>
            <MenuItem value='bigcommerce'>BigCommerce</MenuItem>
          </CustomTextField>
          <CustomTextField fullWidth size='medium' value={sitemap.url} label='URL' onChange={handleUrl} className='sm:col-span-3 col-span-1' />
        </div>
      </Grid>
    </Grid>
  )
}

export default StepSitemap
