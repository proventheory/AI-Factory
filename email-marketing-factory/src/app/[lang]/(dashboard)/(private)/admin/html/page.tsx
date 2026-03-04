// MUI Imports
import Grid from '@mui/material/Grid'

import HtmlGenerator from '@/views/pages/admin/html/HtmlGenerator'

const section = () => {
  return (
    <Grid container spacing={6}>
      <Grid item xs={12}>
        <HtmlGenerator />
      </Grid>
    </Grid>
  )
}

export default section
