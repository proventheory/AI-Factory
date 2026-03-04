'use client'

// Next Imports
import Link from 'next/link'
import { useParams } from 'next/navigation'

// MUI Imports
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'

// Type Imports
import type { Locale } from '@/configs/i18n'

// Util Imports
import { getLocalizedUrl } from '@/utils/i18n'

const NotAuthorized = () => {
  // Hooks
  const { lang: locale } = useParams()

  return (
    <div className='flex items-center flex-col text-center justify-center min-bs-[100dvh] p-6'>
      <div className='flex flex-col gap-2 is-[90vw] sm:is-[unset] mbe-6'>
        <Typography variant='h1' className='text-8xl'>
          401
        </Typography>
        <Typography variant='h4'>You are not authorized! 🔐</Typography>
        <Typography>You don&#39;t have permission to access this page. Go Home!</Typography>
      </div>
      <Button href={getLocalizedUrl('/', locale as Locale)} component={Link} variant='contained'>
        Back To Home
      </Button>
      <img
        alt='error-401-illustration'
        src='/images/illustrations/characters-with-objects/8.png'
        className='object-cover bs-[327px] sm:bs-[400px] md:bs-[450px] lg:bs-[500px] mbs-6'
      />
    </div>
  )
}

export default NotAuthorized
