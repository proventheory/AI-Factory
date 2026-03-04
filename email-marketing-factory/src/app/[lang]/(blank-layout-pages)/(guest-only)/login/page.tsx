// Next Imports
import type { Metadata } from 'next'

// Component Imports
import Login from '@views/Login'

export const metadata: Metadata = {
  title: 'Focuz Login-Log in your Focuz account',
  description: 'Access your FOCUZ email marketing dashboard securely.  Log in now to harness the power of AI-driven email marketing.'
}

const LoginPage = () => {
  return <Login />
}

export default LoginPage
