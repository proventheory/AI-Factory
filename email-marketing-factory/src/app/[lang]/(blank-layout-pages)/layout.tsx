// Type Imports
import type { ChildrenType } from '@core/types'
import type { Locale } from '@configs/i18n'

// Component Imports
import Providers from '@components/Providers'
import BlankLayout from '@layouts/BlankLayout'

// Config Imports
import { i18n } from '@configs/i18n'

// Util Imports
import { getSystemMode } from '@core/utils/serverHelpers'

import 'react-toastify/dist/ReactToastify.css'
// eslint-disable-next-line import/order
import { ToastContainer } from 'react-toastify'

type Props = ChildrenType & {
  params: { lang: Locale }
}

const Layout = ({ children, params }: Props) => {
  // Vars
  const direction = i18n.langDirection[params.lang]
  const systemMode = getSystemMode()

  return (
    <Providers direction={direction}>
      <ToastContainer
        position='top-right'
        hideProgressBar
        containerId={'blank'}
      />
      <BlankLayout systemMode={systemMode}>{children}</BlankLayout>
    </Providers>
  )
}

export default Layout
