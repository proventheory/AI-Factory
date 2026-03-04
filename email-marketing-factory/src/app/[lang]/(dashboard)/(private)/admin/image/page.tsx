// MUI Imports
import Grid from '@mui/material/Grid'

import ImageAnalyzer from '@/views/pages/admin/image/ImageAnalyzer'

const section = () => {
  return (
    <Grid container spacing={6}>
      <Grid item xs={12}>
        <ImageAnalyzer />
      </Grid>
    </Grid>
  )
}

export default section
