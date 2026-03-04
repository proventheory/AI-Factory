'use client'

// React Imports
import { useEffect, useState } from 'react'

// Next Imports
import Link from 'next/link'
import { useParams, useRouter, useSearchParams } from 'next/navigation'

// MUI Imports
import Typography from '@mui/material/Typography'
import IconButton from '@mui/material/IconButton'
import InputAdornment from '@mui/material/InputAdornment'
import Button from '@mui/material/Button'
import { styled, useTheme } from '@mui/material/styles'

// Third-party Imports
import classnames from 'classnames'

// Validation Imports
import type { InferInput } from 'valibot'
import { minLength, nonEmpty, object, pipe, string } from 'valibot'
import { valibotResolver } from '@hookform/resolvers/valibot'

// React Hook Form Imports
import { Controller, useForm } from 'react-hook-form'

// Component Imports
import { toast } from 'react-toastify'

import DirectionalIcon from '@components/DirectionalIcon'
import Logo from '@components/layout/shared/Logo'
import CustomTextField from '@core/components/mui/TextField'

import { useSettings } from '@core/hooks/useSettings'

import { getLocalizedUrl } from '@/utils/i18n'
import type { Locale } from '@/configs/i18n'
import { supabase } from '@/utils/supabase'

// Styled Custom Components
const ResetPasswordIllustration = styled('img')(({ theme }) => ({
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

// Type Definitions
type ErrorType = {
    message: string[]
}

type FormData = InferInput<typeof schema>

// Validation Schema
const schema = object({
    password: pipe(
        string(),
        nonEmpty('Password is required'),
        minLength(6, 'Password must be at least 6 characters long')
    ),
    c_password: pipe(
        string(),
        nonEmpty('Confirm Password is required'),
        minLength(6, 'Password must be at least 6 characters long')
    )
})

// Component
const ResetPassword = () => {
    const [isPasswordShown, setIsPasswordShown] = useState(false)
    const [isConfirmPasswordShown, setIsConfirmPasswordShown] = useState(false)
    const [errorState, setErrorState] = useState<ErrorType | null>(null)
    const router = useRouter()
    const searchParams = useSearchParams()
    const { lang: locale } = useParams()
    const { settings } = useSettings()
    const theme = useTheme()

    const {
        control,
        handleSubmit,
        formState: { errors }
    } = useForm<FormData>({
        resolver: valibotResolver(schema),
        defaultValues: {
            password: '',
            c_password: ''
        }
    })

    useEffect(() => {

        const refreshToken = async () => {

            const hashParams = new URLSearchParams(window.location.hash.substring(1));

            const access_token = hashParams.get("access_token");

            if (access_token) {
                console.log('access_token', access_token)
                const { error } = await supabase.auth.setSession({ access_token, refresh_token: access_token })

                if (error) toast.error(`The link is invalid or has expired.`, {
                    autoClose: 3000,
                    type: 'error'
                })
            }
        }

        refreshToken()

    }, [searchParams]);

    const onSubmit = async (formData: FormData) => {
        if (formData.password !== formData.c_password) {
            setErrorState({ message: ['Passwords do not match'] })

            return
        }

        const { error } = await supabase.auth.updateUser({ password: formData.password });

        if (error) {
            toast.error(`Update Password failed: ${error?.message}`, {
                autoClose: 3000,
                type: 'error'
            })
        } else {
            toast.success(`Password Successfully updated`, {
                autoClose: 3000,
                type: 'success'
            })
            setTimeout(() => router.push('/login'), 3000);
        }

        setErrorState(null)
    }

    const handleClickShowPassword = () => setIsPasswordShown(show => !show)
    const handleClickShowConfirmPassword = () => setIsConfirmPasswordShown(show => !show)

    return (
        <div className="flex bs-full justify-center">
            <div
                className={classnames(
                    'flex bs-full items-center justify-center flex-1 min-bs-[100dvh] relative p-6 max-md:hidden',
                    {
                        'border-ie': settings.skin === 'bordered'
                    }
                )}
            >
                <ResetPasswordIllustration
                    src="/images/illustrations/characters-with-objects/11.png"
                    alt="character-illustration"
                    className={classnames({ 'scale-x-[-1]': theme.direction === 'rtl' })}
                />
            </div>
            <div className="flex justify-center items-center bs-full bg-backgroundPaper !min-is-full p-6 md:!min-is-[unset] md:p-12 md:is-[480px]">
                <Link
                    href={getLocalizedUrl('/login', locale as Locale)}
                    className="absolute block-start-5 sm:block-start-[33px] inline-start-6 sm:inline-start-[38px]"
                >
                    <Logo />
                </Link>
                <div className="flex flex-col gap-6 is-full sm:is-auto md:is-full sm:max-is-[400px] md:max-is-[unset] mbs-11 sm:mbs-14 md:mbs-0">
                    <div className="flex flex-col gap-1">
                        <Typography variant="h4">Reset Password 🔒</Typography>
                        <Typography>Your new password must be different from previously used passwords</Typography>
                    </div>
                    <form
                        noValidate
                        autoComplete="off"
                        className="flex flex-col gap-6"
                        onSubmit={handleSubmit(onSubmit)}
                    >
                        <Controller
                            name="password"
                            control={control}
                            render={({ field }) => (
                                <CustomTextField
                                    autoFocus
                                    fullWidth
                                    label="New Password"
                                    placeholder="············"
                                    type={isPasswordShown ? 'text' : 'password'}
                                    InputProps={{
                                        endAdornment: (
                                            <InputAdornment position="end">
                                                <IconButton
                                                    edge="end"
                                                    onClick={handleClickShowPassword}
                                                    onMouseDown={e => e.preventDefault()}
                                                    aria-label="Toggle password visibility"
                                                >
                                                    <i className={isPasswordShown ? 'bx-hide' : 'bx-show'} />
                                                </IconButton>
                                            </InputAdornment>
                                        )
                                    }}
                                    onChange={e => {
                                        field.onChange(e.target.value)
                                        errorState && setErrorState(null)
                                    }}
                                    {...(errors.password && { error: true, helperText: errors.password.message })}
                                />
                            )}
                        />
                        <Controller
                            name="c_password"
                            control={control}
                            render={({ field }) => (
                                <CustomTextField
                                    fullWidth
                                    label="Confirm Password"
                                    placeholder="············"
                                    type={isConfirmPasswordShown ? 'text' : 'password'}
                                    InputProps={{
                                        endAdornment: (
                                            <InputAdornment position="end">
                                                <IconButton
                                                    edge="end"
                                                    onClick={handleClickShowConfirmPassword}
                                                    onMouseDown={e => e.preventDefault()}
                                                    aria-label="Toggle confirm password visibility"
                                                >
                                                    <i className={isConfirmPasswordShown ? 'bx-hide' : 'bx-show'} />
                                                </IconButton>
                                            </InputAdornment>
                                        )
                                    }}
                                    onChange={e => {
                                        field.onChange(e.target.value)
                                        errorState && setErrorState(null)
                                    }}
                                    {...(errors.c_password && { error: true, helperText: errors.c_password.message })}
                                />
                            )}
                        />
                        {errorState && (
                            <Typography color="error" variant="body2">
                                {errorState.message[0]}
                            </Typography>
                        )}
                        <Button fullWidth variant="contained" type="submit">
                            Set New Password
                        </Button>
                        <Typography className="flex justify-center items-center" color="primary">
                            <Link
                                href={getLocalizedUrl('/login', locale as Locale)}
                                className="flex items-center gap-1"
                            >
                                <DirectionalIcon ltrIconClass="bx-chevron-left" rtlIconClass="bx-chevron-right" />
                                <span>Back to Login</span>
                            </Link>
                        </Typography>
                    </form>
                </div>
            </div>
        </div>
    )
}

export default ResetPassword