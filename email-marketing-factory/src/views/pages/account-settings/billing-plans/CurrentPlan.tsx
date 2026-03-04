'use client'

import { useEffect, useState } from 'react'

import { useRouter } from 'next/navigation'

import Card from '@mui/material/Card'
import CardHeader from '@mui/material/CardHeader'
import CardContent from '@mui/material/CardContent'
import Grid from '@mui/material/Grid'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Alert from '@mui/material/Alert'
import AlertTitle from '@mui/material/AlertTitle'
import LinearProgress from '@mui/material/LinearProgress'

import { toast } from 'react-toastify'

import Lottie from 'lottie-react'

import { getSession } from '@/utils/queries'

import loadingData from '@/utils/loading1.json'

const CurrentPlan = () => {

  const router = useRouter()

  const [plan, setPlan] = useState({ created: '', expired_at: '', name: '', description: '', type: '', amount: '', diff: '', totalPlanDays: '', status: '' })

  const [loading, setLoading] = useState<boolean>(true)

  const fetchSubscription = async () => {

    const session = await getSession()

    setLoading(true)

    const res = await fetch('/api/subscription', { method: 'POST', body: JSON.stringify({ type: 'getPlan', user_id: session?.user.id }) })

    const { created, expired_at, name, description, type, amount, status } = await res.json();

    if (created && expired_at && name && description && type && amount) {

      const diff = Number(new Date(expired_at)) - Number(new Date()) > 0 ? Math.floor((Number(new Date(expired_at)) - Number(new Date())) / (1000 * 60 * 60 * 24)) : 0

      const totalPlanDays = Math.floor(Number(new Date(expired_at)) - Number(new Date(created))) / (1000 * 60 * 60 * 24);

      setPlan({ ...plan, created, expired_at, name, description, type, amount, diff: diff.toString(), totalPlanDays: totalPlanDays.toString(), status })
      setLoading(false)
    }
    else
      toast.error('Oops! something went wrong', { autoClose: 5000, type: 'warning' })
  }

  const createPortal = async () => {

    setLoading(true)

    const session = await getSession()

    const res = await fetch('/api/subscription', { method: 'POST', body: JSON.stringify({ type: 'createPortal', user_id: session?.user.id }) })

    const { redirectUrl } = await res.json()

    if (redirectUrl)
      router.push(redirectUrl)
    else
      toast.error('Oops! something went wrong', { autoClose: 5000, type: 'warning' })

    setLoading(false)
  }

  useEffect(() => {

    fetchSubscription()

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <Card>
      <CardHeader title='Current Plan' />
      {!loading ? <CardContent>
        <Grid container spacing={6}>
          <Grid item xs={12} md={6} className='flex flex-col gap-6'>
            <div className='flex flex-col gap-1'>
              <Typography variant='h6'>{plan.name}</Typography>
              <Typography>{plan.description}</Typography>
            </div>
            {plan.status == 'active' && <div className='flex flex-col gap-1'>
              <Typography variant='h6'>Active until {(() => {
                const formattedDate = new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'short', day: '2-digit' }).format(new Date(plan.expired_at));

                return formattedDate

              })()}</Typography>
              <Typography>We will send you a notification upon Subscription expiration</Typography>
            </div>}
            <div className='flex flex-col gap-1'>
              <div className='flex items-center gap-1.5'>
                <Typography variant='h6'>${plan.amount} Per {plan.type}</Typography>
                {plan.name.includes('Agency ') && <Chip color='primary' variant='tonal' label='Most Popular' size='small' />}
              </div>
            </div>
          </Grid>
          <Grid item xs={12} md={6} className='flex flex-col gap-6'>
            {Number(plan.diff) > 0 && plan.status == 'active' ? <Alert security='success'>
              <AlertTitle>
                All systems go!
              </AlertTitle>
              Your plan is active and up to date
            </Alert> : <Alert severity='warning'>
              <AlertTitle>We need your attention!</AlertTitle>
              Your plan requires update
            </Alert>}
            {plan.status == 'active' && <div className='flex flex-col gap-1'>
              <div className='flex items-center justify-between'>
                <Typography variant='h6'>Days</Typography>
                <Typography variant="h6">
                  {Number(plan.diff) > 0
                    ? `${Number(plan.totalPlanDays) - Number(plan.diff)} of ${plan.totalPlanDays} Days`
                    : '0 days'}
                </Typography>
              </div>
              <LinearProgress variant='determinate' value={(Number(plan.totalPlanDays) - Number(plan.diff)) * 100 / Number(plan.totalPlanDays)} />
              <Typography variant='body2'>{plan.diff} days remaining until your plan requires update</Typography>
            </div>}
          </Grid>
          <Grid item xs={12} className='flex gap-4 flex-wrap'>
            <Button className='bg-primary' variant='contained' onClick={createPortal}>Upgrade Plan</Button>
            <Button color='secondary' variant='tonal' href='/pricing'>Choose plan</Button>
          </Grid>
        </Grid>
      </CardContent> : <div className={`flex w-full h-full items-center justify-center `}>
        <Lottie animationData={loadingData} className="!w-[150px] !h-[150px]" />
      </div>}
    </Card>
  )
}

export default CurrentPlan
