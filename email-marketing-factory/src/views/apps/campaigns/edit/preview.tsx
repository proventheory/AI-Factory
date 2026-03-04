'use client'

import { useEffect, useState } from 'react'

import { useRouter, useParams, usePathname } from 'next/navigation'

import { Button, Card, CardContent, Grid, useMediaQuery } from '@mui/material'

import { Liquid } from 'liquidjs'

import mjml from 'mjml-browser'

import type { Theme } from '@mui/material/styles'

import { useDispatch } from 'react-redux'

import { toast } from 'react-toastify'

import { getLocalizedUrl } from '@/utils/i18n'

import type { Locale } from '@/configs/i18n'

import { IframeComponent } from '@/components/IframeComponent'
import { supabase } from '@/utils/supabase'
import { loadingPrecess } from '@/redux-store/slices/loading'
import { demoPattern } from '@/utils'

type Props = {
  emailId: string
}

const CampaignPreveiw = ({ emailId }: Props) => {

  const router = useRouter()

  const pathName = usePathname()

  const { lang: locale } = useParams()

  const dispatch = useDispatch()

  const [height, setHeight] = useState(600)

  const [item, setItem] = useState<string | null>(null)

  const [html, setHtml] = useState('')

  const isBelowSmScreen = useMediaQuery((theme: Theme) => theme.breakpoints.down('sm'))

  const getMjml = async () => {

    dispatch(loadingPrecess({ visible: false, content: '', commonVisible: true }))

    const { data, error } = await supabase.from('mjmls').select('content, title').eq('id', emailId)

    if (error) {

      dispatch(loadingPrecess({ commonVisible: false }))

      toast.warning('Loading failed. Please refresh the page or return to the previous page.', { autoClose: 5000, hideProgressBar: false, type: 'warning' })

      return
    }

    if (data && data.length > 0) {
      setItem(data[0].content)

      dispatch(loadingPrecess({ commonVisible: false }))
    }
  }

  useEffect(() => {

    getMjml()

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emailId])

  useEffect(() => {
    if (item) {

      const engine = new Liquid()
      const parsedTemplate = engine.parse(mjml(item.replace('<mj-head>', '<mj-head><mj-style inline="inline">.hide-desktop-block,.hide-desktop-inline-block,.hide-block{display:none!important;mso-hide:all!important}.direction-rtl,.navbar-direction-rtl .mj-link{direction:rtl} </mj-style> <mj-style>.mjbody a{color:inherit}@media (max-width: 480px){.hide-mobile-block{max-height:0px;overflow:hidden;display:none!important}.hide-desktop-block{display:block!important}.hide-mobile-inline-block{max-height:0px;overflow:hidden;display:none!important}.hide-desktop-inline-block{display:inline-block!important}} </mj-style>')).html)

      const renderHtml = async () => {
        const renderedHtml = await engine.render(parsedTemplate)

        setHtml(renderedHtml)
      }

      renderHtml()
    }
  }, [item])

  const [isMobile, setIsMobile] = useState(false)

  const MOBILE_WIDTH = 375
  const MOBILE_Height = 700

  return (
    <>
      <Grid item className='w-full h-full'>
        <Card>
          <CardContent className='p-2'>
            {!isBelowSmScreen &&
              <div className='flex flex-row justify-center gap-4 p-2 relative'>
                <Button startIcon={<i className='bx-edit' />}
                  onClick={() => {
                    dispatch(loadingPrecess({ commonVisible: true }))
                    router.push(getLocalizedUrl(demoPattern.test(pathName) ? `/demo/campaigns/edit/${emailId}` : `/campaigns/edit/${emailId}`, locale as Locale))

                  }}
                  variant='outlined'
                  className='absolute left-1'
                >
                </Button>
                <Button
                  startIcon={<i className='bx-desktop' />}
                  onClick={() => setIsMobile(false)}
                  variant={isMobile ? 'outlined' : 'contained'}
                >
                  Desktop
                </Button>
                <Button
                  startIcon={<i className='bx-mobile' />}
                  onClick={() => setIsMobile(true)}
                  variant={isMobile ? 'contained' : 'outlined'}
                >
                  Mobile
                </Button>
              </div>
            }
            <div className='flex flex-col rounded border'>
              <div
                className='overflow-hidden text-center'
                style={{
                  marginTop: isMobile ? '30px' : '0px'
                }}
              >
                <div
                  className='m-auto relative box-border overflow-hidden p-4'
                  style={{
                    width: isMobile ? MOBILE_WIDTH : '100%'
                  }}
                  onClick={e => {
                    e.preventDefault()
                    e.stopPropagation()
                  }}
                >
                  <div
                    style={{
                      left: 0,
                      top: 0,
                      width: '100%',
                      height: '100%',
                      position: 'absolute',
                      padding: '6px 6.8px 2px 6.8px',
                      backgroundImage: `url('/images/email/iphone.png')`,
                      backgroundSize: '100% 100%',
                      zIndex: 10,
                      pointerEvents: 'none',
                      display: isMobile ? undefined : 'none',
                      boxSizing: 'border-box'
                    }}
                  />
                  <IframeComponent
                    onChangeHeight={setHeight}
                    style={{
                      height: isMobile ? MOBILE_Height : height,
                      width: '100%',
                      boxSizing: 'content-box',
                      borderRadius: isMobile ? 30 : 0
                    }}
                  >
                    <div dangerouslySetInnerHTML={{ __html: html }}></div>
                    <style>{`
                  *::-webkit-scrollbar {
                    -webkit-appearance: none;
                    width: 0px;
                    height: 0px;
                  }
                  `}</style>
                  </IframeComponent>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </Grid>
    </>
  )
}

export default CampaignPreveiw
