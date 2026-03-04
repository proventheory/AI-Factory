'use client'

import { useCallback, useEffect, useState } from 'react'

import { useParams, usePathname } from 'next/navigation'

import { Button, Card, CardContent, Dialog, DialogContent, Typography } from '@mui/material'

import Grid from '@mui/material/Grid'

import Lottie from 'lottie-react'

import { toast } from 'react-toastify'

import { getLocalizedUrl } from '@/utils/i18n'

import type { Locale } from '@configs/i18n'

import type { campaignType } from '@/types/apps/campaignTypes'
import { supabase } from '@/utils/supabase'


import loadingData from '@/utils/loading1.json'
import ImageComponent from '@/utils/imageComponent'

import DialogCloseButton from '@/components/dialogs/DialogCloseButton'
import CustomAvatar from '@/@core/components/mui/Avatar'
import { demoPattern } from '@/utils'


type Props = {
  campaignTypeData?: campaignType[]
}

type templateType = {
  imageUrl: string
  id: string
}

const CampaignAdd = (props: Props) => {

  const { lang: locale } = useParams()

  const pathName = usePathname()

  const { campaignTypeData } = props

  const [type, setType] = useState<string | null>(null)

  const [templates, setTemplates] = useState<templateType[]>([])

  const getAllTemplate = useCallback(async () => {

    try {
      setTemplates([])
      let query = supabase.from('templates').select('imageUrl, id').neq('mjml', null)

      if (type)
        query = query.eq('type', type)
      const { data, error } = await query

      if (error) toast.warning('Loading templates failed', { autoClose: 5000, hideProgressBar: false, type: 'warning' })
      else {
        const imageUrls: templateType[] = []

        data.map((item) => {
          imageUrls.push({ imageUrl: item.imageUrl, id: item.id })
        })

        setTemplates(imageUrls)
      }

    } catch (error) {
      console.error('getAlltemplate', error)
    }

  }, [type])

  const [open, setOpen] = useState(false)

  const [displayId, setDisplayId] = useState<string>('')

  useEffect(() => {
    getAllTemplate()
  }, [type, getAllTemplate])

  return (
    <Grid container>
      <Grid item xs={12} spacing={6}>
        <Card className='py-[20px] mb-[20px]'>
          <div className='flex flex-wrap sm:items-center justify-between max-sm:flex-col gap-6 p-[20px]'>
            <Typography variant='h4' className='mbe-1 font-Geomanist'>
              Choose a template to start from
            </Typography>
          </div>
          <CardContent className='px-[40px]'>
            <div className='grid grid-cols-3 max-md:grid-cols-2 gap-5 max-sm:grid-cols-1'>
              {campaignTypeData?.map((item, index) => (
                <Button
                  className={`flex flex-row justify-start gap-4 items-center col-span-1 bg-none border-solid border-primary ${item.type == type ? 'border-2 border-primary' : ''}`}
                  key={index}
                  onClick={() => setType(item.type)}
                >
                  <CustomAvatar variant='rounded' size={38} className='p-1'>
                    <img src={item.icon} />
                  </CustomAvatar>
                  <Typography variant='h5' className='font-Helvetica'>{item.name}</Typography>
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
        {templates.length > 0 ?
          <Card className='p-[20px] grid grid-cols-4 max-md:grid-cols-3 gap-5 max-sm:grid-cols-2 max-sm:gap-3 text-center border-none'>
            {templates.map((item, index) => {
              return (
                <div key={index} className='col-span-1 flex items-center justify-between border-2 flex-col rounded-[20px]'>
                  <div className='h-auto max-h-[50vh] w-auto overflow-hidden relative group border-b-[1px] border-[#e4e6e8] rounded-t-[20px]'>
                    <ImageComponent src={item.imageUrl} alt={index.toString()} height={100} width={500} className='group-hover:scale-150 group-hover:opacity-80 transition-all duration-300' />
                    <div className='w-full h-full hidden group-hover:flex items-center justify-center absolute inset-0'>
                      <Button className='text-white bg-blue-800 px-3 py-2' onClick={() => {
                        setDisplayId(item.imageUrl)
                        setOpen(true)
                      }}>Preview</Button>
                    </div>
                  </div>
                  <div className='flex justify-end w-full py-2 px-1'>
                    <Button variant='contained' className='bg-blue-800'
                      href={getLocalizedUrl(demoPattern.test(pathName) ? `/demo/campaigns/add/${item.id}` : `/campaigns/add/${item.id}`, locale as Locale)}
                      onClick={(e) => {
                        e.stopPropagation()
                      }}
                    >
                      Use
                    </Button>
                  </div>
                </div>
              )
            })}
          </Card > : <Card className='border-none'>
            <div className={`flex w-full h-full items-center justify-center bg-white/80`}>
              <Lottie animationData={loadingData} className="!w-[200px] !h-[200px]" />
            </div>
          </Card>
        }
      </Grid>
      <Dialog
        open={open}
        closeAfterTransition={false}
        keepMounted
        sx={{ '& .MuiDialog-paper': { overflow: 'visible', height: '80vh', width: '80vw', padding: '40px 0px 20px 0px' } }}>
        <DialogContent>
          <DialogCloseButton onClick={() => setOpen(false)} disableRipple>
            <i className='bx-x' />
          </DialogCloseButton>
          <ImageComponent
            className='w-full h-full'
            src={displayId}
            alt={'preview Template'}
            width={400}
            height={300}
          />
        </DialogContent>
      </Dialog>
    </Grid>
  )
}

export default CampaignAdd
