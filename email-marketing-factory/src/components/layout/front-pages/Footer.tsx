// MUI Imports
import Grid from '@mui/material/Grid'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'

// Third-party Imports
import classnames from 'classnames'

// Component Imports
import Link from '@components/Link'
import Logo_white from '@components/layout/shared/Logo_white'
import CustomTextField from '@core/components/mui/TextField'

// Util Imports
import { frontLayoutClasses } from '@layouts/utils/layoutClasses'

// Styles Imports
import styles from './styles.module.css'
import frontCommonStyles from '@views/front-pages/styles.module.css'

const Footer = () => {
  return (
    <footer className={frontLayoutClasses.footer}>
      <div className='relative'>
        <img
          src='/images/front-pages/footer-bg.png'
          alt='footer bg'
          className='absolute inset-0 is-full bs-full object-cover -z-[1]'
        />
        <div className={classnames('plb-[58px] text-white', frontCommonStyles.layoutSpacing)}>
          <Grid container rowSpacing={10} columnSpacing={12} justifyContent={'center'}>
            <Grid item xs={12} lg={5}>
              <div className='flex flex-col items-start gap-6'>
                <Link href='/front-pages/landing-page'>
                  <Logo_white color='var(--mui-palette-common-white)' />
                </Link>
                <Typography color='white' className='md:max-is-[390px] opacity-[0.78]'>
                  Join thousands of businesses already succeeding with us
                </Typography>
                <div className='flex items-end'>
                  <CustomTextField
                    size='small'
                    className={styles.inputBorder}
                    label='Subscribe to newsletter'
                    placeholder='Your email'
                    sx={{
                      '& .MuiInputBase-root': {
                        borderStartEndRadius: '0 !important',
                        borderEndEndRadius: '0 !important',
                        '&:not(.Mui-focused)': {
                          borderColor: 'rgb(var(--mui-mainColorChannels-dark) / 0.22)'
                        },
                        '&.MuiFilledInput-root:not(.Mui-focused):not(.Mui-disabled):hover': {
                          borderColor: 'rgba(255 255 255 / 0.6) !important'
                        }
                      }
                    }}
                  />
                  <Button
                    variant='contained'
                    sx={{
                      borderStartStartRadius: 0,
                      borderEndStartRadius: 0
                    }}
                    className='bg-primary border-primary'
                  >
                    Subscribe
                  </Button>
                </div>
              </div>
            </Grid>
            <Grid item xs={12} lg={5}>
              <Typography color='white' className='font-medium mbe-6 opacity-[0.92]'>
                Pages
              </Typography>
              <div className='flex flex-col gap-4'>
                <Typography component={Link} href='/pricing' color='white' className='opacity-[0.78]'>
                  Pricing
                </Typography>
                <Link href='/careers' className='flex items-center gap-[10px]'>
                  <Typography color='white' className='opacity-[0.78]'>
                    Careers
                  </Typography>
                  <Chip label='New' color='primary' size='small' />
                </Link>
                <Typography
                  component={Link}
                  href='/about-us'
                  color='white'
                  className='opacity-[0.78]'
                >
                  About Us
                </Typography>
                <Typography
                  component={Link}
                  href='/legal/privacy'
                  color='white'
                  className='opacity-[0.78]'
                >
                  Privacy Policy
                </Typography>
                <Typography
                  component={Link}
                  href='/legal/terms'
                  color='white'
                  className='opacity-[0.78]'
                >
                  Terms of Service
                </Typography>
              </div>
            </Grid>
          </Grid>
        </div>
      </div>
    </footer>
  )
}

export default Footer
