import Grid from '@mui/material/Grid'

import CurrentPlan from './CurrentPlan'


const BillingPlans = async () => {
  
  return (
    <Grid container spacing={6}>
      <Grid item xs={12}>
        <CurrentPlan />
      </Grid>
    </Grid>
  )
}

export default BillingPlans
