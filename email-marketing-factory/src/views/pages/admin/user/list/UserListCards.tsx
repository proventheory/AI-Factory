// MUI Imports
import { useEffect, useState } from 'react'

import Grid from '@mui/material/Grid'

import type { UserDataType } from '@components/card-statistics/HorizontalWithSubtitle'

import HorizontalWithSubtitle from '@components/card-statistics/HorizontalWithSubtitle'

// Vars
const temp: UserDataType[] = [
  {
    title: 'Session',
    stats: '0',
    avatarIcon: 'bx-group',
    avatarColor: 'primary',
    trend: 'positive',
    trendNumber: '29%',
    subtitle: 'Total User'
  },
  {
    title: 'Paid Users',
    stats: '0',
    avatarIcon: 'bx-user-plus',
    avatarColor: 'error',
    trend: 'positive',
    trendNumber: '18%',
    subtitle: 'Last week analytics'
  },
  {
    title: 'Active Users',
    stats: '0',
    avatarIcon: 'bx-user-check',
    avatarColor: 'success',
    trend: 'negative',
    trendNumber: '14%',
    subtitle: 'Last week analytics'
  },
  {
    title: 'Pending Users',
    stats: '0',
    avatarIcon: 'bx-user-voice',
    avatarColor: 'warning',
    trend: 'positive',
    trendNumber: '42%',
    subtitle: 'Last week analytics'
  }
]

const UserListCards = () => {

  const [data, setData] = useState<UserDataType[]>(temp)

  const getData = async () => {
    try {
      const res = await fetch('/api/user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ type: 'getUserCard' }),
      })

      if (!res.ok) {
        throw new Error('Failed to fetch user data')
      }

      const response = await res.json()

      if (!response || !response.data) {
        throw new Error('Invalid response structure')
      }

      const temp = response.data

      setData(prevData => prevData.map((ele, index) => ({
        ...ele,
        stats: temp[index] || 0,
      })))
    } catch (error) {
      console.error('Error fetching user data:', error)
    }
  }

  useEffect(() => {

    getData()

  }, [])

  return (
    <Grid container spacing={6}>
      {data.map((item, i) => (
        <Grid key={i} item xs={12} sm={6} md={3}>
          <HorizontalWithSubtitle {...item} />
        </Grid>
      ))}
    </Grid>
  )
}

export default UserListCards
