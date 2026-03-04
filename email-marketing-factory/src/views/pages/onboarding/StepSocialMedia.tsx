import { useState } from 'react'

import { Grid, Typography, Button, IconButton, TextField } from '@mui/material'

import type { UrlItem } from '.'

type Props = {
  socialMedia: UrlItem[]
  saveChange: (socialMedia: UrlItem[]) => void
}

const StepSocialMedia = ({ socialMedia: initialSocials, saveChange }: Props) => {
  const [socials, setSocials] = useState<UrlItem[]>(
    initialSocials.length > 0
      ? initialSocials
      : [
          { name: 'Facebook', link: '' },
          { name: 'X', link: '' },
          { name: 'Instagram', link: '' }
        ]
  )

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    itemIndex: number,
    field: 'name' | 'link'
  ) => {
    const { value } = e.target
    const newUrls = socials.map((social, index) => (index === itemIndex ? { ...social, [field]: value } : social))

    setSocials(newUrls)
    saveChange(newUrls)
  }

  const deleteURL = (index: number) => {
    const filteredURLs = socials.filter((_, i) => i !== index)

    setSocials(filteredURLs)
    saveChange(filteredURLs)
  }

  const addNewUrl = () => {
    const newUrl: UrlItem = { name: '', link: '' }
    const newUrls = [...socials, newUrl]

    setSocials(newUrls)
    saveChange(newUrls)
  }

  return (
    <Grid container spacing={6}>
      <Grid item container spacing={2}>
        {socials.map((url, index) => (
          <Grid item xs={12} key={index} className='flex flex-col gap-6'>
            <div className='flex flex-col items-start gap-4'>
              {index === 0 && <Typography variant='h6'>Social</Typography>}
              <div className='flex w-full items-center gap-2'>
                <div className='grid border-none w-full gap-3 grid-cols-3'>
                  <TextField
                    id={`name-${index}`}
                    className='col-span-1'
                    size='medium'
                    label='Name'
                    fullWidth
                    value={url.name}
                    disabled={index < 3}
                    onChange={e => handleChange(e, index, 'name')}
                  />
                  <div className='col-span-2 flex'>
                    <TextField
                      id={`link-${index}`}
                      size='medium'
                      label='Link'
                      fullWidth
                      value={url.link}
                      onChange={e => handleChange(e, index, 'link')}
                    />
                    {index > 2 && (
                      <IconButton size='small' className='m-2' onClick={() => deleteURL(index)}>
                        <i className='bx bx-x text-2xl' />
                      </IconButton>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </Grid>
        ))}
      </Grid>
      <Grid item xs={12}>
        <Button size='small' variant='contained' onClick={addNewUrl} startIcon={<i className='bx bx-plus' />}>
          Add new
        </Button>
      </Grid>
    </Grid>
  )
}

export default StepSocialMedia
