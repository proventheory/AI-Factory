'use client'

import { useEffect, useState } from 'react'

import { useRouter } from 'next/navigation'

import classnames from 'classnames'

import { Button, Card, CardContent, Chip, Typography } from '@mui/material'

import { loadStripe } from '@stripe/stripe-js'

import { toast } from 'react-toastify'

import frontCommonStyles from '@views/front-pages/styles.module.css'
import CustomAvatar from '@/@core/components/mui/Avatar'
import { getSession } from '@/utils/queries'
import urlConfig from '@/configs/urlConfig'



type Props = {
  isSection: boolean
}

type product = {
  price: number;
  productId: string;
}

const PaymentPlan = ({ isSection }: Props) => {

  const [annual, setAnnualData] = useState<product[]>([])
  const [monthly, setMonthlyData] = useState<product[]>([])

  const router = useRouter()

  const popular = [false, false, true]

  const [isMonth, setIsMonth] = useState<boolean>(true)

  const data = [
    { title: 'Startup Plan', subTitle: 'Designed for smaller brands generating less than $500k in annual revenue over the past 12 months.' },
    { title: 'Core Plan', subTitle: 'Suited for brands executing an advanced email program with more comprehensive needs.' },
  ]

  const planBenefits = [
    ['Unlimited users (any number of team members can use the platform).', 'Unlimited emails (no cap on email campaigns sent).', 'Email support (basic level of customer support for troubleshooting and inquiries).'],
    ['Unlimited users.', 'Unlimited emails', 'Email support(same as the Startup plan, but geared toward advanced users).'],
  ]

  const getProdutData = async () => {
    await fetch('/api/stripe', { method: 'GET' }).then(async (data) => {
      const { monthlyData, annualData } = await data.json()

      setAnnualData(annualData)
      setMonthlyData(monthlyData)
    })
  }

  useEffect(() => {

    getProdutData()

  }, [])

  const handleCheckout = async (productId: string) => {

    const [session] = await Promise.all([getSession()])

    if (!session) {
      return router.push(`${urlConfig()}/register`)
    }

    const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLIC_KEY!)

    const stripe = await stripePromise;

    const res = await fetch('/api/stripe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId, user: { email: session.user.email } })
    })

    const { sessionId } = await res.json();

    if (stripe && sessionId) await stripe.redirectToCheckout({ sessionId });
    else
      toast.warning('Oops! Please refresh this page or press F5.', { autoClose: 5000, type: 'warning' })

  }

  return (
    <section id='paymentPlan'>
      <div
        className={classnames(
          `flex items-center flex-wrap justify-center ${!isSection ? 'pt-[130px] max-md:pt-[67px]' : 'pt-[150px] max-md:pt-[90px]'}`,
          frontCommonStyles.layoutSpacing
        )}
      >
        <div className='grid grid-cols-1 gap-10 lg:grid-cols-4 xl:grid-6 w-full pb-[53px] max-lg:pb-[30px]'>
          <div className='lg:col-span-3 col-span-1 flex flex-col gap-6'>
            {!isSection ? (
              <div
                className='2xl:text-7xl md:text-6xl sm:text-5xl text-3xl text-black font-Geomanist font-normal lg:tracking-tighter'
                style={{ WebkitTextStroke: '1px black' }}
              >
                / Find your best fit with <br />
                our plans & pricing
              </div>
            ) : (
              <div className='lg:text-5xl md:text-[40px] sm:text-[37px] text-black text-[25px] font-Geomanist pb-[25px] lg:text-start text-center'>
                <p>
                  Find your <span className='text-primary'>best fit</span> with our
                </p>
                plans & pricing
              </div>
            )}
            <h1
              className={`text-black font-Helvetica max-w-[782px] text-start font-normal ${!isSection ? '' : 'text-[16px]'}`}
            >
              Whether you&apos;re managing a small campaign or scaling up your email marketing efforts, our AI-powered
              design assistant is here to support you every step of the way. Choose the pricing plan that best suits
              your needs, and enjoy 25% off when you opt for annual billing. Need more?{' '}
              <span className='text-primary font-bold hover:cursor-pointer'>
                <a href='https://calendly.com/hello-focuz'>Schedule Demo </a></span> for enterprise solutions.
            </h1>
          </div>
          <div className='col-span-1 flex flex-row gap-4 items-center lg:justify-end justify-center'>
            <Button
              variant={isMonth ? 'contained' : 'outlined'}
              className='rounded-[100px] font-Helvetica text-[16px] min-w-[143px]'
              onClick={() => setIsMonth(true)}
            >
              Monthly
            </Button>
            <Button
              variant={!isMonth ? 'contained' : 'outlined'}
              className='rounded-[100px] border-2 font-Helvetica text-[16px] min-w-[143px]'
              onClick={() => setIsMonth(false)}
            >
              Annual
            </Button>
          </div>
        </div>
        <div className='w-full bg-gray grid grid-cols-2 rounded-[32px] max-md:flex max-md:flex-col-reverse'>
          {Array.from({ length: 2 }, (_, key) => (
            <div
              key={key}
              className={`col-span-1 flex md:justify-center justify-center md:hover:relative`}
            >
              <Card className='lg:w-[450px] lg:h-[555px] md:w-[350px] md:h-[620px] w-full rounded-[20px] border-black border-none col-span-1 md:hover:absolute md:hover:top-[-30px] md:transition duration-300 hover:bg-[#DDE3FF] bg-[#F4F4F6] shadow-none md:hover:shadow group'>
                <CardContent className='relative flex flex-col gap-5 font-Helvetica items-center border-none h-full'>
                  {popular[key] ? (
                    <Chip
                      variant='outlined'
                      size={'medium'}
                      className='absolute top-0 right-[10px] m-5 text-primary border-none rounded-[100px] bg-white'
                      label='Most Popular'
                    />
                  ) : null}
                  <div className='flex flex-col gap-5 w-full items-start max-md:items-center max-md:gap-3 mt-[28px] px-10 max-lg:px-5'>
                    <p className={`text-[36px] font-Helvetica font-bold group-hover:text-black text-primary`}>
                      ${isMonth ? [25, 99][key] : [18.75, 74.25][key]}
                      <span className='text-[17px] text-black'>/month</span>
                    </p>
                    <p className='text-black text-[13px] font-bold tracking-widest'>Includes a 14-day free trial and a 30-day money-back guarantee.</p>
                    <p className='text-black font-Geomanist text-[28px]'>{data[key].title}</p>
                    <p className='text-black text-[15px]'>{data[key].subTitle}</p>
                    <div className='flex items-center max-md:items-start w-full'>
                      <div className='flex flex-col gap-4'>
                        {planBenefits[key].map((item: string, index: number) => (
                          <div key={index} className='flex items-center gap-2'>
                            <CustomAvatar skin='light' size={20} className='group-hover:bg-[#c7cce5] bg-[#d8dcf2]'>
                              <i className='bx-check text-base group-hover:bg-black bg-[#3751DC]' />
                            </CustomAvatar>
                            <Typography
                              style={{ fontWeight: index == 0 ? 'bold' : 'normal', color: 'black', fontSize: '15px' }}
                            >
                              {item}
                            </Typography>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  <Button
                    className='w-[242px] rounded-[100px] text-[15px] md:absolute md:bottom-[30px] md:mx-auto max-md:w-full'
                    variant='contained'
                    onClick={() => handleCheckout(isMonth ? monthly[key]?.productId : annual[key].productId)}
                  >
                    Choose Plan
                  </Button>
                </CardContent>
              </Card>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

export default PaymentPlan
