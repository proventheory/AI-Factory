// Next Imports
import { useEffect, useState } from 'react'

import { useParams } from 'next/navigation'

// MUI Imports
import { useTheme } from '@mui/material/styles'

// Third-party Imports
import PerfectScrollbar from 'react-perfect-scrollbar'

// Type Imports
import type { getDictionary } from '@/utils/getDictionary'
import type { VerticalMenuContextProps } from '@menu/components/vertical-menu/Menu'

// Component Imports
import { Menu, MenuItem } from '@menu/vertical-menu'

// import CustomChip from '@core/components/mui/Chip'

// import { GenerateVerticalMenu } from '@components/GenerateMenu'

// Hook Imports
import useVerticalNav from '@menu/hooks/useVerticalNav'

// Styled Component Imports
import StyledVerticalNavExpandIcon from '@menu/styles/vertical/StyledVerticalNavExpandIcon'

// Style Imports
import menuItemStyles from '@core/styles/vertical/menuItemStyles'
import menuSectionStyles from '@core/styles/vertical/menuSectionStyles'
import { supabase } from '@/utils/supabase'

// Menu Data Imports
// import menuData from '@/data/navigation/verticalMenuData'

type RenderExpandIconProps = {
  open?: boolean
  transitionDuration?: VerticalMenuContextProps['transitionDuration']
}

type Props = {
  dictionary: Awaited<ReturnType<typeof getDictionary>>
  scrollMenu: (container: any, isPerfectScrollbar: boolean) => void
}

const RenderExpandIcon = ({ open, transitionDuration }: RenderExpandIconProps) => (
  <StyledVerticalNavExpandIcon open={open} transitionDuration={transitionDuration}>
    <i className='bx-chevron-right' />
  </StyledVerticalNavExpandIcon>
)

const VerticalMenu = ({ dictionary, scrollMenu }: Props) => {
  // Hooks
  const theme = useTheme()
  const params = useParams()
  const verticalNavOptions = useVerticalNav()

  // Vars
  const { transitionDuration, isBreakpointReached } = verticalNavOptions
  const { lang: locale } = params

  const ScrollWrapper = isBreakpointReached ? 'div' : PerfectScrollbar

  const [role, setRole] = useState<string | null>(null)

  useEffect(() => {
    const getUserRole = async () => {
      const { data: { session } } = await supabase.auth.getSession()

      setRole(session?.user.user_metadata?.role || null)
    }

    getUserRole()
  }, [])

  return (
    // eslint-disable-next-line lines-around-comment
    <ScrollWrapper
      {...(isBreakpointReached
        ? {
          className: 'bs-full overflow-y-auto overflow-x-hidden',
          onScroll: container => scrollMenu(container, false)
        }
        : {
          options: { wheelPropagation: false, suppressScrollX: true },
          onScrollY: container => scrollMenu(container, true)
        })}
    >
      {/* Incase you also want to scroll NavHeader to scroll with Vertical Menu, remove NavHeader from above and paste it below this comment */}
      {/* Vertical Menu */}
      <Menu
        popoutMenuOffset={{ mainAxis: 27 }}
        menuItemStyles={menuItemStyles(verticalNavOptions, theme)}
        renderExpandIcon={({ open }) => <RenderExpandIcon open={open} transitionDuration={transitionDuration} />}
        renderExpandedMenuItemIcon={{ icon: <i className='bx-bxs-circle' /> }}
        menuSectionStyles={menuSectionStyles(verticalNavOptions, theme)}
      >

        <MenuItem href={`/${locale}/campaigns`} icon={<i className='bx-envelope' />}>
          {dictionary['navigation'].campaigns}
        </MenuItem>
        <MenuItem href={`/${locale}/brands`} icon={<i className='bx-brush' />}>
          {dictionary['navigation'].brands}
        </MenuItem>
        {['superAdmin', 'a_manager', 'admin'].includes(role as string) && (
          <>
            <MenuItem href={`/${locale}/admin/user`} icon={<i className='bx-user' />}>
              {dictionary['navigation'].user}
            </MenuItem>
            {/* <MenuItem href={`/${locale}/admin/prompts`} icon={<i className='bx-book-open' />}>
              {dictionary['navigation'].prompts}
            </MenuItem>
            <MenuItem href={`/${locale}/admin/test`} icon={<i className='bx-book-open' />}>
              {dictionary['navigation'].email}
            </MenuItem>
            <MenuItem href={`/${locale}/admin/section`} icon={<i className='bx-book-open' />}>
              {dictionary['navigation'].sectionAnalyzer}
            </MenuItem>
            <MenuItem href={`/${locale}/admin/image`} icon={<i className='bx-book-open' />}>
              {dictionary['navigation'].imageAnalyzer}
            </MenuItem>
            <MenuItem href={`/${locale}/admin/html`} icon={<i className='bx-book-open' />}>
              {dictionary['navigation'].htmlGenerate}
            </MenuItem> */}
          </>
        )}

      </Menu>
    </ScrollWrapper>
  )
}

export default VerticalMenu
