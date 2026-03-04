// Next Imports
import type { Metadata } from 'next'

// Component Imports
import Register from '@views/Register'

export const metadata: Metadata = {
  title: 'FOCUZ - Register Now to Transform Your Email Marketing',
  description: 'Sign up for FOCUZ and unlock the full potential of AI-powered email marketing. Create an account today to start building, managing, and optimizing your campaigns with ease. Experience increased engagement and higher sales.'
}

const RegisterPage = () => {
  return <Register />
}

export default RegisterPage
