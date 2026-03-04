// Third-party Imports
import Image from 'next/image'

import classnames from 'classnames'

// Styles Imports
import { Box } from '@mui/material'

import frontCommonStyles from '@views/front-pages/styles.module.css'

const GetStarted = () => {
  return (
    <section className='relative pt-[150px] max-md:pt-[90px]'>
      <div
        className={classnames(
          'flex items-center flex-wrap justify-center',
          frontCommonStyles.layoutSpacing
        )}
      >
        <Box
          sx={{
            width: '100%',
            maxWidth: '80vw',
            position: 'relative',
            height: 'auto',
            display: 'block'
          }}
        >
          <Image
            src='/images/logos/emailTemplate.svg'
            layout='responsive'
            width={800}
            height={600}
            objectFit='contain'
            alt='email template logo'
          />
        </Box>
      </div>
    </section>
  )
}

export default GetStarted
