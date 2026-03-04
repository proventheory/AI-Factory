// MUI Imports
import Grid from '@mui/material/Grid'

import SectionAnalyzer from '@/views/pages/admin/section/SectionAnalyzer'

const section = () => {
  return (
    <Grid container spacing={6}>
      <Grid item xs={12}>
        <SectionAnalyzer />
      </Grid>
    </Grid>
  )
}

export default section
