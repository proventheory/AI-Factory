import Image from 'next/image'

import Typography from '@mui/material/Typography'

import { useKeenSlider } from 'keen-slider/react'
import classnames from 'classnames'

// Component Imports
import Button from '@mui/material/Button'

// Styled Component Imports
import AppKeenSlider from '@/libs/styles/AppKeenSlider'

// Styles Imports
import frontCommonStyles from '@views/front-pages/styles.module.css'

// Data
const data = [
  {
    desc: 'Configure your colors, typography..',
    component: (
      <Image
        src='/images/front-pages/landing-page/experts/01.svg'
        alt='Unlimited brand profiles'
        width={100}
        height={100}
        className='w-full'
      />
    ),
    title: 'Unlimited brand profiles'
  },
  {
    desc: 'Increase your productivity time..',
    component: (
      <Image
        src='/images/front-pages/landing-page/experts/02.svg'
        alt='Reduce your input hours'
        width={100}
        height={100}
        className='w-full'
      />
    ),
    title: 'Reduce your input hours'
  },
  {
    desc: 'Plug & play with your favorite ESPs..',
    component: (
      <Image
        src='/images/front-pages/landing-page/experts/03.svg'
        alt='All your metrics in one place'
        width={100}
        height={100}
        className='w-full'
      />
    ),
    title: 'All your metrics in one place'
  },
  {
    desc: 'Add your team in seconds..',
    component: (
      <Image
        src='/images/front-pages/landing-page/experts/04.svg'
        alt='Designed for agencies'
        width={100}
        height={100}
        className='w-full'
      />
    ),
    title: 'Designed for agencies'
  },
  {
    desc: 'Marketing without AI is just lazy..',
    component: (
      <Image
        src='/images/front-pages/landing-page/experts/05.svg'
        alt='White label our tools'
        width={100}
        height={100}
        className='w-full'
      />
    ),
    title: 'White label our tools'
  }
]

const Experts = () => {
  // Hooks
  const [sliderRef, instanceRef] = useKeenSlider<HTMLDivElement>(
    {
      loop: true,
      slides: {
        perView: 4,
        spacing: 6,
        origin: 'auto'
      },
      breakpoints: {
        '(max-width: 1200px)': {
          slides: {
            perView: 3,
            spacing: 6,
            origin: 'auto'
          }
        },
        '(max-width: 899px)': {
          slides: {
            perView: 2.5,
            spacing: 6,
            origin: 'auto'
          }
        },
        '(max-width: 820px)': {
          slides: {
            perView: 2.2,
            spacing: 6,
            origin: 'auto'
          }
        },
        '(max-width: 670px)': {
          slides: {
            perView: 2.1,
            spacing: 6,
            origin: 'auto'
          }
        },
        '(max-width: 599px)': {
          slides: {
            perView: 1.6,
            spacing: 6,
            origin: 'auto'
          }
        },
        '(max-width: 500px)': {
          slides: {
            perView: 1.5,
            spacing: 3,
            origin: 'auto'
          }
        },
        '(max-width: 430px)': {
          slides: {
            perView: 1.2,
            spacing: 3,
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
    <section className='bg-white pt-[150px] max-md:pt-[50px]'>
      <div className={classnames('flex flex-col max-md:pr-0', frontCommonStyles.layoutSpacing)}>
        <div className='flex flex-row items-center flex-wrap gap-5 md:justify-between justify-center sm:text-start text-center max-md:pr-6'>
          <div className='lg:text-5xl md:text-[40px] sm:text-[37px] text-black text-[25px] font-Geomanist'>
            <p>
              Designed by marketing <span className='text-[#3751DC]'>experts</span> <br /> for the forward-thinking
            </p>
          </div>
          <Button
            variant='outlined'
            className='font-Geomanist hover:bg-primary'
            sx={{
              color: '#3751DC',
              borderColor: '#3751DC',
              height: '50px',
              borderRadius: '9999px',
              borderWidth: '2px'
            }}
            href='/pricing'
          >
            Try for Free
          </Button>
        </div>
        <div className={classnames('flex max-md:flex-row max-sm:flex-wrap is-full gap-6 pt-[70px] max-md:pt-[35px]')}>
          <div className='is-full md:is-[100%]'>
            <AppKeenSlider>
              <div ref={sliderRef} className='keen-slider'>
                {data.map((item, index) => (
                  <div key={index} className='keen-slider__slide flex'>
                    <div className='flex bg-[#DDE3FF] rounded-[24px] w-[300px] h-[380px] mr-2'>
                      <div className='absolute pr-2'>{item.component}</div>
                      <div className='absolute bottom-6 px-6 w-full'>
                        <div className='flex flex-col items-start gap-1'>
                          <Typography className='text-lg text-[#3751DC] font-Helvetica max-sm:text-base'>
                            {item.title}
                          </Typography>
                          <Typography className='text-sm text-black font-Helvetica max-sm:text-xs'>
                            {item.desc}
                          </Typography>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </AppKeenSlider>
          </div>
        </div>
        <div className='flex flex-col max-sm:items-center items-start justify-center bs-full is-full md:is-[30%] mlb-auto max-sm:pr-6'>
          <div className='flex gap-4 pt-[53px] max-md:pt-[24px]'>
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

export default Experts
