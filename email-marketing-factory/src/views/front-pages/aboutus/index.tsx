'use client'

import Image from 'next/image'

// import { useRouter } from 'next/navigation'

import classnames from 'classnames'

// import { Box } from '@mui/material'

import Button from '@mui/material/Button'

// import { useKeenSlider } from 'keen-slider/react'

// import AppKeenSlider from '@/libs/styles/AppKeenSlider'

import frontCommonStyles from '@views/front-pages/styles.module.css'

const AboutUs = () => {
  // const router = useRouter()

  // const [sliderRef, instanceRef] = useKeenSlider<HTMLDivElement>(
  //   {
  //     loop: true,
  //     slides: {
  //       perView: 4,
  //       spacing: 6,
  //       origin: 'auto'
  //     },
  //     breakpoints: {
  //       '(max-width: 1200px)': {
  //         slides: {
  //           perView: 3,
  //           spacing: 6,
  //           origin: 'auto'
  //         }
  //       },
  //       '(max-width: 899px)': {
  //         slides: {
  //           perView: 2.5,
  //           spacing: 6,
  //           origin: 'auto'
  //         }
  //       },
  //       '(max-width: 820px)': {
  //         slides: {
  //           perView: 2.2,
  //           spacing: 6,
  //           origin: 'auto'
  //         }
  //       },
  //       '(max-width: 670px)': {
  //         slides: {
  //           perView: 2.1,
  //           spacing: 6,
  //           origin: 'auto'
  //         }
  //       },
  //       '(max-width: 599px)': {
  //         slides: {
  //           perView: 1.6,
  //           spacing: 6,
  //           origin: 'auto'
  //         }
  //       },
  //       '(max-width: 500px)': {
  //         slides: {
  //           perView: 1.5,
  //           spacing: 3,
  //           origin: 'auto'
  //         }
  //       },
  //       '(max-width: 430px)': {
  //         slides: {
  //           perView: 1.2,
  //           spacing: 3,
  //           origin: 'auto'
  //         }
  //       }
  //     }
  //   },
  //   [
  //     slider => {
  //       let timeout: ReturnType<typeof setTimeout>
  //       const mouseOver = false

  //       function clearNextTimeout() {
  //         clearTimeout(timeout)
  //       }

  //       function nextTimeout() {
  //         clearTimeout(timeout)
  //         if (mouseOver) return
  //         timeout = setTimeout(() => {
  //           slider.next()
  //         }, 2000)
  //       }

  //       slider.on('created', nextTimeout)
  //       slider.on('dragStarted', clearNextTimeout)
  //       slider.on('animationEnded', nextTimeout)
  //       slider.on('updated', nextTimeout)
  //     }
  //   ]
  // )

  // const data = [
  //   {
  //     desc: 'Mastering Architecture: Teaching AI the Theory Behind Impeccable Creative Output',
  //     component: (
  //       <Image
  //         src='/images/front-pages/aboutus/blog1.webp'
  //         alt='Unlimited brand profiles'
  //         width={100}
  //         height={100}
  //         className='w-full opacity-[0.3] rounded-[32px]'
  //       />
  //     )
  //   },
  //   {
  //     desc: 'RAG vs LLMs: Comparing Retrieval-Augmented Generation and Large Language Models',
  //     component: (
  //       <Image
  //         src='/images/front-pages/aboutus/blog2.webp'
  //         alt='Reduce your input hours'
  //         width={100}
  //         height={100}
  //         className='w-full opacity-[0.3] rounded-[32px]'
  //       />
  //     )
  //   },
  //   {
  //     desc: 'How Temperature Settings Influence Creativity in AI: Balancing Precision and Imagination',
  //     component: (
  //       <Image
  //         src='/images/front-pages/aboutus/blog3.webp'
  //         alt='All your metrics in one place'
  //         width={100}
  //         height={100}
  //         className='w-full opacity-[0.3] rounded-[32px]'
  //       />
  //     )
  //   },
  //   {
  //     desc: 'How Deep Understanding of Processes Will Revolutionize Engineering and Development in AI',
  //     component: (
  //       <Image
  //         src='/images/front-pages/aboutus/blog4.webp'
  //         alt='Designed for agencies'
  //         width={100}
  //         height={100}
  //         className='w-full opacity-[0.3] rounded-[32px]'
  //       />
  //     )
  //   },
  //   {
  //     desc: 'Exploring the Blue Ocean of AI: Uncharted Opportunities in Artificial Intelligence for Daily Routines',
  //     component: (
  //       <Image
  //         src='/images/front-pages/aboutus/blog5.webp'
  //         alt='White label our tools'
  //         width={100}
  //         height={100}
  //         className='w-full opacity-[0.3] rounded-[32px]'
  //       />
  //     )
  //   }
  // ]

  return (
    <section id='paymentPlan'>
      <div
        className={classnames(
          'flex items-center flex-wrap justify-center pb-8 sm:pb-24 pt-[130px] max-md:pt-[67px] max-md:pr-0',
          frontCommonStyles.layoutSpacing
        )}
      >
        <div className='w-full flex flex-col gap-6 pb-[46px] max-md:pr-[24px]'>
          <div
            className='2xl:text-7xl md:text-6xl sm:text-5xl text-3xl text-black font-Geomanist font-normal lg:tracking-tighter'
            style={{ WebkitTextStroke: '1px black' }}
          >
            / About us
          </div>
          <h1 className='text-black font-Helvetica max-w-[633px] text-start font-normal'>
            Focuz is a cutting-edge marketing technology company. Our mission is to empower brands with a comprehensive
            suite of development tools, ensuring that businesses of all sizes can optimize their marketing efforts and
            achieve scalable success.
          </h1>
        </div>

        <div className='max-md:pr-[24px] w-full relative h-auto block'>
          <Image
            src='/images/front-pages/aboutus/1.webp'
            layout='responsive'
            width={800}
            height={600}
            objectFit='contain'
            alt='aboutus logo'
          />
        </div>

        {/* <div className='w-full grid grid-cols-4 pt-[124px] max-md:pt-[30px] h-auto pb-[124px] max-md:pb-[100px] max-md:pr-[24px]'>
          <div className='col-span-1'>
            <img src='/images/front-pages/aboutus/2.webp' alt='left' className='w-full h-full object-cover' />
          </div>
          <div className='col-span-3 bg-primary rounded-tr-[32px] rounded-br-[32px] pt-[190px] max-lg:pt-[100px] max-sm:pt-[70px] pl-[90px] max-lg:pl-[70px] max-md:pl-[50px] max-sm:pl-[30px] pr-[89px] max-md:pr-[70px] max-sm:pr-[50px] gap-8 flex flex-col'>
            <p className='font-Geomanist text-[48px] text-white font-normal max-lg:text-[30px] max-md:text-[25px]'>
              Marketing with Memory3: Enhancing
              <br /> Efficiency and Scalability
            </p>
            <p className='text-white text-[16px] font-Helvetica max-w-[700px] font-normal pb-[97px] max-lg:pb-[70px] max-md:pb-[50px] max-sm:pb-[30px]'>
              Discover how Memory3 AI research revolutionizes email marketing by introducing efficient knowledge
              management, reducing costs, and improving scalability. Learn how explicit memory systems and modular
              architectures empower AI to deliver faster, brand-compliant, and contextually aware email campaigns.
              <br />
              <br />
              <span className='font-bold'>Read our blog &gt;</span>
            </p>
          </div>
        </div> */}

        {/* <div className='flex flex-col w-full'>
          <div className='col-span-3 flex flex-col gap-6 max-md:gap-3 max-md:pr-[24px]'>
            <div className='lg:text-5xl md:text-[40px] sm:text-[37px] text-black text-[25px] font-Geomanist lg:text-start text-center'>
              <p>
                Discover some of <span className='text-primary'>research</span>
              </p>
              and browse our blog
            </div>
            <p className='text-black font-Helvetica text-[16px] max-w-[934px] lg:text-start text-center'>
              At Focuz, our mission is to empower middle-class and small businesses with the marketing tools they need
              to thrive, even when budgets are tight. W&apos;re dedicated to leveling the playing field by providing
              affordable, powerful marketing solutions, ensuring that every business, regardless of size, can reach its
              full potential.
            </p>
          </div>
          <div className={classnames('flex max-md:flex-row max-sm:flex-wrap is-full gap-6 pt-[70px] max-md:pt-[35px]')}>
            <div className='is-full md:is-[100%]'>
              <AppKeenSlider>
                <div ref={sliderRef} className='keen-slider'>
                  {data.map((item, index) => (
                    <div
                      key={index}
                      className='keen-slider__slide flex'
                      onClick={() => {
                        router.push('/blog')
                      }}
                    >
                      <Box className='relative bg-transparent rounded-[24px] w-[300px] h-auto mr-2 block'>
                        {item.component}
                        <Box className='absolute bottom-[38px] left-[36px] max-md:bottom-[32px] max-md:left-[30px] items-end justify-start'>
                          <p
                            className='text-[16px] text-black font-Helvetica max-w-[236px]'
                            dangerouslySetInnerHTML={{ __html: item.desc }}
                          />
                        </Box>
                      </Box>
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
        </div> */}

        <div className='w-full max-md:pr-[24px] pt-[124px] max-md:pt-[30px]'>
          <div className='bg-[url("/images/front-pages/aboutus/3.webp")] bg-cover bg-no-repeat bg-center rounded-[20px] h-auto w-full pt-[361px] max-lg:pt-[200px] max-md:pt-[150px] max-sm:pt-[100px] pb-[50px] max-md:pb-[30px] flex flex-col justify-start items-start md:px-[70px] px-[30px] gap-8 max-md:gap-6'>
            <p className='lg:text-5xl md:text-[40px] sm:text-[37px] text-black text-[25px] font-Geomanist text-start'>
              Discover your future today,
              <br />
              exciting career opportunities
              <br />
              await you at <span className='text-primary'>Focuz</span>
            </p>
            <p className='max-w-[718px] text-black font-Helvetica text-[16px] text-start font-normal'>
              Building innovative and accessible marketing solutions demands a diverse team with expertise across
              various disciplines and backgrounds. Join us to help shape the future of AI-driven marketing.
            </p>
            <Button
              variant='contained'
              className='w-[232px] rounded-[100px] font-Helvetica text-[15px] font-bold leading-[17.25px] tracking-[0.02em] text-center px-13 py-4 max-md:px-8 max-md:py-3'
            >
              Browse Careers
            </Button>
          </div>
        </div>
      </div>
    </section>
  )
}

export default AboutUs
