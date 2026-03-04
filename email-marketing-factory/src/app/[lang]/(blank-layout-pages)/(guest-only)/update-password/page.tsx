// Next Imports
import type { Metadata } from 'next'

// Component Imports
import ResetPassword from '@views/ResetPassword'

export const metadata: Metadata ={
  "title": "FOCUZ - Reset Your Password Securely",
  "description": "Reset your FOCUZ account password with ease. Regain access to AI-powered email marketing tools and continue optimizing your campaigns. Follow the secure steps to regain control and boost your email marketing performance."
}

const ResetPasswordPage = () => {
  return <ResetPassword />
}

export default ResetPasswordPage
