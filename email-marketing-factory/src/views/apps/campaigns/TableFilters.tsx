// React Imports
import { useState, useEffect } from 'react'

// MUI Imports
import Grid from '@mui/material/Grid'
import CardContent from '@mui/material/CardContent'
import MenuItem from '@mui/material/MenuItem'

// Type Imports
// Component Imports
import CustomTextField from '@core/components/mui/TextField'
import type { Campaign } from '@/types/apps/campaignTypes'

const TableFilters = ({ setData, productData }: { setData: (data: Campaign[]) => void; productData?: Campaign[] }) => {
  // States
  const [category, setCategory] = useState<Campaign['category']>('')
  const [custom, setCustom] = useState('')
  const [status, setStatus] = useState<Campaign['status']>('')

  useEffect(
    () => {
      const filteredData = productData?.filter(product => {
        if (category && product.category !== category) return false
        if (status && product.status !== status) return false

        return true
      })

      setData(filteredData ?? [])
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [category, custom, status, productData]
  )

  return (
    <CardContent>
      <Grid container spacing={6}>
        <Grid item xs={12} sm={4}>
          <CustomTextField
            select
            fullWidth
            id='select-status'
            value={status}
            onChange={e => setStatus(e.target.value)}
            SelectProps={{ displayEmpty: true }}
          >
            <MenuItem value=''>Select Status</MenuItem>
            <MenuItem value='Scheduled'>Scheduled</MenuItem>
            <MenuItem value='Sent'>Sent</MenuItem>
            <MenuItem value='Draft'>Draft</MenuItem>
          </CustomTextField>
        </Grid>
        <Grid item xs={12} sm={4}>
          <CustomTextField
            select
            fullWidth
            id='select-category'
            value={category}
            onChange={e => setCategory(e.target.value)}
            SelectProps={{ displayEmpty: true }}
          >
            <MenuItem value=''>Select Category</MenuItem>
            <MenuItem value='Product Offers'>Product Offers</MenuItem>
            <MenuItem value='Newsletter Email(s)'>Newsletter Email(s)</MenuItem>
            <MenuItem value='Social Proof Email(s)'>Social Proof Email(s)</MenuItem>
            <MenuItem value='New Blog Email(s)'>New Blog Email(s)</MenuItem>
            <MenuItem value='Welcome Email(s)'>Welcome Email(s)</MenuItem>
            <MenuItem value='Onboarding Email(s)'>Onboarding Email(s)</MenuItem>
            <MenuItem value='Cart Abandonment Email(s)'>Cart Abandonment Email(s)</MenuItem>
            <MenuItem value='Browse Abandonment Email(s)'>Browse Abandonment Email(s)</MenuItem>
            <MenuItem value='Post Purchase Email(s)'>Post Purchase Email(s)</MenuItem>
            <MenuItem value='Winback Email(s)'>Winback Email(s)</MenuItem>
          </CustomTextField>
        </Grid>
        <Grid item xs={12} sm={4}>
          <CustomTextField
            select
            fullWidth
            id='custom'
            onChange={e => setCustom(e.target.value as string)}
            SelectProps={{ displayEmpty: true }}
          >
            <MenuItem value=''>Select Custom</MenuItem>
            <MenuItem value='custom1'>custom1</MenuItem>
            <MenuItem value='custom2'>custom2</MenuItem>
          </CustomTextField>
        </Grid>
      </Grid>
    </CardContent>
  )
}

export default TableFilters
