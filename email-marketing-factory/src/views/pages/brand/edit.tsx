'use client'

import React, { useCallback, useEffect, useState } from 'react'

import { useRouter } from 'next/navigation'

import {
  CardContent,
  Card,
  Typography,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogActions,
  Avatar,
  Box
} from '@mui/material'

import Button from '@mui/material/Button'

import Grid from '@mui/material/Grid'

import { useDropzone } from 'react-dropzone'

import { styled } from '@mui/material/styles'

import type { BoxProps } from '@mui/material/Box'

import { toast } from 'react-toastify'

import AppReactDropzone from '@/libs/styles/AppReactDropzone'

import StepFont from '@views/pages/onboarding/StepFont'

import StepVoiceTone from '@views/pages/onboarding/StepVoiceTone'

// import StepURLs from '@views/pages/onboarding/StepURLs'

import StepSocialMedia from '@views/pages/onboarding/StepSocialMedia'

import StepBrandingColor from '@views/pages/onboarding/StepBrandingColor'

import type { OnboardingType, Font, UrlItem } from '../onboarding'

import type { BrandColor } from '@views/pages/onboarding/StepBrandingColor'

import { supabase } from '@/utils/supabase'
import StepSitemap from '../onboarding/StepSitemap'
import StepAssets from '../onboarding/StepAssets'
import StepContact from '../onboarding/StepContact'
import { success } from '@/utils/toasts'

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
  brandId: string
}

const BrandEdit = ({ brandId }: Props) => {
  const router = useRouter()
  const [loading, setLoading] = useState(true)

  const [imageLoading, setImageLoading] = useState(false)

  const [tmpLogo, setTmpLogo] = useState<string>('')

  const [open, setOpen] = useState<boolean>(false)

  const handleClickOpen = () => {
    setOpen(true)
    setTmpLogo('')
  }

  const handleClose = () => setOpen(false)

  const [brandInfo, setData] = useState<OnboardingType>({
    logo: '',
    fonts: [
      { color: '#87092f', size: 12, fontFamily: 'Arial' },
      { color: '#87092f', size: 12, fontFamily: 'Arial' }
    ],
    brandColor: { primaryColor: [], secondColor: [] },
    voicetone: '',
    imageUrls: [],
    sitemap: { url: '', type: '' },
    urls: [],
    socialMedia: [],
    contactInfo: []
  })

  const getBrandData = useCallback(async () => {
    setLoading(true)

    try {
      const { data: brandData, error } = await supabase.from('profiles_brand').select('data').eq('id', brandId)

      if (error) throw error

      if (brandData && brandData.length > 0) {
        setData(brandData[0].data as OnboardingType)
      }

      console.log(brandData[0].data)
    } catch (error) {
      console.error('Error fetching brand data:', error)
    } finally {
      setLoading(false)
    }
  }, [brandId])

  const handleSave = async () => {
    const { error } = await supabase.from('profiles_brand').update({ data: brandInfo, updated_at: new Date().toISOString() }).eq('id', brandId)

    if (error) {
      toast.error('Updating the brand information failed. Please try again.', { autoClose: 5000, type: 'warning' })
      console.error('updateing brard info', error)
    }

    success('The brand information has been successfully updated.')
    getBrandData()
  }

  useEffect(() => {
    getBrandData()
  }, [getBrandData])

  const saveFonts = (fonts: Font[]) => {
    setData({ ...brandInfo, fonts })
  }

  const saveBrandColor = (color: BrandColor) => {
    setData({ ...brandInfo, brandColor: color })
  }

  const saveVoicetone = (voicetone: string) => {
    setData({ ...brandInfo, voicetone })
  }

  const saveImages = (imageUrls: string[]) => {
    setData({ ...brandInfo, imageUrls })
  }

  const saveSitemap = (sitemap: { url: string, type: string }) => {
    setData({ ...brandInfo, sitemap })
  }

  const saveSocialMedia = (socialMedia: UrlItem[]) => {
    setData({ ...brandInfo, socialMedia })
  }

  const saveContactInfo = (contactInfo: { type: string, value: string }[]) => {
    setData({ ...brandInfo, contactInfo })
  }

  const previewLogo = async (files: File[]) => {
    const selectedFile = files[0]

    const { data: result, error } = await supabase.storage
      .from('upload')
      .upload(`logo/${Date.now()}-${selectedFile.name.split('.').pop()}`, selectedFile)

    if (error) {
      console.error('Error uploading file:', error.message)
    } else {
      const { data: file } = await supabase.storage.from('upload').getPublicUrl(result?.path)

      setTmpLogo(file.publicUrl)
    }
  }

  const deleteLogo = async (publicUrl: string) => {
    const { error } = await supabase.storage.from('upload').remove([`${publicUrl.split('upload/')[1]}`])

    if (error) {
      console.error('Error delete file:', error.message)
    }
  }

  const saveLogo = (publicUrl: string) => {
    if (brandInfo.logo !== '') deleteLogo(brandInfo.logo)

    setData({ ...brandInfo, logo: publicUrl })
  }

  const stepContent = (step: number) => {
    switch (step) {
      case 0:
        return <StepFont fonts={brandInfo.fonts} saveChange={saveFonts} />
      case 1:
        return <StepBrandingColor brandColor={brandInfo.brandColor} saveChange={saveBrandColor} />
      case 2:
        return <StepVoiceTone voicetone={brandInfo.voicetone} saveChange={saveVoicetone} />
      case 3:
        return <StepAssets imageUrls={brandInfo.imageUrls ? brandInfo.imageUrls : []} saveChange={saveImages} />
      case 4:
        return <StepSitemap sitemap={brandInfo.sitemap} saveChange={saveSitemap} />
      case 5:
        return <StepSocialMedia socialMedia={brandInfo.socialMedia} saveChange={saveSocialMedia} />
      case 6:
        return <StepContact contactInfo={brandInfo.contactInfo} saveChange={saveContactInfo} />
      default:
        return null
    }
  }

  const img = (
    <img
      key='logo'
      alt='logo'
      className='single-file-image'
      style={{ height: '100%', objectFit: 'contain' }}
      src={tmpLogo}
    />
  )

  const { getRootProps, getInputProps } = useDropzone({
    multiple: false,
    accept: {
      'image/*': ['.png', '.jpg', '.jpeg', '.gif']
    },
    onDrop: async (acceptedFiles: File[]) => {
      setImageLoading(true)
      await previewLogo(acceptedFiles.map((file: File) => Object.assign(file)))
      setImageLoading(false)
    }
  })

  return (
    <Grid container spacing={6}>
      <Grid item xs={12}>
        <Card className='px-[30px] pb-[30px] gap-2 flex flex-col'>
          <div className='flex flex-wrap sm:items-center justify-between gap-6 p-[20px]'>
            <Button
              variant='outlined'
              onClick={() => router.back()}
              startIcon={<i className='bx-arrow-back' />}
              className='hover:bg-primary hover:border-primary font-Helvetica'
              sx={{ borderColor: '#3751DC', color: '#3751DC' }}
            >
              back
            </Button>
          </div>
          {loading ? (
            <CircularProgress />
          ) : (
            <>
              <CardContent className='px-[40px]'>
                <div className='flex max-sm:flex-col items-end gap-6'>
                  <img height={200} width={200} className='rounded' src={brandInfo.logo} alt='brandLogo' />
                  <div className='flex flex-grow flex-col gap-4'>
                    <div className='flex flex-col sm:flex-row justify-between gap-4'>
                      <Button variant='contained' onClick={handleClickOpen}>
                        Upload New Brand Logo
                      </Button>
                      <Button variant='contained' onClick={handleSave}>
                        Save
                      </Button>
                    </div>
                    <Typography>Allowed JPG, GIF or PNG. Max size of 800K</Typography>
                  </div>
                </div>
              </CardContent>
              {Array.from({ length: 7 }, (_, index) => (
                <CardContent className='p-[40px] border rounded' key={index}>
                  {stepContent(index)}
                </CardContent>
              ))}
            </>
          )}
        </Card>
      </Grid>

      <Dialog
        closeAfterTransition={false}
        open={open}
        keepMounted
        onClose={handleClose}
        sx={{ '& .MuiDialog-paper': { width: '500px', height: '500px' } }}
      >
        <DialogContent className='flex items-center justify-center'>
          <Dropzone className='w-full h-full'>
            <Box
              {...getRootProps({ className: 'dropzone' })}
              {...{ sx: { height: '100%', display: 'flex', justifyContent: 'center' } }}
            >
              <input {...getInputProps()} />
              {imageLoading ? (
                <CircularProgress />
              ) : tmpLogo !== '' ? (
                img
              ) : (
                <div className='flex items-center flex-col text-center'>
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
        </DialogContent>
        <DialogActions className='dialog-actions-dense'>
          <Button
            onClick={() => {
              deleteLogo(tmpLogo)
              handleClose()
            }}
          >
            Disagree
          </Button>
          <Button
            onClick={() => {
              if (tmpLogo !== '') saveLogo(tmpLogo)
              handleClose()
            }}
          >
            Agree
          </Button>
        </DialogActions>
      </Dialog>
    </Grid>
  )
}

export default BrandEdit
