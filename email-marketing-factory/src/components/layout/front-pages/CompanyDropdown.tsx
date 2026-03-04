// React Imports
import { Fragment, useEffect, useState } from 'react'
import type { CSSProperties, MouseEvent, ReactNode } from 'react'

// Next Imports
import { usePathname } from 'next/navigation'

// MUI Imports
import Typography from '@mui/material/Typography'
import Collapse from '@mui/material/Collapse'

// Third-party Imports
import classnames from 'classnames'
import {
  useFloating,
  useDismiss,
  useRole,
  useInteractions,
  useHover,
  offset,
  flip,
  size,
  autoUpdate,
  FloatingPortal,
  safePolygon,
  useTransitionStyles
} from '@floating-ui/react'

// Type Imports
import { Button } from '@mui/material'

import type { Mode } from '@core/types'

// Component Imports
import Link from '@components/Link'

type Props = {
  mode: Mode
  isBelowLgScreen: boolean
  isDrawerOpen: boolean
  setIsDrawerOpen: (open: boolean) => void
}

type MenuWrapperProps = {
  children: ReactNode
  refs: any
  isBelowLgScreen: boolean
  isOpen: boolean
  getFloatingProps: any
  top: number
  floatingStyles: CSSProperties
  isMounted: boolean
  styles: CSSProperties
}

// Constants
const pageData = [
  {
    title: 'About Us',
    href: '/about-us'
  },
  {
    title: 'Careers',
    href: '/careers '
  }
]

const MenuWrapper = (props: MenuWrapperProps) => {
  // Props
  const { children, refs, isBelowLgScreen, isOpen, getFloatingProps, top, floatingStyles, isMounted, styles } = props

  if (!isBelowLgScreen) {
    return (
      <FloatingPortal>
        {isMounted && (
          <div ref={refs.setFloating} className='z-[1201] lg:z-[11]' {...getFloatingProps()} style={floatingStyles}>
            <div
              className='flex gap-8 p-8'
              style={{
                ...styles,
                overflowY: 'auto',
                background: 'var(--mui-palette-background-paper)',
                minWidth: 100,
                borderRadius: 'var(--mui-shape-borderRadius)',
                outline: 0,
                boxShadow: 'var(--mui-shadows-3)',
                maxBlockSize: `calc((var(--vh, 1vh) * 100) - ${top}px)`
              }}
            >
              {children}
            </div>
          </div>
        )}
      </FloatingPortal>
    )
  }

  return (
    <Collapse in={isOpen}>
      <div className='flex flex-col gap-6 mbs-3'>{children}</div>
    </Collapse>
  )
}

const DropdownMenu = (props: Props) => {
  // Props
  const { isBelowLgScreen, isDrawerOpen, setIsDrawerOpen } = props

  // states
  const [isOpen, setIsOpen] = useState(false)

  // hooks
  const pathname = usePathname()

  const { y, refs, floatingStyles, context } = useFloating<HTMLElement>({
    placement: 'bottom',
    open: isOpen,
    ...(!isBelowLgScreen && { onOpenChange: setIsOpen }),
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(14),
      flip({ padding: 10 }),
      size({
        apply({ rects, elements, availableHeight }) {
          Object.assign(elements.floating.style, {
            maxHeight: `${availableHeight}px`,
            minWidth: `${rects.reference.width}px`
          })
        },
        padding: 10
      })
    ]
  })

  // Floating UI Transition Styles
  const { isMounted, styles } = useTransitionStyles(context, {
    // Configure both open and close durations:
    duration: 300,

    initial: {
      opacity: 0,
      transform: 'translateY(10px)'
    },
    open: {
      opacity: 1,
      transform: 'translateY(0px)'
    },
    close: {
      opacity: 0,
      transform: 'translateY(10px)'
    }
  })

  const hover = useHover(context, {
    handleClose: safePolygon({
      blockPointerEvents: true
    }),
    restMs: 25,
    delay: { open: 75 }
  })

  const dismiss = useDismiss(context)
  const role = useRole(context, { role: 'menu' })

  const { getReferenceProps, getFloatingProps } = useInteractions([dismiss, role, hover])

  const Tag = isBelowLgScreen ? 'div' : Fragment

  const handleLinkClick = () => {
    if (isBelowLgScreen) {
      isDrawerOpen && setIsDrawerOpen(false)
    } else {
      setIsOpen(false)
    }
  }

  useEffect(() => {
    if (!isDrawerOpen && isOpen) {
      setIsOpen(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDrawerOpen])

  return (
    <Tag {...(isBelowLgScreen && { className: 'flex flex-col' })}>
      <Typography
        variant='h6'
        component={Link}
        className={classnames(
          `flex items-center justify-between gap-2 plb-3 pli-1.5 hover:text-primary ${isBelowLgScreen ? 'w-40' : ''}`
        )}
        {...(isBelowLgScreen
          ? {
              onClick: (e: MouseEvent) => {
                e.preventDefault()
                setIsOpen(!isOpen)
              }
            }
          : {
              ref: refs.setReference,
              ...getReferenceProps()
            })}
      >
        {!isBelowLgScreen ? (
          <Button
            sx={{ color: 'black' }}
            className='font-Inter text-[16px] hover:text-primary font-medium'
            endIcon={
              <i
                className={classnames(
                  {
                    'bx-chevron-down': !isBelowLgScreen || (isBelowLgScreen && !isOpen),
                    'bx-chevron-up': isBelowLgScreen && isOpen
                  },
                  'text-xl'
                )}
              />
            }
          >
            Company
          </Button>
        ) : (
          <>
            <Button sx={{ color: 'black' }} className='font-Inter text-[16px] hover:text-primary font-medium'>
              Company
            </Button>
            <i
              className={classnames(
                {
                  'bx-chevron-down': !isBelowLgScreen || (isBelowLgScreen && !isOpen),
                  'bx-chevron-up': isBelowLgScreen && isOpen
                },
                'text-xl'
              )}
            />
          </>
        )}
      </Typography>
      <MenuWrapper
        refs={refs}
        isBelowLgScreen={isBelowLgScreen}
        isOpen={isOpen}
        getFloatingProps={getFloatingProps}
        top={y ? y - window.scrollY : 0}
        floatingStyles={floatingStyles}
        isMounted={isMounted}
        styles={styles}
      >
        <div className={`flex flex-col gap-4 ${isBelowLgScreen ? 'pl-10' : ''}`}>
          {pageData.map((page, index) => (
            <Link
              key={index}
              href={page.href}
              className={classnames('flex items-center gap-2 focus:outline-none hover:text-primary', {
                'font-Inter text-[16px] text-black': pathname.includes(page.href)
              })}
              onClick={handleLinkClick}
            >
              <span>{page.title}</span>
            </Link>
          ))}
        </div>
      </MenuWrapper>
    </Tag>
  )
}

export default DropdownMenu
