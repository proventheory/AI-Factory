import type { Metadata } from 'next'

// Type Imports
import type { Locale } from '@configs/i18n'

// Component Imports
import Providers from '@components/Providers'
import BlankLayout from '@layouts/BlankLayout'
import NotFound from '@views/NotFound'

// Config Imports
import { i18n } from '@configs/i18n'

// Util Imports
import { getSystemMode } from '@core/utils/serverHelpers'

export const metadata: Metadata= {
  title: 'FOCUZ - Page Not Found',
  description:
    "Oops! It looks like the page you're looking for doesn't exist. Return to the FOCUZ homepage to explore our AI-powered email marketing solutions and get back on track with optimizing your campaigns."
}

const NotFoundPage = ({ params }: { params: { lang: Locale } }) => {
  // Vars
  const direction = i18n.langDirection[params.lang]
  const systemMode = getSystemMode()

  return (
    <Providers direction={direction}>
      <BlankLayout systemMode={systemMode}>
        <NotFound />
      </BlankLayout>
    </Providers>
  )
}

export default NotFoundPage
