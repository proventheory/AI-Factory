// Next Imports
import { useParams } from 'next/navigation'

// MUI Imports
import { useTheme } from '@mui/material/styles'

// Type Imports
import type { getDictionary } from '@/utils/getDictionary'
import type { VerticalMenuContextProps } from '@menu/components/vertical-menu/Menu'

// Component Imports
import HorizontalNav, { Menu, SubMenu, MenuItem } from '@menu/horizontal-menu'
import VerticalNavContent from './VerticalNavContent'
import CustomChip from '@core/components/mui/Chip'

// import { GenerateHorizontalMenu } from '@components/GenerateMenu'

// Hook Imports
import useVerticalNav from '@menu/hooks/useVerticalNav'

// Styled Component Imports
import StyledHorizontalNavExpandIcon from '@menu/styles/horizontal/StyledHorizontalNavExpandIcon'
import StyledVerticalNavExpandIcon from '@menu/styles/vertical/StyledVerticalNavExpandIcon'

// Style Imports
import menuItemStyles from '@core/styles/horizontal/menuItemStyles'
import menuRootStyles from '@core/styles/horizontal/menuRootStyles'
import verticalMenuItemStyles from '@core/styles/vertical/menuItemStyles'
import verticalNavigationCustomStyles from '@core/styles/vertical/navigationCustomStyles'
import verticalMenuSectionStyles from '@core/styles/vertical/menuSectionStyles'

// Menu Data Imports
// import menuData from '@/data/navigation/horizontalMenuData'

type RenderExpandIconProps = {
  level?: number
}

type RenderVerticalExpandIconProps = {
  open?: boolean
  transitionDuration?: VerticalMenuContextProps['transitionDuration']
}

const RenderExpandIcon = ({ level }: RenderExpandIconProps) => (
  <StyledHorizontalNavExpandIcon level={level}>
    <i className='bx-chevron-right' />
  </StyledHorizontalNavExpandIcon>
)

const RenderVerticalExpandIcon = ({ open, transitionDuration }: RenderVerticalExpandIconProps) => (
  <StyledVerticalNavExpandIcon open={open} transitionDuration={transitionDuration}>
    <i className='bx-chevron-right' />
  </StyledVerticalNavExpandIcon>
)

const HorizontalMenu = ({ dictionary }: { dictionary: Awaited<ReturnType<typeof getDictionary>> }) => {
  // Hooks
  const verticalNavOptions = useVerticalNav()
  const theme = useTheme()
  const params = useParams()

  // Vars
  const { transitionDuration } = verticalNavOptions
  const { lang: locale } = params

  return (
    <HorizontalNav
      switchToVertical
      verticalNavContent={VerticalNavContent}
      verticalNavProps={{
        customStyles: verticalNavigationCustomStyles(verticalNavOptions, theme),
        backgroundColor: 'var(--mui-palette-background-paper)'
      }}
    >
      <Menu
        rootStyles={menuRootStyles(theme)}
        renderExpandIcon={({ level }) => <RenderExpandIcon level={level} />}
        menuItemStyles={menuItemStyles(theme, 'bx-bxs-circle')}
        renderExpandedMenuItemIcon={{ icon: <i className='bx-bxs-circle' /> }}
        popoutMenuOffset={{
          mainAxis: ({ level }) => (level && level > 0 ? 6 : 10),
          alignmentAxis: 0
        }}
        verticalMenuProps={{
          menuItemStyles: verticalMenuItemStyles(verticalNavOptions, theme),
          renderExpandIcon: ({ open }) => (
            <RenderVerticalExpandIcon open={open} transitionDuration={transitionDuration} />
          ),
          renderExpandedMenuItemIcon: { icon: <i className='bx-bxs-circle' /> },
          menuSectionStyles: verticalMenuSectionStyles(verticalNavOptions, theme)
        }}
      >
        <SubMenu label={dictionary['navigation'].dashboards} icon={<i className='bx-home-smile' />}>
          <MenuItem href={`/${locale}/dashboards/crm`} icon={<i className='bx-doughnut-chart' />}>
            {dictionary['navigation'].crm}
          </MenuItem>
          <MenuItem href={`/${locale}/dashboards/analytics`} icon={<i className='bx-bar-chart-alt-2' />}>
            {dictionary['navigation'].analytics}
          </MenuItem>
          <MenuItem href={`/${locale}/dashboards/ecommerce`} icon={<i className='bx-cart-alt' />}>
            {dictionary['navigation'].eCommerce}
          </MenuItem>
          <MenuItem href={`/${locale}/dashboards/academy`} icon={<i className='bx-book-open' />}>
            {dictionary['navigation'].academy}
          </MenuItem>
          <MenuItem href={`/${locale}/dashboards/logistics`} icon={<i className='bx-car' />}>
            {dictionary['navigation'].logistics}
          </MenuItem>
        </SubMenu>
        <SubMenu label={dictionary['navigation'].apps} icon={<i className='bx-envelope' />}>
          <SubMenu label={dictionary['navigation'].eCommerce} icon={<i className='bx-cart-alt' />}>
            <MenuItem href={`/${locale}/apps/ecommerce/dashboard`}>{dictionary['navigation'].dashboard}</MenuItem>
            <SubMenu label={dictionary['navigation'].products}>
              <MenuItem href={`/${locale}/apps/ecommerce/products/list`}>{dictionary['navigation'].list}</MenuItem>
              <MenuItem href={`/${locale}/apps/ecommerce/products/add`}>{dictionary['navigation'].add}</MenuItem>
              <MenuItem href={`/${locale}/apps/ecommerce/products/category`}>
                {dictionary['navigation'].category}
              </MenuItem>
            </SubMenu>
            <SubMenu label={dictionary['navigation'].orders}>
              <MenuItem href={`/${locale}/apps/ecommerce/orders/list`}>{dictionary['navigation'].list}</MenuItem>
              <MenuItem
                href={`/${locale}/apps/ecommerce/orders/details/5434`}
                exactMatch={false}
                activeUrl='/apps/ecommerce/orders/details'
              >
                {dictionary['navigation'].details}
              </MenuItem>
            </SubMenu>
            <SubMenu label={dictionary['navigation'].customers}>
              <MenuItem href={`/${locale}/apps/ecommerce/customers/list`}>{dictionary['navigation'].list}</MenuItem>
              <MenuItem
                href={`/${locale}/apps/ecommerce/customers/details/879861`}
                exactMatch={false}
                activeUrl='/apps/ecommerce/customers/details'
              >
                {dictionary['navigation'].details}
              </MenuItem>
            </SubMenu>
            <MenuItem href={`/${locale}/apps/ecommerce/manage-reviews`}>
              {dictionary['navigation'].manageReviews}
            </MenuItem>
            <MenuItem href={`/${locale}/apps/ecommerce/referrals`}>{dictionary['navigation'].referrals}</MenuItem>
            <MenuItem href={`/${locale}/apps/ecommerce/settings`}>{dictionary['navigation'].settings}</MenuItem>
          </SubMenu>
          <SubMenu label={dictionary['navigation'].academy} icon={<i className='bx-book-open' />}>
            <MenuItem href={`/${locale}/apps/academy/dashboard`}>{dictionary['navigation'].dashboard}</MenuItem>
            <MenuItem href={`/${locale}/apps/academy/my-courses`}>{dictionary['navigation'].myCourses}</MenuItem>
            <MenuItem href={`/${locale}/apps/academy/course-details`}>
              {dictionary['navigation'].courseDetails}
            </MenuItem>
          </SubMenu>
          <SubMenu label={dictionary['navigation'].logistics} icon={<i className='bx-car' />}>
            <MenuItem href={`/${locale}/apps/logistics/dashboard`}>{dictionary['navigation'].dashboard}</MenuItem>
            <MenuItem href={`/${locale}/apps/logistics/fleet`}>{dictionary['navigation'].fleet}</MenuItem>
          </SubMenu>
          <MenuItem
            href={`/${locale}/apps/email`}
            icon={<i className='bx-envelope' />}
            exactMatch={false}
            activeUrl='/apps/email'
          >
            {dictionary['navigation'].email}
          </MenuItem>
          <MenuItem href={`/${locale}/apps/chat`} icon={<i className='bx-chat' />}>
            {dictionary['navigation'].chat}
          </MenuItem>
          <MenuItem href={`/${locale}/apps/calendar`} icon={<i className='bx-calendar' />}>
            {dictionary['navigation'].calendar}
          </MenuItem>
          <MenuItem href={`/${locale}/apps/kanban`} icon={<i className='bx-grid' />}>
            {dictionary['navigation'].kanban}
          </MenuItem>
          <SubMenu label={dictionary['navigation'].invoice} icon={<i className='bx-food-menu' />}>
            <MenuItem href={`/${locale}/apps/invoice/list`}>{dictionary['navigation'].list}</MenuItem>
            <MenuItem
              href={`/${locale}/apps/invoice/preview/4987`}
              exactMatch={false}
              activeUrl='/apps/invoice/preview'
            >
              {dictionary['navigation'].preview}
            </MenuItem>
            <MenuItem href={`/${locale}/apps/invoice/edit/4987`} exactMatch={false} activeUrl='/apps/invoice/edit'>
              {dictionary['navigation'].edit}
            </MenuItem>
            <MenuItem href={`/${locale}/apps/invoice/add`}>{dictionary['navigation'].add}</MenuItem>
          </SubMenu>
          <SubMenu label={dictionary['navigation'].user} icon={<i className='bx-user' />}>
            <MenuItem href={`/${locale}/apps/user/list`}>{dictionary['navigation'].list}</MenuItem>
            <MenuItem href={`/${locale}/apps/user/view`}>{dictionary['navigation'].view}</MenuItem>
          </SubMenu>
          <SubMenu label={dictionary['navigation'].rolesPermissions} icon={<i className='bx-check-shield' />}>
            <MenuItem href={`/${locale}/apps/roles`}>{dictionary['navigation'].roles}</MenuItem>
            <MenuItem href={`/${locale}/apps/permissions`}>{dictionary['navigation'].permissions}</MenuItem>
          </SubMenu>
        </SubMenu>
        <SubMenu label={dictionary['navigation'].pages} icon={<i className='bx-file-blank' />}>
          <MenuItem href={`/${locale}/pages/user-profile`} icon={<i className='bx-user-circle' />}>
            {dictionary['navigation'].userProfile}
          </MenuItem>
          <MenuItem href={`/${locale}/pages/account-settings`} icon={<i className='bx-cog' />}>
            {dictionary['navigation'].accountSettings}
          </MenuItem>
          <MenuItem href={`/${locale}/pages/faq`} icon={<i className='bx-help-circle' />}>
            {dictionary['navigation'].faq}
          </MenuItem>
          <MenuItem href={`/${locale}/pages/pricing`} icon={<i className='bx-dollar' />}>
            {dictionary['navigation'].pricing}
          </MenuItem>
          <SubMenu label={dictionary['navigation'].miscellaneous} icon={<i className='bx-info-circle' />}>
            <MenuItem href={`/${locale}/pages/misc/coming-soon`} target='_blank'>
              {dictionary['navigation'].comingSoon}
            </MenuItem>
            <MenuItem href={`/${locale}/pages/misc/under-maintenance`} target='_blank'>
              {dictionary['navigation'].underMaintenance}
            </MenuItem>
            <MenuItem href={`/${locale}/pages/misc/404-not-found`} target='_blank'>
              {dictionary['navigation'].pageNotFound404}
            </MenuItem>
            <MenuItem href={`/${locale}/pages/misc/401-not-authorized`} target='_blank'>
              {dictionary['navigation'].notAuthorized401}
            </MenuItem>
          </SubMenu>
          <SubMenu label={dictionary['navigation'].authPages} icon={<i className='bx-lock-open-alt' />}>
            <SubMenu label={dictionary['navigation'].login}>
              <MenuItem href={`/${locale}/pages/auth/login-v1`} target='_blank'>
                {dictionary['navigation'].loginV1}
              </MenuItem>
              <MenuItem href={`/${locale}/pages/auth/login-v2`} target='_blank'>
                {dictionary['navigation'].loginV2}
              </MenuItem>
            </SubMenu>
            <SubMenu label={dictionary['navigation'].register}>
              <MenuItem href={`/${locale}/pages/auth/register-v1`} target='_blank'>
                {dictionary['navigation'].registerV1}
              </MenuItem>
              <MenuItem href={`/${locale}/pages/auth/register-v2`} target='_blank'>
                {dictionary['navigation'].registerV2}
              </MenuItem>
              <MenuItem href={`/${locale}/pages/auth/register-multi-steps`} target='_blank'>
                {dictionary['navigation'].registerMultiSteps}
              </MenuItem>
            </SubMenu>
            <SubMenu label={dictionary['navigation'].verifyEmail}>
              <MenuItem href={`/${locale}/pages/auth/verify-email-v1`} target='_blank'>
                {dictionary['navigation'].verifyEmailV1}
              </MenuItem>
              <MenuItem href={`/${locale}/pages/auth/verify-email-v2`} target='_blank'>
                {dictionary['navigation'].verifyEmailV2}
              </MenuItem>
            </SubMenu>
            <SubMenu label={dictionary['navigation'].forgotPassword}>
              <MenuItem href={`/${locale}/pages/auth/forgot-password-v1`} target='_blank'>
                {dictionary['navigation'].forgotPasswordV1}
              </MenuItem>
              <MenuItem href={`/${locale}/pages/auth/forgot-password-v2`} target='_blank'>
                {dictionary['navigation'].forgotPasswordV2}
              </MenuItem>
            </SubMenu>
            <SubMenu label={dictionary['navigation'].resetPassword}>
              <MenuItem href={`/${locale}/pages/auth/reset-password-v1`} target='_blank'>
                {dictionary['navigation'].resetPasswordV1}
              </MenuItem>
              <MenuItem href={`/${locale}/pages/auth/reset-password-v2`} target='_blank'>
                {dictionary['navigation'].resetPasswordV2}
              </MenuItem>
            </SubMenu>
            <SubMenu label={dictionary['navigation'].twoSteps}>
              <MenuItem href={`/${locale}/pages/auth/two-steps-v1`} target='_blank'>
                {dictionary['navigation'].twoStepsV1}
              </MenuItem>
              <MenuItem href={`/${locale}/pages/auth/two-steps-v2`} target='_blank'>
                {dictionary['navigation'].twoStepsV2}
              </MenuItem>
            </SubMenu>
          </SubMenu>
          <SubMenu label={dictionary['navigation'].wizardExamples} icon={<i className='bx-spreadsheet' />}>
            <MenuItem href={`/${locale}/pages/wizard-examples/checkout`}>{dictionary['navigation'].checkout}</MenuItem>
            <MenuItem href={`/${locale}/pages/wizard-examples/property-listing`}>
              {dictionary['navigation'].propertyListing}
            </MenuItem>
            <MenuItem href={`/${locale}/pages/wizard-examples/create-deal`}>
              {dictionary['navigation'].createDeal}
            </MenuItem>
          </SubMenu>
          <MenuItem href={`/${locale}/pages/dialog-examples`} icon={<i className='bx-copy' />}>
            {dictionary['navigation'].dialogExamples}
          </MenuItem>
          <SubMenu label={dictionary['navigation'].widgetExamples} icon={<i className='bx-card' />}>
            <MenuItem href={`/${locale}/pages/widget-examples/basic`}>{dictionary['navigation'].basic}</MenuItem>
            <MenuItem href={`/${locale}/pages/widget-examples/advanced`}>{dictionary['navigation'].advanced}</MenuItem>
            <MenuItem href={`/${locale}/pages/widget-examples/statistics`}>
              {dictionary['navigation'].statistics}
            </MenuItem>
            <MenuItem href={`/${locale}/pages/widget-examples/charts`}>{dictionary['navigation'].charts}</MenuItem>
            <MenuItem href={`/${locale}/pages/widget-examples/gamification`}>
              {dictionary['navigation'].gamification}
            </MenuItem>
            <MenuItem href={`/${locale}/pages/widget-examples/actions`}>{dictionary['navigation'].actions}</MenuItem>
          </SubMenu>
          <SubMenu label={dictionary['navigation'].frontPages} icon={<i className='bx-file' />}>
            <MenuItem href='/front-pages/landing-page' target='_blank'>
              {dictionary['navigation'].landing}
            </MenuItem>
            <MenuItem href='/front-pages/pricing' target='_blank'>
              {dictionary['navigation'].pricing}
            </MenuItem>
            <MenuItem href='/front-pages/payment' target='_blank'>
              {dictionary['navigation'].payment}
            </MenuItem>
            <MenuItem href='/front-pages/checkout' target='_blank'>
              {dictionary['navigation'].checkout}
            </MenuItem>
            <MenuItem href='/front-pages/help-center' target='_blank'>
              {dictionary['navigation'].helpCenter}
            </MenuItem>
          </SubMenu>
        </SubMenu>
        <SubMenu label={dictionary['navigation'].formsAndTables} icon={<i className='bx-rename' />}>
          <MenuItem href={`/${locale}/forms/form-layouts`} icon={<i className='bx-layout' />}>
            {dictionary['navigation'].formLayouts}
          </MenuItem>
          <MenuItem href={`/${locale}/forms/form-validation`} icon={<i className='bx-check-square' />}>
            {dictionary['navigation'].formValidation}
          </MenuItem>
          <MenuItem href={`/${locale}/forms/form-wizard`} icon={<i className='bx-git-merge' />}>
            {dictionary['navigation'].formWizard}
          </MenuItem>
          <MenuItem href={`/${locale}/react-table`} icon={<i className='bx-table' />}>
            {dictionary['navigation'].reactTable}
          </MenuItem>
          <MenuItem
            icon={<i className='bx-rename' />}
            href={`${process.env.NEXT_PUBLIC_DOCS_URL}/docs/user-interface/form-elements`}
            suffix={<i className='bx-link-external text-xl' />}
            target='_blank'
          >
            {dictionary['navigation'].formELements}
          </MenuItem>
          <MenuItem
            icon={<i className='bx-columns' />}
            href={`${process.env.NEXT_PUBLIC_DOCS_URL}/docs/user-interface/mui-table`}
            suffix={<i className='bx-link-external text-xl' />}
            target='_blank'
          >
            {dictionary['navigation'].muiTables}
          </MenuItem>
        </SubMenu>
        <SubMenu label={dictionary['navigation'].charts} icon={<i className='bx-bar-chart-square' />}>
          <MenuItem href={`/${locale}/charts/apex-charts`} icon={<i className='bx-line-chart' />}>
            {dictionary['navigation'].apex}
          </MenuItem>
          <MenuItem href={`/${locale}/charts/recharts`} icon={<i className='bx-network-chart' />}>
            {dictionary['navigation'].recharts}
          </MenuItem>
        </SubMenu>
        <SubMenu label={dictionary['navigation'].others} icon={<i className='bx-dots-horizontal-rounded' />}>
          <MenuItem
            icon={<i className='bx-text' />}
            href={`${process.env.NEXT_PUBLIC_DOCS_URL}/docs/user-interface/foundation`}
            suffix={<i className='bx-link-external text-xl' />}
            target='_blank'
          >
            {dictionary['navigation'].foundation}
          </MenuItem>
          <MenuItem
            icon={<i className='bx-atom' />}
            href={`${process.env.NEXT_PUBLIC_DOCS_URL}/docs/user-interface/components`}
            suffix={<i className='bx-link-external text-xl' />}
            target='_blank'
          >
            {dictionary['navigation'].components}
          </MenuItem>
          <MenuItem
            icon={<i className='bx-menu' />}
            href={`${process.env.NEXT_PUBLIC_DOCS_URL}/docs/menu-examples/overview`}
            suffix={<i className='bx-link-external text-xl' />}
            target='_blank'
          >
            {dictionary['navigation'].menuExamples}
          </MenuItem>
          <MenuItem
            icon={<i className='bx-bxs-buoy' />}
            href='https://themeselection.com/support'
            suffix={<i className='bx-link-external text-xl' />}
            target='_blank'
          >
            {dictionary['navigation'].raiseSupport}
          </MenuItem>
          <MenuItem
            icon={<i className='bx-book' />}
            href={`${process.env.NEXT_PUBLIC_DOCS_URL}`}
            suffix={<i className='bx-link-external text-xl' />}
            target='_blank'
          >
            {dictionary['navigation'].documentation}
          </MenuItem>
          <MenuItem
            suffix={<CustomChip label='New' size='small' color='info' round='true' />}
            icon={<i className='bx-notification' />}
          >
            {dictionary['navigation'].itemWithBadge}
          </MenuItem>
          <MenuItem
            icon={<i className='bx-link' />}
            href='https://themeselection.com'
            target='_blank'
            suffix={<i className='bx-link-external text-xl' />}
          >
            {dictionary['navigation'].externalLink}
          </MenuItem>
          <SubMenu label={dictionary['navigation'].menuLevels} icon={<i className='bx-align-left' />}>
            <MenuItem>{dictionary['navigation'].menuLevel2}</MenuItem>
            <SubMenu label={dictionary['navigation'].menuLevel2}>
              <MenuItem>{dictionary['navigation'].menuLevel3}</MenuItem>
              <MenuItem>{dictionary['navigation'].menuLevel3}</MenuItem>
            </SubMenu>
          </SubMenu>
          <MenuItem disabled>{dictionary['navigation'].disabledMenu}</MenuItem>
        </SubMenu>
      </Menu>
      {/* <Menu
        rootStyles={menuRootStyles(theme)}
        renderExpandIcon={({ level }) => <RenderExpandIcon level={level} />}
        menuItemStyles={menuItemStyles(theme, 'bx-bxs-circle')}
        renderExpandedMenuItemIcon={{ icon: <i className='bx-bxs-circle' /> }}
        popoutMenuOffset={{
          mainAxis: ({ level }) => (level && level > 0 ? 6 : 10),
          alignmentAxis: 0
        }}
        verticalMenuProps={{
          menuItemStyles: verticalMenuItemStyles(verticalNavOptions, theme),
          renderExpandIcon: ({ open }) => (
            <RenderVerticalExpandIcon open={open} transitionDuration={transitionDuration} />
          ),
          renderExpandedMenuItemIcon: { icon: <i className='bx-bxs-circle' /> },
          menuSectionStyles: verticalMenuSectionStyles(verticalNavOptions, theme)
        }}
      >
        <GenerateHorizontalMenu menuData={menuData(dictionary)} />
      </Menu> */}
    </HorizontalNav>
  )
}

export default HorizontalMenu
