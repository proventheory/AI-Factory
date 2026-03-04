// MUI Imports
import Grid from '@mui/material/Grid'

// Component Imports
import PromptEditor from '@/views/pages/admin/prompts/PromptEditor'

const Prompts = () => {
  return (
    <Grid container spacing={6}>
      <Grid item xs={12}>
        <PromptEditor />
      </Grid>
    </Grid>
  )
}

export default Prompts
