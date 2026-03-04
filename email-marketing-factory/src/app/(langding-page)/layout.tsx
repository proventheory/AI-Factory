// MUI Imports
import Button from '@mui/material/Button'

import 'react-perfect-scrollbar/dist/css/styles.css'

import { ToastContainer } from 'react-toastify'

import type { ChildrenType } from '@core/types'

import { IntersectionProvider } from '@/contexts/intersectionContext'

import Providers from '@components/Providers'
import BlankLayout from '@layouts/BlankLayout'
import FrontLayout from '@components/layout/front-pages'
import ScrollToTop from '@core/components/scroll-to-top'

// Style Imports
import '@/app/globals.css'

// Generated Icon CSS Imports
import '@assets/iconify-icons/generated-icons.css'

import { getSystemMode } from '@/@core/utils/serverHelpers'

export const metadata = {
  title: 'FOCUZ - Simplify email marketing for eCommerce with AI',
  description:
    'FOCUZ - Simplify email marketing for eCommerce with AI. Leverage cutting-edge artificial intelligence to optimize and automate your email marketing campaigns, driving engagement and boosting sales effortlessly.'
}

const Layout = ({ children }: ChildrenType) => {

  const systemMode = getSystemMode()

  return (
    <html id='__next'>
      <body className='flex is-full min-bs-full flex-auto flex-col'>
        <Providers direction='ltr'>
          <BlankLayout systemMode={systemMode}>
            <IntersectionProvider>
              <FrontLayout>
                <ToastContainer
                  position='top-right'
                  hideProgressBar
                  containerId={'landingPage'}
                />
                {children}
                <ScrollToTop className='mui-fixed'>
                  <Button
                    variant='contained'
                    className='is-10 bs-10 rounded-full p-0 min-is-0 flex items-center justify-center'
                  >
                    <i className='bx-up-arrow-alt' />
                  </Button>
                </ScrollToTop>
              </FrontLayout>
            </IntersectionProvider>
          </BlankLayout>
        </Providers>
      </body>
    </html>
  )
}

export default Layout
