// React Imports
import { useState } from 'react'

// MUI Imports
import Grid from '@mui/material/Grid'
import Box from '@mui/material/Box'
import Avatar from '@mui/material/Avatar'
import CircularProgress from '@mui/material/CircularProgress'
import Typography from '@mui/material/Typography'
import { styled } from '@mui/material/styles'
import type { BoxProps } from '@mui/material/Box'

// Third-party Imports
import { useDropzone } from 'react-dropzone'

// Styled Component Imports
import AppReactDropzone from '@/libs/styles/AppReactDropzone'

const Dropzone = styled(AppReactDropzone)<BoxProps>(({ theme }) => ({
  '& .dropzone': {
    minHeight: 'unset',
    padding: theme.spacing(12),
    [theme.breakpoints.down('sm')]: {
      paddingInline: theme.spacing(5)
    },
    '&+.MuiList-root .MuiListItem-root .file-name': {
      fontWeight: theme.typography.body1.fontWeight
    }
  }
}))

type Props = {
  logo: string,
  saveChange: (files: File[]) => void
}

const StepLogo = ({ logo, saveChange }: Props) => {
  const [loading, setLoading] = useState(false);

  const { getRootProps, getInputProps } = useDropzone({
    multiple: false,
    accept: {
      'image/*': ['.png', '.jpg', '.jpeg', '.gif']
    },
    onDrop: async (acceptedFiles: File[]) => {
      setLoading(true);
      await saveChange(acceptedFiles.map((file: File) => Object.assign(file)))
      setLoading(false);
    }
  })

  const img = <img key='logo' alt='logo' className='single-file-image' style={{height: '100%', objectFit: 'contain'}} src={logo} />

  return (
    <Grid container spacing={6}>
      <Grid item xs={12} lg={12} className='flex flex-col gap-6'>
        <Dropzone>
          <Box {...getRootProps({ className: 'dropzone' })} {...({ sx: { height: 350, display: 'flex', justifyContent: 'center', alignItems: 'center'} })}>
            <input {...getInputProps()} />
            {loading ? (
              <CircularProgress />
            ) : logo !== '' ? (
              img
            ) : (
              <div className='flex items-center flex-col'>
                <Avatar variant='rounded' className='bs-12 is-12 mbe-9'>
                  <i className='bx-upload' />
                </Avatar>
                <Typography variant='h4' className='mbe-2.5'>
                  Drop logo here or click to upload.
                </Typography>
                <Typography color='text.secondary'>
                  Drop logo here or click{' '}
                  <a href='/' onClick={e => e.preventDefault()} className='text-textPrimary no-underline'>
                    browse
                  </a>{' '}
                  thorough your machine
                </Typography>
              </div>
            )}
          </Box>
        </Dropzone>
      </Grid>
    </Grid>
  )
}

export default StepLogo
