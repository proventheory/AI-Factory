import classnames from 'classnames'

import { Button, Typography } from '@mui/material'

import frontCommonStyles from '@views/front-pages/styles.module.css'

const PricingFooter = () => {
  return (
    <section id='pricingFooter'>
      <div
        className={classnames(
          'flex items-center flex-wrap justify-center pb-8 sm:pb-24 pt-[34px]',
          frontCommonStyles.layoutSpacing
        )}
      >
        <div className='w-full h-auto bg-primary md:px-[76px] md:py-[50px] px-[30px] py-[20px] rounded-[32px] flex flex-col'>
          <p className='font-Geomanist lg:text-5xl md:text-[40px] text-[25px] text-white pb-[34px]'>
            Need more? Discover our
            <br />
            white label & enterprise
            <br />
            solutions
          </p>
          <p className='font-Helvetica text-[16px] text-white'>
            Looking for more? Book a call to explore our white label and enterprise solutions tailored to elevate
            <br />
            your brand&apos;s email marketing strategy.
          </p>
          <div className='flex flex-row pt-[34px] justify-start max-sm:justify-center'>
            <Typography className='text-white text-[15px] py-[10px] pl-0 pr-[50px] max-md:pr-[20px] underline font-bold hover:cursor-pointer'>
              <a href='/pricing'>Try for Free</a>
            </Typography>
            <Button
              variant='contained'
              className='bg-white text-primary text-[15px] py-[10px] rounded-[99px] w-[232px] max-md:w-[120px] font-bold'
            >
              Contact Us
            </Button>
          </div>
        </div>
      </div>
    </section>
  )
}

export default PricingFooter
