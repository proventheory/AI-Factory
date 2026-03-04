// React Imports
import { useEffect, useRef } from 'react'

import classnames from 'classnames'

import Button from '@mui/material/Button'

// Third-party Imports

// Type Imports
import AcUnitIcon from '@mui/icons-material/AcUnit'

import { Card, Grid, Typography } from '@mui/material'

import { useIntersection } from '@/hooks/useIntersection'

import frontCommonStyles from '@views/front-pages/styles.module.css'

import CustomAvatar from '@/@core/components/mui/Avatar'

const customerData = [
  {
    title: '“Boosted conversions and saved time”',
    description: 'Focuz has streamlined our email marketing, increasing conversions while saving us time.',
    avatar: '/images/avatars/adam.png',
    customer: 'Adam Mizrahi',
    job: 'Founder,  Creative Propulsion Labs'
  },
  {
    title: '“Unmatched personalization”',
    description: 'Seamless integration and smart AI personalization make Focuz ideal for Shopify agencies.',
    avatar: '/images/avatars/jeff.png',
    customer: 'Jeff Tait',
    job: 'Co-Founder,  TFC Marketing'
  },
  {
    title: "“The best email marketing tool I've used”'",
    description: "This is the best email marketing tool I've used. I used to spend 30m+ designing emails.",
    avatar: '/images/avatars/rosario.png',
    customer: 'Rosario Del Mar',
    job: 'Marketing Manager,  Wax Wax'
  },
  {
    title: '“Let AI do the heavy lifting”',
    description: 'Focuz makes email marketing easy. The AI handles the work, letting us focus on growing our business.',
    avatar: '/images/avatars/brandon.png',
    customer: 'Brandon Gil',
    job: 'Founder,  Gil Ventures'
  }
]

const Customers = () => {
  // Refs
  const skipIntersection = useRef(true)
  const ref = useRef<null | HTMLDivElement>(null)

  // Hooks
  const { updateIntersections } = useIntersection()

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (skipIntersection.current) {
          skipIntersection.current = false

          return
        }

        updateIntersections({ [entry.target.id]: entry.isIntersecting })
      },
      { threshold: 0.35 }
    )

    ref.current && observer.observe(ref.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <section className='px-[20px] pt-[150px] max-md:pt-[90px]'>
      <div className={classnames('is-full', frontCommonStyles.layoutSpacing)}>
        <div className='flex flex-row items-center flex-wrap gap-5 sm:text-start text-center lg:justify-between justify-center'>
          <div className='flex flex-row items-center flex-wrap md:justify-between justify-center sm:text-start text-center lg:flex-col lg:items-start w-[100%] lg:w-fit'>
            <div className='lg:text-5xl md:text-[40px] sm:text-[37px] text-black text-[25px] font-Geomanist pb-[32px]'>
              <p>
                Here&apos;s what our <span className='text-[#3751DC]'>customers</span>
              </p>
              have to say
            </div>
            <Button
              variant='outlined'
              className='font-Helvetica hover:bg-primary'
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
          <div className='flex flex-row justify-between items-center max-w-[400px]'>
            <AcUnitIcon
              className='px-[4px]'
              sx={{
                marginRight: '8px',
                width: '40px',
                height: '40px',
                color: '#3751DC',
                padding: 0,
                margin: '2.0px'
              }}
            />
            <p className='text-[14px] text-black font-Helvetica'>
              Empower your business with innovative AI solutions. Transform your approach to emails.
            </p>
          </div>
        </div>
      </div>
      <div className={'flex flex-col lg:gap-12 pt-[70px] max-md:pt-[35px] rounded-[60px]'}>
        <div className={classnames('is-full', frontCommonStyles.layoutSpacing)}>
          <Grid container rowSpacing={{ xs: 2, sm: 4, md: 6 }} columnSpacing={{ xs: 2, sm: 4, md: 6 }} columns={8}>
            {customerData.map((item, index) => (
              <Grid item key={index} xs={4}>
                <Card
                  className={`${index === 0 || index === 3 ? 'bg-[#22242F]' : 'bg-[#131317]'} flex flex-col item-start rounded-[30px] min-h-[251px] bs-full px-[32px] py-[48px]  max-sm:px-[18px] max-sm:py-[20px]  justify-center max-sm:text-start text-start`}
                >
                  <p className='text-white text-[24px] max-sm:text-[17px] mb-[24px] font-Helvetica'>{item.title}</p>
                  <p className='text-[#C8C9D0] text-[16px] mb-[27px] pr-[10px] font-Helvetica max-sm:text-[12px]'>
                    {item.description}
                  </p>
                  <div className='flex items-center gap-4'>
                    <CustomAvatar src={item.avatar} size={48} />
                    <div className='flex flex-col'>
                      <Typography variant='h6' className='text-[#DEDFE3] text-[14px] font-Helvetica max-sm:text-[10px]'>
                        {item.customer}
                      </Typography>
                      <Typography variant='body2' className='text-[#DEDFE3] text-[14px] font-Inter max-sm:text-[10px]'>
                        {item.job}
                      </Typography>
                    </div>
                  </div>
                </Card>
              </Grid>
            ))}
          </Grid>
        </div>
      </div>
    </section>
  )
}

export default Customers
