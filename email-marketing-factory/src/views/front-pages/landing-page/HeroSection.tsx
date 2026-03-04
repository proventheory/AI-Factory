'use client'

import { useState } from 'react'

import Image from 'next/image'

import { useRouter } from 'next/navigation'

import Rating from '@mui/material/Rating'

import Button from '@mui/material/Button'
import { styled } from '@mui/material/styles'

import classnames from 'classnames'

import TextField from '@mui/material/TextField'

import { Typography } from '@mui/material'

import { toast } from 'react-toastify'

import frontCommonStyles from '@views/front-pages/styles.module.css'

const CustomRating = styled(Rating)`
  & .MuiRating-icon {
    margin-right: 4px;
  }
`

const HeroSection = () => {

  const [emailTypeError, setEmailTypeError] = useState(false)
  const [email, setEmail] = useState<string>("")

  const router = useRouter()

  const emailHandle = async () => {

    const emailPattern = /^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$/;

    if (!emailPattern.test(email))

      setEmailTypeError(true)

    else {

      setEmailTypeError(false)

      const res = await fetch('/api/klaviyo', {
        method: 'POST',
        body: JSON.stringify({ email })
      })

      if (res.ok) {
        toast.success(`Success to submit`, {
          autoClose: 3000,
          type: 'success'
        })

        setEmail("")
      } else {
        toast.warning(`Fail to submit`, {
          autoClose: 3000,
          type: 'warning'
        })
      }

      router.push('/pricing')
    }

  }

  return (
    <section id='herosection'>
      <div
        className={classnames(
          'pbs-[48px] sm:pbs-[64px] lg:pbs-[132px] overflow-hidden pb-[142px] max-md:pb-[90px]',
          frontCommonStyles.layoutSpacing
        )}
      >
        <div className='lg:hidden grid grid-cols-4 w-[90%] m-auto'>
          <div className='grid justify-center '>
            <Image
              src='/images/logos/shopify.svg'
              alt='Shopify logo'
              width={100}
              height={100}
              className='w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24'
              loading='lazy'
            />
          </div>
          <div className='grid justify-center '>
            <Image
              src='/images/logos/ribon.svg'
              alt='Ribon logo'
              width={100}
              height={100}
              className='w-16 h-16 sm:w-20 sm:h-20 mt-3 sm:mt-5  md:w-24 md:h-24'
              loading='lazy'
            />
          </div>
          <div className='grid justify-center '>
            <Image
              src='/images/logos/woo.svg'
              alt='Woo logo'
              width={100}
              height={100}
              className='w-16 h-16 sm:w-20 sm:h-20  md:w-24 md:h-24'
              loading='lazy'
            />
          </div>
          <div className='grid justify-center '>
            <Image
              src='/images/logos/mailchimp.svg'
              alt='Mailchimp logo'
              width={100}
              height={100}
              className='w-16 h-16 sm:w-20 sm:h-20 mt-9 sm:mt-12  md:w-24 md:h-24'
              loading='lazy'
            />
          </div>
        </div>
        <div className='grid grid-cols-1 lg:grid-cols-3 pbs-[48px] sm:pbs-[64px] lg:pbs-0'>
          <div className='grid-cols-1 lg:col-span-2 flex flex-col text-center lg:text-left'>
            <div className='flex gap-2 items-center justify-center lg:justify-start'>
              <CustomRating value={5} readOnly size='small' />
              <Typography className='text-xs text-[#878787]'>
                Based on <span style={{ color: '#3751DC' }}>1,000+</span> reviews
              </Typography>
            </div>
            <div
              className='2xl:text-7xl md:text-6xl sm:text-5xl text-3xl mt-[22px] text-black font-Geomanist font-normal lg:tracking-tighter'
              style={{ WebkitTextStroke: '1px black' }}
            >
              / Simplify email marketing <br />
              for eCommerce with AI
            </div>
            <h1 className='w-full sm:w-[509px] mt-[32px] text-black font-Helvetica mx-auto lg:mx-0 font-normal'>
              Focuz empowers eCommerce brands and marketing agencies to create and convert more emails, faster. With
              seamless integration into major eCommerce CRMs & ESPs, you can focus on what really matters—growing your
              business and driving conversions.
            </h1>
            <div className='mt-[30px] lg:mt-[55px] mx-auto lg:mx-0 justify-center lg:justify-start w-[80%] sm:w-[550px] lg:w-[75%]'>
              <div className='flex flex-col sm:flex-row gap-4 items-center'>
                <div className='sm:w-[170px] text-center px-4'>
                  <div
                    className='border-l-[3px] border-blue-500 text-blue-500 pl-[10px] md:w-[150px] text-[12px] h-[20px] sm:h-[30px] text-mi'
                    style={{ color: '#3751DC', borderColor: '#3751Dc' }}
                  >
                    &quot;Email marketing has never been easier.&quot;
                  </div>
                </div>
                <TextField
                  required
                  placeholder='name@email.com'
                  className='w-full flex-1'
                  onChange={(e) => { setEmail(e.target.value) }}
                  value={email}
                  error={emailTypeError}
                  helperText={emailTypeError ? "Please enter correct address." : ""}
                  InputProps={{
                    sx: { borderRadius: '100px', borderColor: '#DEDFE3', borderWidth: '1px', borderStyle: 'solid', color: '#656768' }
                  }}
                  inputProps={{
                    type: 'email',
                    sx: {
                      textAlign: 'center',
                      borderRadius: '100px',
                      height: { xs: '16px', sm: '32px' },
                      padding: { xs: '0 8px', sm: '0 16px' },
                      '&::placeholder': {
                        color: '#656768'
                      },
                    }
                  }}
                />
                <Button
                  variant='contained'
                  className='text-lg w-full flex-1 font-Helvetica hover:bg-primary rounded-[100px]'
                  onClick={emailHandle}
                  sx={{
                    background: '#3751DC',
                    height: { xs: '48px', sm: '64px' },
                    minHeight: { xs: '48px', sm: '64px' },
                    lineHeight: { xs: '48px', sm: '64px' },
                    padding: 0,
                    '& .MuiButton-label': {
                      lineHeight: { xs: '48px', sm: '64px' }
                    }
                  }}
                >
                  Try for Free
                </Button>
              </div>
            </div>
          </div>
          <div className='hidden lg:block'>
            <div className='grid grid-cols-2'>
              <div className='flex justify-end'>
                <img src='/images/logos/shopify.svg' alt='Shopify logo' className='w-26 h-26 mr-4' loading='lazy' />
              </div>
              <div></div>
              <div></div>
              <div className='flex justify-end'>
                <img src='/images/logos/ribon.svg' alt='Ribon logo' className='w-26 h-26 mr-4' loading='lazy' />
              </div>
              <div className='flex justify-end'>
                <img src='/images/logos/woo.svg' alt='Woo logo' className='w-26 h-26' loading='lazy' />
              </div>
              <div></div>
              <div></div>
              <div className='flex justify-end'>
                <img src='/images/logos/mailchimp.svg' alt='Mailchimp logo' className='w-26 h-26' loading='lazy' />
              </div>
            </div>
          </div>
        </div>

        <div className='flex flex-col sm:flex-row items-center gap-4 sm:gap-8 lg:gap-16 py-4 mt-8 lg:mt-14 justify-center lg:justify-start'>
          <Image src={'/images/logos/bussiness.svg'} alt={'business'} loading='lazy' width={185} height={16} />
          <Image src={'/images/logos/yahoo.svg'} alt={'yahoo'} loading='lazy' width={100} height={28} />
          <Image src={'/images/logos/msn.svg'} alt={'msn'} loading='lazy' width={71} height={31} />
        </div>
      </div>
    </section>
  )
}

export default HeroSection
