// React Imports

// MUI Imports
import Typography from '@mui/material/Typography'
import BorderColorOutlinedIcon from '@mui/icons-material/BorderColorOutlined'
import MailOutlineOutlinedIcon from '@mui/icons-material/MailOutlineOutlined'
import MonitorIcon from '@mui/icons-material/Monitor'
import ShoppingCartOutlinedIcon from '@mui/icons-material/ShoppingCartOutlined'
import QuickreplyOutlinedIcon from '@mui/icons-material/QuickreplyOutlined'

import { IoCodeSlashOutline } from 'react-icons/io5'
import { AiOutlineApi } from 'react-icons/ai'
import { VscBook } from 'react-icons/vsc'
import { TiFlowSwitch } from 'react-icons/ti'

// Third-party Imports
import classnames from 'classnames'

import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'

// Styles Imports
import { useKeenSlider } from 'keen-slider/react'

import { Button } from '@mui/material'

import frontCommonStyles from '@views/front-pages/styles.module.css'
import styles from './styles.module.css'
import AppKeenSlider from '@/libs/styles/AppKeenSlider'

const data = [
  {
    desc: 'Craft compelling email copy effortlessly with AI-powered writing assistance that adapts to your brand’s tone and voice.',
    icon: <BorderColorOutlinedIcon sx={{ color: 'black', height: '30px' }} />,
    title: 'Copywriting AI assistant'
  },
  {
    desc: 'Generate high-quality, personalized emails in seconds with AI, making your email marketing fast and efficient.',
    icon: <MailOutlineOutlinedIcon sx={{ color: 'black', height: '30px' }} />,
    title: 'Instant emails'
  },
  {
    desc: 'Edit and optimize your emails with suggestions that enhance readability and engagement. Improve your content with real-time.',
    icon: <MonitorIcon sx={{ color: 'black', height: '30px' }} />,
    title: 'Smart editor'
  },
  {
    desc: 'Tailored for eCommerce, this AI tool integrates seamlessly with Shopify, helping you boost sales and customer engagement.',
    icon: <ShoppingCartOutlinedIcon sx={{ color: 'black', height: '30px' }} />,
    title: 'Perfect for eCommerce'
  },
  {
    desc: 'Ensure your emails reach the right inbox at the right time. AI-enhanced delivery optimization, compressed and responsive.',
    icon: <QuickreplyOutlinedIcon sx={{ color: 'black', height: '30px' }} />,
    title: 'Delivery optimized'
  },
  {
    desc: 'Customize your emails with full HTML support, allowing for advanced design and functionality, creating visually stunning campaigns.',
    icon: <IoCodeSlashOutline className='text-black' size={23} />,
    title: 'HTML enabled'
  },
  {
    desc: 'Integrate effortlessly with major Email Service Providers (ESPs) for streamlined campaign management.',
    icon: <AiOutlineApi className='text-black' size={23} />,
    title: 'Compatible with major ESPs'
  },
  {
    desc: 'Easily import and apply your brand guidelines to maintain consistency across all your email communications.',
    icon: <VscBook className='text-black' size={23} />,
    title: 'Import brand guidelines'
  },
  {
    desc: 'Automate your email marketing with AI-powered workflows, simplifying campaign creation and execution.',
    icon: <TiFlowSwitch className='text-black' size={23} />,
    title: 'Build flows'
  }
]

const FocusCard = () => {
  const [sliderRef, instanceRef] = useKeenSlider<HTMLDivElement>(
    {
      loop: true,
      slides: {
        perView: 3,
        origin: 'auto'
      },
      breakpoints: {
        '(max-width: 1200px)': {
          slides: {
            perView: 2,
            spacing: 10,
            origin: 'auto'
          }
        },
        '(max-width: 900px)': {
          slides: {
            perView: 1.75,
            spacing: 10
          }
        },
        '(max-width: 600px)': {
          slides: {
            perView: 1.25,
            spacing: 10,
            origin: 'auto'
          }
        }
      }
    },
    [
      slider => {
        let timeout: ReturnType<typeof setTimeout>
        const mouseOver = false

        function clearNextTimeout() {
          clearTimeout(timeout)
        }

        function nextTimeout() {
          clearTimeout(timeout)
          if (mouseOver) return
          timeout = setTimeout(() => {
            slider.next()
          }, 2000)
        }

        slider.on('created', nextTimeout)
        slider.on('dragStarted', clearNextTimeout)
        slider.on('animationEnded', nextTimeout)
        slider.on('updated', nextTimeout)
      }
    ]
  )

  return (
    <section
      className={classnames(
        'pt-[70px] max-md:pt-[35px] bg-white',
        styles.sectionStartRadius
      )}
    >
      <div className={classnames('flex flex-col max-sm:pr-0', frontCommonStyles.layoutSpacing)}>
        <div className='is-full md:is-[100%]'>
          <AppKeenSlider>
            <div ref={sliderRef} className='keen-slider'>
              {data.map((item, index) => (
                <div key={index} className='keen-slider__slide flex p-4 sm:p-3'>
                  <Card className='flex rounded-[40px]' style={{ background: index % 2 === 0 ? '#DDE3FF' : '#F4F4F6' }}>
                    <CardContent className='p-6 pl-8 mlb-auto'>
                      <div className='flex flex-col gap-4 items-start'>
                        {item.icon}
                        <div className='flex items-center gap-3'>
                          <div className='flex flex-col items-start'>
                            <Typography variant='h6' className='text-black text-[24px] font-Helvetica'>
                              {item.title}
                            </Typography>
                          </div>
                        </div>
                        <Typography className='text-black font-Helvetica'>{item.desc}</Typography>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              ))}
            </div>
          </AppKeenSlider>
        </div>
        <div className='flex flex-col max-sm:items-center items-start justify-center bs-full is-full md:is-[30%] max-sm:pr-6'>
          <div className='flex gap-4  pt-[53px] max-md:pt-[24px]'>
            <Button
              variant='outlined'
              sx={{
                height: { xs: '48px', sm: '48px' },
                minHeight: { xs: '48px', sm: '48px' },
                width: { xs: '48px', sm: '48px' },
                minWidth: { xs: '48px', sm: '48px' },
                padding: 0,
                '& .MuiButton-label': {
                  lineWidth: { xs: '48px', sm: '48px' }
                }
              }}
              className='border-[#3751DC] border-[2px] rounded-full flex items-center justify-center hover:bg-white'
              onClick={() => instanceRef.current?.prev()}
            >
              <i className='bx bx-chevron-left text-[#3751DC] h-[24px] w-[24px]' />
            </Button>
            <Button
              variant='outlined'
              sx={{
                height: { xs: '48px', sm: '48px' },
                minHeight: { xs: '48px', sm: '48px' },
                width: { xs: '48px', sm: '48px' },
                minWidth: { xs: '48px', sm: '48px' },
                padding: 0,
                '& .MuiButton-label': {
                  lineWidth: { xs: '48px', sm: '48px' }
                }
              }}
              className='border-[#3751DC] border-[2px] rounded-full flex items-center justify-center hover:bg-white'
              onClick={() => instanceRef.current?.next()}
            >
              <i className='bx-chevron-right text-[#3751DC] h-[24px] w-[24px]' />
            </Button>
          </div>
        </div>
      </div>
    </section>
  )
}

export default FocusCard
