'use client'

// React Imports
import { useEffect } from 'react'

import Link from 'next/link'

import Drawer from '@mui/material/Drawer'
import useMediaQuery from '@mui/material/useMediaQuery'
import type { Theme } from '@mui/material/styles'
import IconButton from '@mui/material/IconButton'

// Third-party Imports
import classnames from 'classnames'

// Type Imports
import { Button, Typography } from '@mui/material'

import type { Mode } from '@core/types'
import CompanyDropdown from './CompanyDropdown'


type Props = {
  mode: Mode
  isDrawerOpen: boolean
  setIsDrawerOpen: (open: boolean) => void
}

type WrapperProps = {
  children: React.ReactNode
  isBelowLgScreen: boolean
  className?: string
  isDrawerOpen: boolean
  setIsDrawerOpen: (open: boolean) => void
}

const Wrapper = (props: WrapperProps) => {
  // Props
  const { children, isBelowLgScreen, className, isDrawerOpen, setIsDrawerOpen } = props

  if (isBelowLgScreen) {
    return (
      <Drawer
        variant='temporary'
        anchor='left'
        open={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        ModalProps={{
          keepMounted: true
        }}
        sx={{ '& .MuiDrawer-paper': { width: ['100%', 300] } }}
        className={classnames('p-5', className)}
      >
        <div className='p-4 flex flex-col gap-x-3'>
          <IconButton onClick={() => setIsDrawerOpen(false)} className='absolute inline-end-4 block-start-2'>
            <i className='bx-x' />
          </IconButton>
          {children}
        </div>
      </Drawer>
    )
  }

  return <div className={classnames('flex items-center flex-wrap gap-x-0', className)}>{children}</div>
}

const FrontMenu = (props: Props) => {
  const { isDrawerOpen, setIsDrawerOpen, mode } = props

  const isBelowLgScreen = useMediaQuery((theme: Theme) => theme.breakpoints.down('lg'))

  // const { intersections } = useIntersection()

  useEffect(() => {
    if (!isBelowLgScreen && isDrawerOpen) {
      setIsDrawerOpen(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isBelowLgScreen])

  return (
    <Wrapper isBelowLgScreen={isBelowLgScreen} isDrawerOpen={isDrawerOpen} setIsDrawerOpen={setIsDrawerOpen}>

      <Typography
        variant='h6'
        component={Link}
        href='/login'
        className={classnames(
          `flex items-center justify-between gap-2 plb-3 pli-1.5 hover:text-primary ${isBelowLgScreen ? 'w-70' : 'hidden'}`
        )}
      >
        <Button
          variant='outlined'
          sx={{ color: '#3751DC', borderColor: '#3751DC', borderWidth: '1px', borderRadius: '100px' }}
          className='font-Inter text-[16px] mr-[61px] hover:bg-primary hover:border-primary'
        >
          Login
        </Button>
      </Typography>

      <CompanyDropdown
        mode={mode}
        isBelowLgScreen={isBelowLgScreen}
        isDrawerOpen={isDrawerOpen}
        setIsDrawerOpen={setIsDrawerOpen}
      />
      <Typography
        variant='h6'
        component={Link}
        href='/pricing'
        className={classnames(
          `flex items-center justify-between gap-2 plb-3 pli-1.5 hover:text-primary ${isBelowLgScreen ? 'w-40' : ''}`
        )}
      >
        <Button sx={{ color: 'black' }} className='font-Inter text-[16px] hover:text-primary font-medium'>
          Pricing
        </Button>
      </Typography>
    </Wrapper>
  )
}

export default FrontMenu
