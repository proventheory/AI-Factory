// MUI Imports
import Grid from '@mui/material/Grid'

// Component Imports
import EmailGenerator from '@/views/pages/admin/prompts/EmailGenerator'

const Prompts = () => {
  return (
    <Grid container spacing={6}>
      <Grid item xs={12}>
        <EmailGenerator />
      </Grid>
    </Grid>
  )
}

export default Prompts
