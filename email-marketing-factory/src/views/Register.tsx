'use client'

import { useState } from 'react'

import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'

import Typography from '@mui/material/Typography'
import IconButton from '@mui/material/IconButton'
import InputAdornment from '@mui/material/InputAdornment'
import Checkbox from '@mui/material/Checkbox'
import Button from '@mui/material/Button'
import FormControlLabel from '@mui/material/FormControlLabel'
import Divider from '@mui/material/Divider'
import { styled, useTheme } from '@mui/material/styles'

import { toast } from 'react-toastify'

import classnames from 'classnames'

import type { InferInput } from 'valibot'
import { email, minLength, nonEmpty, object, pipe, string } from 'valibot'
import type { SubmitHandler } from 'react-hook-form'
import { Controller, useForm } from 'react-hook-form'
import { valibotResolver } from '@hookform/resolvers/valibot'

import { getLocalizedUrl } from '@/utils/i18n'
import { supabase } from '@/utils/supabase'

import type { Locale } from '@configs/i18n'

import Logo from '@components/layout/shared/Logo'
import CustomTextField from '@core/components/mui/TextField'
import { success } from '@/utils/toasts'

const RegisterIllustration = styled('img')(({ theme }) => ({
  zIndex: 2,
  blockSize: 'auto',
  maxBlockSize: 600,
  maxInlineSize: '100%',
  margin: theme.spacing(12),
  [theme.breakpoints.down(1536)]: {
    maxBlockSize: 550
  },
  [theme.breakpoints.down('lg')]: {
    maxBlockSize: 450
  }
}))

type ErrorType = {
  message: string[]
}
type FormData = InferInput<typeof schema>

const schema = object({
  username: pipe(string(), nonEmpty('The userName is required')),
  email: pipe(string(), minLength(5, 'This email is required'), email('Email is invalid')),
  password: pipe(
    string(),
    nonEmpty('This Password is required'),
    minLength(5, 'Password must be at least 6 characters long')
  )
})

const Register = () => {
  const router = useRouter()
  const [isPasswordShown, setIsPasswordShown] = useState(false)
  const [errorState, setErrorState] = useState<ErrorType | null>(null)
  const { lang: locale } = useParams()
  const theme = useTheme()

  const {
    control,
    handleSubmit,
    formState: { errors }
  } = useForm<FormData>({
    resolver: valibotResolver(schema),
    defaultValues: {
      username: '',
      email: '',
      password: ''
    }
  })

  const handleClickShowPassword = () => setIsPasswordShown(show => !show)

  const onSubmit: SubmitHandler<FormData> = async (formData: FormData) => {
    const { data, error } = await supabase.auth.signUp({
      email: formData.email,
      password: formData.password,
      options: { data: { name: formData.username, role: 'user' } }
    })

    if (data && error === null) {

      await fetch('/api/klaviyo', { method: 'POST', body: JSON.stringify({ email: formData.email, first_name: formData.username.split(' ')[0], last_name: formData.username.split(' ')[1] }) })

      success('Sign up complete. Welcome aboard!')
      router.push('/login')
    } else {
      toast.error(`Sign up failed: ${error?.message}`, {
        autoClose: 3000,
        type: 'error'
      })
    }
  }

  const googleSignIn = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${location.origin}/api/auth/callback?type=register`,
      },
    })

    if (error) {
      toast.error(`Google Sign-In failed: ${error.message}`, {
        autoClose: 5000,
        type: 'error',
        hideProgressBar: false
      })
    }
  }

  return (
    <div className='flex bs-full justify-center'>
      <div className='flex bs-full items-center justify-center flex-1 min-bs-[100dvh] relative p-6 max-md:hidden'>
        <RegisterIllustration
          src='/images/illustrations/characters-with-objects/8.png'
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
            <Typography variant='h4'>Adventure starts here 🚀</Typography>
            <Typography>Make your app management easy and fun!</Typography>
          </div>
          <form
            noValidate
            autoComplete='off'
            action={() => { }}
            className='flex flex-col gap-6'
            onSubmit={handleSubmit(onSubmit)}
          >
            <Controller
              name='username'
              control={control}
              rules={{ required: true }}
              render={({ field }) => (
                <CustomTextField
                  {...field}
                  autoFocus
                  fullWidth
                  label='Username'
                  placeholder='Enter your username'
                  onChange={e => {
                    field.onChange(e.target.value)
                    errorState !== null && setErrorState(null)
                  }}
                  {...(errors.username && { error: true, helperText: errors.username.message })}
                />
              )}
            />
            <Controller
              name='email'
              control={control}
              rules={{ required: true }}
              render={({ field }) => (
                <CustomTextField
                  fullWidth
                  label='Email'
                  placeholder='Enter your email'
                  onChange={e => {
                    field.onChange(e.target.value)
                    errorState !== null && setErrorState(null)
                  }}
                  {...((errors.email || errorState !== null) && {
                    error: true,
                    helperText: errors?.email?.message || errorState?.message[0]
                  })}
                />
              )}
            />
            <Controller
              name='password'
              control={control}
              rules={{ required: true }}
              render={({ field }) => (
                <CustomTextField
                  fullWidth
                  label='Password'
                  placeholder='············'
                  type={isPasswordShown ? 'text' : 'password'}
                  InputProps={{
                    endAdornment: (
                      <InputAdornment position='end'>
                        <IconButton edge='end' onClick={handleClickShowPassword} onMouseDown={e => e.preventDefault()}>
                          <i className={isPasswordShown ? 'bx-hide' : 'bx-show'} />
                        </IconButton>
                      </InputAdornment>
                    )
                  }}
                  onChange={e => {
                    field.onChange(e.target.value)
                    errorState !== null && setErrorState(null)
                  }}
                  {...(errors.password && { error: true, helperText: errors.password.message })}
                />
              )}
            />
            <FormControlLabel
              control={<Checkbox />}
              label={
                <>
                  <span>I agree to </span>
                  <Link className='text-primary' href='/legal/privacy'>
                    Privacy policy
                  </Link>
                </>
              }
            />
            <Button fullWidth variant='contained' type='submit'>
              Sign Up
            </Button>
            <div className='flex justify-center items-center flex-wrap gap-2'>
              <Typography>Already have an account?</Typography>
              <Typography component={Link} href={getLocalizedUrl('/login', locale as Locale)} color='primary'>
                Sign in instead
              </Typography>
            </div>
            <Divider className='gap-2 text-textPrimary'>or</Divider>
            <div className='flex justify-center items-center gap-1.5'>
              <IconButton className='text-facebook' size='small'>
                <i className='bx-bxl-facebook-circle' />
              </IconButton>
              <IconButton className='text-twitter' size='small'>
                <i className='bx-bxl-twitter' />
              </IconButton>
              <IconButton className='text-textPrimary' size='small'>
                <i className='bx-bxl-github' />
              </IconButton>
              <IconButton className='text-error' size='small' onClick={googleSignIn}>
                <i className='bx-bxl-google' />
              </IconButton>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

export default Register
