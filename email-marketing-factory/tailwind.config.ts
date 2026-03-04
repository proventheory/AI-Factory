import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,css}'],
  presets: [require('@ai-factory/ui/preset')],
  corePlugins: {
    preflight: false
  },
  important: '#__next',
  plugins: [require('tailwindcss-logical'), require('./src/@core/tailwind/plugin')],
  theme: {
    extend: {
      fontFamily: {
        'Geomanist': ['Geomanist-Regular', 'sans-serif'],
        'Inter': ['Inter-Regular', 'sans-serif'],
        'Helvetica': ['HelveticaNowDisplay-Regular', 'sans-serif']
      },
      colors: {
        'primary': '#3751DC',
        'secondly': '#E7E8FE',
        'gray': '#F4F4F6'
      },
      keyframes: {
        slideUp: {
          '0%': { transform: 'translateY(0%)' },
          '100%': { transform: 'translateY(100%)' },
        }
      },
      animation: {
        slideUp: 'slideUp 2s ease-out forwards',
      },
    }
  },
}

export default config
