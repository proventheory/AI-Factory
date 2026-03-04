'use client'

import Image from 'next/image'

import classnames from 'classnames'

import { Box, Button } from '@mui/material'

import frontCommonStyles from '@views/front-pages/styles.module.css'

const Careers = () => {
  const data = [
    {
      title: 'Respecting Diverse Perspectives',
      content:
        'At Focuz, we believe that advancing AI requires a deep understanding of and respect for the full spectrum of human experiences. We are committed to creating solutions that resonate with and benefit everyone.'
    },
    {
      title: 'Dedicated to Impactful AI',
      content:
        'Our focus is on building AI that not only meets today’s needs but also has a transformative, positive impact on the future of marketing. Anything outside of this mission is out of scope.'
    },
    {
      title: 'Driven and Resilient',
      content:
        'Achieving something extraordinary takes hard work, often involving tasks that are less glamorous but equally vital. We value practical, effective solutions, embracing the best ideas, no matter where they originate.'
    },
    {
      title: 'Scaling for Success',
      content:
        'We believe in the magic of scale—in our models, our systems, our processes, and our ambitions. When in doubt, we aim to scale up to maximize impact.'
    },
    {
      title: 'Creating Products People Love',
      content:
        'Our technology is designed to make a genuinely positive difference in people’s lives, transforming the way businesses approach marketing.'
    },
    {
      title: 'Collaborative Team Spirit',
      content:
        'Our most significant breakthroughs come from working together effectively across teams. While our teams may have diverse focuses and identities, our overall purpose and goals must always align. At Focuz, nothing is someone else’s problem; we all share responsibility in achieving success'
    }
  ]

  return (
    <section id='careers'>
      <div
        className={classnames(
          'flex items-center flex-wrap justify-center pb-8 sm:pb-24 pt-[130px] max-md:pt-[67px]',
          frontCommonStyles.layoutSpacing
        )}
      >
        <div className='w-full flex flex-col gap-6 pb-[46px]'>
          <div
            className='2xl:text-7xl md:text-6xl sm:text-5xl text-3xl text-black font-Geomanist font-normal lg:tracking-tighter'
            style={{ WebkitTextStroke: '1px black' }}
          >
            / Careers
          </div>
          <h1 className='text-black font-Helvetica max-w-[633px] text-start font-normal'>
            Join Focuz and be part of a team that&apos;s revolutionizing marketing with innovative AI solutions.
            We&apos;re seeking passionate individuals from diverse disciplines and backgrounds to help shape the future
            of AI-driven marketing.
          </h1>
        </div>
        <Box
          sx={{
            width: '100%',
            position: 'relative',
            height: 'auto',
            display: 'block'
          }}
        >
          <Image
            src='/images/front-pages/careers/1.webp'
            layout='responsive'
            width={800}
            height={600}
            alt='aboutus logo'
          />
          <Box className='absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 flex items-center justify-center'>
            <Button
              variant='contained'
              className='rounded-[100px] text-[15px] w-[232px] max-md:w-[180px] py-4 max-md:py-2'
            >
              Contact Us
            </Button>
          </Box>
        </Box>
        <div className='w-full pt-[78px] max-md:pt-[23px] pb-[83px] max-md:pb-[23px]'>
          <div className='flex flex-col bg-[#DDE3FF] w-full gap-8 justify-start px-[109px] max-md:px-[53px] py-[124px] max-md:py-[62px] max-sm:px-[40px] max-sm:py-[41px] rounded-[32px]'>
            <p className='font-Geomanist max-md:text-3xl max-sm:text-2xl text-[48px] text-black'>
              Advancing AI with purpose and integrity
            </p>
            {data.map((item, index) => (
              <div key={index} className='flex flex-col'>
                <p className='text-black font-bold text-[16px] font-Helvetica'>{item.title}</p>
                <p className='text-black text-[16px] font-Helvetica'>{item.content}</p>
              </div>
            ))}
          </div>
        </div>

        <div className='w-full grid grid-cols-4 h-auto'>
          <div className='col-span-1'>
            <img src='/images/front-pages/careers/2.webp' alt='left' className='w-full h-full object-cover' />
          </div>
          <div className='col-span-3 bg-[#FAFAFA] rounded-tr-[32px] rounded-br-[32px] pt-[190px] max-lg:pt-[100px] max-sm:pt-[70px] pl-[90px] max-lg:pl-[70px] max-md:pl-[50px] max-sm:pl-[30px] pr-[89px] max-md:pr-[70px] max-sm:pr-[50px] gap-8 flex flex-col max-md:gap-4'>
            <p className='font-Geomanist text-[48px] text-black font-normal max-lg:text-[30px] max-md:text-[25px]'>
              Join the<span className='text-primary'> Focuz </span> fellowship program
            </p>
            <p className='text-black text-[16px] font-Helvetica max-w-[700px] font-normal pb-[97px] max-lg:pb-[70px] max-md:pb-[50px] max-sm:pb-[30px]'>
              The Focuz Fellowship is a six-month program designed to provide a pathway to a full-time role at Focuz for
              talented individuals who may not currently specialize in AI-driven marketing. This program offers a unique
              opportunity to gain hands-on experience and contribute to cutting-edge projects.
              <br />
              <br />
              <span className='font-bold hover:cursor-pointer'>Contact us &gt;</span>
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}

export default Careers
