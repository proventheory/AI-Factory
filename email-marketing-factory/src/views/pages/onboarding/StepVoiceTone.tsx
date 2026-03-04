import Grid from '@mui/material/Grid'
import Typography from '@mui/material/Typography'

import CustomTextField from '@core/components/mui/TextField'

type Props = {
  voicetone: string
  saveChange: (voicetone: string) => void
}

const StepVoiceTone = ({ voicetone, saveChange }: Props) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    saveChange(e.target.value)
  }

  return (
    <Grid container spacing={6}>
      <Grid item xs={12} lg={12} className='flex flex-col gap-6'>
        <div className='flex flex-col items-start gap-4'>
          <Typography variant='h6'>Voice/Tone</Typography>
          <CustomTextField className='p-5 max-sm:p-0' fullWidth size='medium' value={voicetone} onChange={handleChange} />
        </div>
      </Grid>
    </Grid>
  )
}

export default StepVoiceTone
