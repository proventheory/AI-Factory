'use client'

import { useState } from 'react'

import { useRouter } from 'next/navigation'

import { styled } from '@mui/material/styles'
import Card from '@mui/material/Card'
import Button from '@mui/material/Button'
import CardContent from '@mui/material/CardContent'
import Stepper from '@mui/material/Stepper'
import MuiStep from '@mui/material/Step'
import StepLabel from '@mui/material/StepLabel'
import Typography from '@mui/material/Typography'
import type { StepProps } from '@mui/material/Step'

import classnames from 'classnames'

import { v4 as uuidv4 } from 'uuid';
import { toast } from 'react-toastify'

import CustomAvatar from '@core/components/mui/Avatar'
import DirectionalIcon from '@/components/DirectionalIcon'

import StepLogo from './StepLogo'
import StepFont from './StepFont'
import StepBrandingColor from './StepBrandingColor'
import StepVoiceTone from './StepVoiceTone'
import StepSocialMedia from './StepSocialMedia'
import StepSitemap from './StepSitemap'

import StepperWrapper from '@core/styles/stepper'
import { supabase } from '@/utils/supabase'

import type { BrandColor } from './StepBrandingColor'
import StepAssets from './StepAssets'
import StepContact from './StepContact'
import { getSession } from '@/utils/queries'
import { success } from '@/utils/toasts'

export type UrlItem = {
  name: string
  link: string
}

export type Font = {
  color: string
  size: number
  fontFamily: string
}

export type SocialMedia = {
  UrlItem: []
}

export type OnboardingType = {
  logo: string
  fonts: Font[]
  brandColor: BrandColor
  voicetone: string
  imageUrls: string[]
  sitemap: { type: string, url: string }
  urls: UrlItem[]
  socialMedia: UrlItem[],
  contactInfo: { type: string, value: string }[]
}

// Vars
const steps = [
  { icon: 'bx-purchase-tag', title: 'Logo', subtitle: 'Choose logo of brand' },
  { icon: 'bx-font', title: 'Font', subtitle: 'Provide font details' },
  { icon: 'bx-palette', title: 'Color', subtitle: 'Choose Brand color' },
  { icon: 'bx-detail', title: 'Voice/Tone', subtitle: 'Provide the characteristic of brand' },
  { icon: 'bx-image', title: 'My assets', subtitle: 'Select picture that you want' },
  { icon: 'bx-link', title: 'Sitemap', subtitle: 'Sitemap URL to select products.' },
  { icon: 'bx-bxl-facebook', title: 'Social Media', subtitle: 'Link with social media' },
  { icon: 'bx-user', title: 'Contact', subtitle: 'Contact Infomation' }
]

const Step = styled(MuiStep)<StepProps>({
  '&:not(:has(.Mui-active)):not(:has(.Mui-completed)) .MuiAvatar-root, & .step-label .step-title': {
    color: 'var(--mui-palette-text-secondary)'
  },
  '& .step-label .step-subtitle': {
    color: 'var(--mui-palette-text-disabled)'
  },
  '&.Mui-completed .step-title , &.Mui-completed .step-subtitle': {
    color: 'var(--mui-palette-text-disabled)'
  },
  '& .Mui-active .step-title': {
    color: 'var(--mui-palette-primary-main)'
  },
  '& .Mui-active .step-label .step-subtitle': {
    color: 'var(--mui-palette-text-secondary)'
  }
})

const CreateDeal = () => {
  const router = useRouter()

  const [data, setData] = useState<OnboardingType>({
    logo: '',
    fonts: [
      { color: '#ffffff', size: 12, fontFamily: 'Arial' },
      { color: '#ffffff', size: 12, fontFamily: 'Arial' }
    ],
    brandColor: { primaryColor: ['#ffffff'], secondColor: ['#ffffff'] },
    voicetone: '',
    imageUrls: [],
    sitemap: { url: '', type: '' },
    urls: [],
    socialMedia: [],
    contactInfo: []
  })

  const [activeStep, setActiveStep] = useState(0)

  const handleNext = () => {
    if (activeStep !== steps.length - 1) {
      if (activeStep == 5 && (data.sitemap.url == '' || data.sitemap.type == ''))
        toast.error('Both sitemap url and type must be filled out.', { autoClose: 5000, type: 'warning' })
      else
        setActiveStep(activeStep + 1)
    } else {
      toast.success('The brand has been submitted successfully', { autoClose: 3000, type: 'success' })
    }
  }

  const handlePrev = () => {
    if (activeStep !== 0) {
      setActiveStep(activeStep - 1)
    }
  }

  const saveBrandColor = (color: BrandColor) => {
    setData({ ...data, brandColor: color })
  }

  const saveLogo = async (files: File[]) => {
    const selectedFile = files[0]

    const { data: result, error } = await supabase.storage.from('upload').upload(`logo/${uuidv4()}-${selectedFile.name.split('.').pop()}`, selectedFile)

    if (error) {
      console.error('Error uploading file:', error.message)
    } else {
      const { data: file } = await supabase.storage.from('upload').getPublicUrl(result?.path)

      setData({ ...data, logo: file.publicUrl })
    }
  }

  const saveFonts = (fonts: Font[]) => {
    setData({ ...data, fonts })
  }

  const saveVoicetone = (voicetone: string) => {
    setData({ ...data, voicetone })
  }

  const saveSitemap = (sitemap: { url: string, type: string }) => {
    setData({ ...data, sitemap })
  }

  const saveImages = (imageUrls: string[]) => {
    setData({ ...data, imageUrls })
  }

  const saveSocialMedia = (socialMedia: UrlItem[]) => {
    setData({ ...data, socialMedia })
  }

  const saveContactInfo = (contactInfo: { type: string, value: string }[]) => {
    setData({ ...data, contactInfo })
  }

  const onSubmit = async () => {

    const [session] = await Promise.all([getSession()])

    const { data: checkResult } = await supabase.from('profiles_brand').select('id').eq('user_id', session?.user.id)

    const { error } = await supabase
      .from('profiles_brand')
      .insert([
        { user_id: session?.user.id, is_default: checkResult && checkResult?.length > 0 ? false : true, data: data }
      ])

    if (error) {
      toast.error('Failed to create the new brand information.', { autoClose: 5000, type: 'warning', hideProgressBar: false })
      console.error('Error posting data:', error)
    } else {
      success('The brand was created successfully')
      router.push('/campaigns')
    }
  }

  const getStepContent = (step: number) => {
    switch (step) {
      case 0:
        return <StepLogo logo={data.logo} saveChange={saveLogo} />
      case 1:
        return <StepFont fonts={data.fonts} saveChange={saveFonts} />
      case 2:
        return <StepBrandingColor brandColor={data.brandColor} saveChange={saveBrandColor} />
      case 3:
        return <StepVoiceTone voicetone={data.voicetone} saveChange={saveVoicetone} />
      case 4:
        return <StepAssets imageUrls={data.imageUrls} saveChange={saveImages} />
      case 5:
        return <StepSitemap sitemap={data.sitemap} saveChange={saveSitemap} />
      case 6:
        return <StepSocialMedia socialMedia={data.socialMedia} saveChange={saveSocialMedia} />
      case 7:
        return <StepContact contactInfo={data.contactInfo} saveChange={saveContactInfo} />
      default:
        return null
    }
  }

  return (
    <Card className='flex flex-col md:flex-row'>
      <CardContent className='max-md:border-be md:border-ie md:min-is-[300px] md:max-w-[300px]'>
        <StepperWrapper>
          <Stepper
            activeStep={activeStep}
            orientation='vertical'
            connector={<></>}
            className='flex flex-col gap-4 min-is-[220px]'
          >
            {steps.map((label, index) => (
              <Step key={index} onClick={() => setActiveStep(index)}>
                <StepLabel icon={<></>} className='p-1 cursor-pointer'>
                  <div className='step-label'>
                    <CustomAvatar
                      variant='rounded'
                      skin={activeStep === index ? 'filled' : 'light'}
                      {...(activeStep >= index && { color: 'primary' })}
                      {...(activeStep === index && { className: 'shadow-primarySm' })}
                      size={38}
                    >
                      <i className={classnames('bx bxl-facebook', label.icon, '!text-[22px]')} />
                    </CustomAvatar>
                    <div className='flex flex-col'>
                      <Typography color='text.primary' className='step-title'>
                        {label.title}
                      </Typography>
                      <Typography className='step-subtitle'>{label.subtitle}</Typography>
                    </div>
                  </div>
                </StepLabel>
              </Step>
            ))}
          </Stepper>
        </StepperWrapper>
      </CardContent>
      <div className='flex flex-col flex-grow'>
        <CardContent className='flex-grow'>{getStepContent(activeStep)}</CardContent>
        <CardContent className='mt-auto' id='a3'>
          <div className='flex items-center justify-between'>
            <Button
              variant='tonal'
              color='secondary'
              disabled={activeStep === 0}
              onClick={handlePrev}
              startIcon={<DirectionalIcon ltrIconClass='bx-left-arrow-alt' rtlIconClass='bx-right-arrow-alt' />}
            >
              Previous
            </Button>
            <Button
              variant='contained'
              color={activeStep === steps.length - 1 ? 'success' : 'primary'}
              onClick={activeStep !== steps.length - 1 ? handleNext : onSubmit}
              endIcon={
                activeStep === steps.length - 1 ? (
                  <i className='bx-check' />
                ) : (
                  <DirectionalIcon ltrIconClass='bx-right-arrow-alt' rtlIconClass='bx-left-arrow-alt' />
                )
              }
            >
              {activeStep === steps.length - 1 ? 'Submit' : 'Next'}
            </Button>
          </div>
        </CardContent>
      </div>
    </Card>
  )
}

export default CreateDeal
