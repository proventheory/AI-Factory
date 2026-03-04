'use client'

import { useState } from 'react'

import Link from 'next/link'
import { useParams } from 'next/navigation'

import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import { styled, useTheme } from '@mui/material/styles'

import classnames from 'classnames'
import { toast } from 'react-toastify'

import type { Locale } from '@configs/i18n'
import DirectionalIcon from '@components/DirectionalIcon'
import Logo from '@components/layout/shared/Logo'
import CustomTextField from '@core/components/mui/TextField'

import { getLocalizedUrl } from '@/utils/i18n'
import { supabase } from '@/utils/supabase'

const ForgotPasswordIllustration = styled('img')(({ theme }) => ({
  zIndex: 2,
  blockSize: 'auto',
  maxBlockSize: 650,
  maxInlineSize: '100%',
  margin: theme.spacing(12),
  [theme.breakpoints.down(1536)]: {
    maxBlockSize: 550
  },
  [theme.breakpoints.down('lg')]: {
    maxBlockSize: 450
  }
}))

const ForgotPassword = () => {
  const { lang: locale } = useParams()
  const theme = useTheme()

  const [email, setEmail] = useState<string>('')
  const [error, setError] = useState<string>('')

  const handleSubmit = async () => {
    if (!email) {
      setError('Email is required!')

      return
    }

    if (!/\S+@\S+\.\S+/.test(email)) {
      setError('Please enter a valid email address.')

      return
    }

    setError('')

    try {

      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: 'https://focuz.ai/update-password' })

      if (error) toast.error(`Email Submit Failed: ${error?.message}`, {
        autoClose: 3000,
        type: 'error'
      })
      else {
        setEmail('')
        toast.success(`Confirm the link in your mailbox.`, {
          autoClose: 3000,
          type: 'success'
        })
      }

    } catch (err) {
      console.error('Error while sending reset link:', err)
      setError('Something went wrong. Please try again.')
    }
  }

  return (
    <div className='flex bs-full justify-center'>
      {/* Left Illustration Section */}
      <div className='flex bs-full items-center justify-center flex-1 min-bs-[100dvh] relative p-6 max-md:hidden'>
        <ForgotPasswordIllustration
          src='/images/illustrations/characters-with-objects/10.png'
          alt='character-illustration'
          className={classnames({ 'scale-x-[-1]': theme.direction === 'rtl' })}
        />
      </div>

      <div className='flex justify-center items-center bs-full bg-backgroundPaper !min-is-full p-6 md:!min-is-[unset] md:p-12 md:is-[480px]'>
        <Link
          href={getLocalizedUrl('/login', locale as Locale)}
          className='absolute block-start-5 sm:block-start-[33px] inline-start-6 sm:inline-start-[38px]'
        >
          <Logo />
        </Link>

        <div className='flex flex-col gap-6 is-full sm:is-auto md:is-full sm:max-is-[400px] md:max-is-[unset] mbs-11 sm:mbs-14 md:mbs-0'>
          <div className='flex flex-col gap-1'>
            <Typography variant='h4'>Forgot Password 🔒</Typography>
            <Typography>
              Enter your email and we&#39;ll send you instructions to reset your password
            </Typography>
          </div>

          <form
            noValidate
            autoComplete='off'
            onSubmit={e => {
              e.preventDefault()
              handleSubmit()
            }}
            className='flex flex-col gap-6'
          >
            <CustomTextField
              autoFocus
              fullWidth
              label='Email'
              placeholder='Enter your email'
              type='email'
              value={email}
              onChange={e => setEmail(e.target.value)}
              error={!!error}
              helperText={error}
            />

            <Button fullWidth variant='contained' type='submit'>
              Send reset link
            </Button>

            <Typography className='flex justify-center items-center' color='primary'>
              <Link
                href={getLocalizedUrl('/login', locale as Locale)}
                className='flex items-center gap-1.5'
              >
                <DirectionalIcon
                  ltrIconClass='bx-chevron-left'
                  rtlIconClass='bx-chevron-right'
                  className='text-xl'
                />
                <span>Back to Login</span>
              </Link>
            </Typography>
          </form>
        </div>
      </div>
    </div>
  )
}

export default ForgotPassword