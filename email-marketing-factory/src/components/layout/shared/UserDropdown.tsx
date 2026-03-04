'use client'

import { useEffect, useRef, useState } from 'react'
import type { MouseEvent } from 'react'

import { useParams, useRouter } from 'next/navigation'

import { styled } from '@mui/material/styles'
import Badge from '@mui/material/Badge'
import Popper from '@mui/material/Popper'
import Fade from '@mui/material/Fade'
import Paper from '@mui/material/Paper'
import ClickAwayListener from '@mui/material/ClickAwayListener'
import MenuList from '@mui/material/MenuList'
import Typography from '@mui/material/Typography'
import MenuItem from '@mui/material/MenuItem'

import { Divider } from '@mui/material'

import type { Locale } from '@configs/i18n'

import CustomAvatar from '@core/components/mui/Avatar'

import { useSettings } from '@core/hooks/useSettings'

import { getLocalizedUrl } from '@/utils/i18n'

import { supabase } from '@/utils/supabase'
import { getSession } from '@/utils/queries'

const BadgeContentSpan = styled('span')({
  width: 8,
  height: 8,
  borderRadius: '50%',
  cursor: 'pointer',
  backgroundColor: 'var(--mui-palette-success-main)',
  boxShadow: '0 0 0 2px var(--mui-palette-background-paper)'
})

const UserDropdown = () => {
  const [open, setOpen] = useState(false)

  const anchorRef = useRef<HTMLDivElement>(null)

  const router = useRouter()

  const [session, setSession] = useState<any>()

  const { settings } = useSettings()
  const { lang: locale } = useParams()

  const handleDropdownOpen = () => {
    !open ? setOpen(true) : setOpen(false)
  }

  const handleDropdownClose = (event?: MouseEvent<HTMLLIElement> | (MouseEvent | TouchEvent), url?: string) => {
    if (url) {
      router.push(getLocalizedUrl(url, locale as Locale))
    }

    if (anchorRef.current && anchorRef.current.contains(event?.target as HTMLElement)) {
      return
    }

    setOpen(false)
  }

  useEffect(() => {
    const getUserRole = async () => {
      const [session] = await Promise.all([getSession()])

      setSession(session)
    }

    getUserRole()

  }, [])

  const handleUserLogout = async () => {
    try {
      // Sign out from the app
      await supabase.auth.signOut()
      router.push(getLocalizedUrl('login', 'en'))
    } catch (error) {
      console.error(error)


    }
  }

  return (
    <>
      <Badge
        ref={anchorRef}
        overlap='circular'
        badgeContent={<BadgeContentSpan onClick={handleDropdownOpen} />}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        className='mis-2.5'
      >
        <CustomAvatar
          ref={anchorRef}
          alt={session?.user?.name || ''}
          src={session?.user?.image || ''}
          onClick={handleDropdownOpen}
          className='cursor-pointer'
        />
      </Badge>
      <Popper
        open={open}
        transition
        disablePortal
        placement='bottom-end'
        anchorEl={anchorRef.current}
        className='min-is-[240px] !mbs-4 z-[1]'
      >
        {({ TransitionProps, placement }) => (
          <Fade
            {...TransitionProps}
            style={{
              transformOrigin: placement === 'bottom-end' ? 'right top' : 'left top'
            }}
          >
            <Paper className={settings.skin === 'bordered' ? 'border shadow-none' : 'shadow-lg'}>
              <ClickAwayListener onClickAway={e => handleDropdownClose(e as MouseEvent | TouchEvent)}>
                <MenuList>
                  <div className='flex items-center plb-2 pli-5 gap-2' tabIndex={-1}>
                    <CustomAvatar size={40} alt={session?.user?.user_metadata?.name || ''} src={session?.user?.image || ''} />
                    <div className='flex items-start flex-col'>
                      <Typography variant='h6'>{session?.user?.user_metadata?.name || ''}</Typography>
                      <Typography variant='body2' color='text.disabled'>
                        {session?.user?.email || ''}
                      </Typography>
                    </div>
                  </div>
                  <Divider className='mlb-1' />
                  <MenuItem className='gap-3' onClick={e => handleDropdownClose(e, '/account-settings')}>
                    <i className='bx-cog' />
                    <Typography color='text.primary'>Setting</Typography>
                  </MenuItem>
                  <Divider className='mlb-1' />
                  <MenuItem className='gap-3' onClick={handleUserLogout}>
                    <i className='bx-power-off' />
                    <Typography color='text.primary'>Logout</Typography>
                  </MenuItem>
                </MenuList>
              </ClickAwayListener>
            </Paper>
          </Fade>
        )}
      </Popper>
    </>
  )
}

export default UserDropdown
