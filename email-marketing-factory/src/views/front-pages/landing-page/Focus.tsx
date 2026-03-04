// MUI Imports
import type { Theme } from '@mui/material'
import { useMediaQuery } from '@mui/material'
import Button from '@mui/material/Button'

// Styles Imports
import frontCommonStyles from '@views/front-pages/styles.module.css'

const Focus = () => {
  const isBelowLgScreen = useMediaQuery((theme: Theme) => theme.breakpoints.down(700))

  return (
    <section id='focus' className='pt-[150px] max-md:pt-[90px]'>
      <div className={frontCommonStyles.layoutSpacing}>
        <div className='flex flex-row items-center flex-wrap gap-5 md:justify-between justify-center sm:text-start text-center'>
          <div className='lg:text-5xl md:text-[40px] sm:text-[37px] text-black text-[25px] font-Geomanist'>
            <p>
              Instantly design your emails and <span className='text-[#3751DC] font-Geomanist'>focus</span>{' '}
              {isBelowLgScreen ? <></> : <br />} on what matters
            </p>
          </div>
          <Button
            variant='outlined'
            className='font-Helvetica hover:bg-primary'
            sx={{
              color: '#3751DC',
              borderColor: '#3751DC',
              height: '50px',
              borderRadius: '9999px',
              fontSize: '16px',
              borderWidth: '2px'
            }}
            href='/pricing'
          >
            Try for Free
          </Button>
        </div>
      </div>
    </section>
  )
}

export default Focus
