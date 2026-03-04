'use client'

// React Imports
import { forwardRef, useEffect, useRef } from 'react'

// Third-party Imports
import styled from '@emotion/styled'

// Type Imports
import type { VerticalNavContextProps } from '@menu/contexts/verticalNavContext'

// Component Imports
import FocuzLogo_Z from '@core/svg/Logo_Z'
import FocuzLogo from '@core/svg/Logo'

// Hook Imports
import useVerticalNav from '@menu/hooks/useVerticalNav'
import { useSettings } from '@core/hooks/useSettings'

type CustomLogoProps = {
  ishovered?: VerticalNavContextProps['isHovered']
  iscollapsed?: VerticalNavContextProps['isCollapsed']
  transitionduration?: VerticalNavContextProps['transitionDuration']
  isbreakpointreached?: VerticalNavContextProps['isBreakpointReached']
}

const CustomLogo = styled(
  forwardRef<SVGSVGElement, CustomLogoProps>((props, ref) => {

    const params = { ...props, iscollapsed: props.iscollapsed?.toString(), ishovered: props.ishovered?.toString(), isbreakpointreached: props.isbreakpointreached?.toString() };

    return <FocuzLogo {...params} ref={ref} />
  })
)<CustomLogoProps>`
  transition: ${({ transitionduration }) =>
    `margin-inline-start ${transitionduration}ms ease-in-out, opacity ${transitionduration}ms ease-in-out`};

  ${({ ishovered, iscollapsed, isbreakpointreached }) =>
    !isbreakpointreached && iscollapsed && !ishovered
      ? 'opacity: 0; margin-inline-start: 0;'
      : 'opacity: 1; margin-inline-start: 8px;'}
`

const Logo_Z = () => {
  // Refs
  const customLogoRef = useRef<SVGSVGElement>(null)

  // Hooks
  const { isHovered, transitionDuration, isBreakpointReached } = useVerticalNav()
  const { settings } = useSettings()

  // Vars
  const { layout } = settings

  useEffect(() => {
    if (layout !== 'collapsed') return

    if (customLogoRef.current) {
      if (!isBreakpointReached && layout === 'collapsed' && !isHovered) {
        customLogoRef.current.classList.add('hidden')
      } else {
        customLogoRef.current.classList.remove('hidden')
      }
    }
  }, [isHovered, layout, isBreakpointReached])

  return (
    <div className='flex items-center'>
      {layout == 'collapsed' && !isHovered && !isBreakpointReached ? (
        <FocuzLogo_Z className='text-2xl text-primary' />
      ) : (
        <></>
      )}
      <CustomLogo
        ref={customLogoRef}
        ishovered={isHovered}
        iscollapsed={layout === 'collapsed'}
        transitionduration={transitionDuration}
        isbreakpointreached={isBreakpointReached}
      />
    </div>
  )
}

export default Logo_Z
