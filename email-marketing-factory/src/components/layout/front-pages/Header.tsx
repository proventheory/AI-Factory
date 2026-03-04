'use client'

// React Imports
import { useState } from 'react'

// Next Imports
import Link from 'next/link'

import Image from 'next/image'

// MUI Imports
import { useRouter } from 'next/navigation'

import Button from '@mui/material/Button'
import SearchIcon from '@mui/icons-material/Search'
import useMediaQuery from '@mui/material/useMediaQuery'
import useScrollTrigger from '@mui/material/useScrollTrigger'

import type { Theme } from '@mui/material/styles'

// Third-party Imports
import classnames from 'classnames'

import { IconButton } from '@mui/material'

import { i18n } from '@configs/i18n'

// Type Imports
import type { Mode } from '@core/types'

// import Logo from '@components/layout/shared/Logo'
import FrontMenu from './FrontMenu'

// Util Imports
import { frontLayoutClasses } from '@layouts/utils/layoutClasses'

// Styles Imports
import styles from './styles.module.css'

const Header = ({ mode }: { mode: Mode }) => {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)

  const router = useRouter()

  const isBelowSmScreen = useMediaQuery((theme: Theme) => theme.breakpoints.down('sm'))
  const isBelowMdScreen = useMediaQuery((theme: Theme) => theme.breakpoints.up('lg'))

  // Detect window scroll
  const trigger = useScrollTrigger({
    threshold: 0,
    disableHysteresis: true
  })

  return (
    <>
      <header className={classnames(frontLayoutClasses.header, styles.header)}>
        <div className={classnames(frontLayoutClasses.navbar, styles.navbar, { [styles.headerScrolled]: trigger })} style={{ border: 'none' }}>
          <div className={classnames(frontLayoutClasses.navbarContent, styles.navbarContent)}>

            {isBelowSmScreen ? <div className='flex items-center h-[72px] w-full justify-evenly'>
              <IconButton onClick={() => setIsDrawerOpen(true)} className='-mis-2'>
                <i className='bx-menu text-[30px] text-[#384451]' />
              </IconButton>
              <Link href='/landing-page' className='p-4'>
                <Image src={'/images/logos/logo.svg'} alt={'logo'} loading='lazy' width={100} height={40} />
              </Link>
              <Button
                variant='outlined'
                href='https://calendly.com/hello-focuz'
                sx={{ color: '#3751DC', borderColor: '#3751DC', borderWidth: '1px', borderRadius: '100px' }}
                className='font-Inter text-[14px] hover:bg-primary hover:border-primary'
              >
                Schedule Demo
              </Button>
              <FrontMenu mode={mode} isDrawerOpen={isDrawerOpen} setIsDrawerOpen={setIsDrawerOpen} />
            </div> :
              <div className='flex flex-row justify-between h-[72px] w-full items-center'>
                <div className='flex flex-row items-center gap-4'>
                  <Link href='/landing-page'>
                    <Image src={'/images/logos/logo.svg'} alt={'logo'} loading='lazy' width={100} height={50} />
                  </Link>
                  {isBelowMdScreen && <FrontMenu mode={mode} isDrawerOpen={isDrawerOpen} setIsDrawerOpen={setIsDrawerOpen} />}
                </div>
                <div>
                  <Button
                    variant='outlined'
                    href='https://calendly.com/hello-focuz'
                    sx={{ color: '#3751DC', borderColor: '#3751DC', borderWidth: '1px', borderRadius: '100px' }}
                    className='font-Inter text-[16px] mr-[27px] hover:bg-primary hover:border-primary'
                  >
                    Schedule Demo
                  </Button>
                  <Button
                    variant='outlined'
                    sx={{ color: '#3751DC', borderColor: '#3751DC', borderWidth: '1px', borderRadius: '100px' }}
                    className='font-Inter text-[16px] mr-[61px] hover:bg-primary hover:border-primary'
                    onClick={() => {
                      router.push(`/${i18n.defaultLocale}/login`)
                    }}
                  >
                    Login
                  </Button>
                  <Button>
                    <SearchIcon sx={{ color: 'black' }} className='text-[35px]' />
                  </Button>
                </div>

              </div>
            }


          </div>
        </div>
      </header >
    </>
  )
}

export default Header
