import { useState } from 'react'

import { Grid, Typography, Button, IconButton, TextField } from '@mui/material'

type Props = {
  contactInfo: { type: string, value: string }[]
  saveChange: (contactInfo: { type: string, value: string }[]) => void
}

const StepSocialMedia = ({ contactInfo: initialInfo, saveChange }: Props) => {
  const [infomation, setInfomation] = useState<{ type: string, value: string }[]>(
    initialInfo && initialInfo.length > 0
      ? initialInfo
      : [
        { type: 'Phone Number', value: '' },
        { type: 'Address', value: '' },
        { type: 'Default Email', value: '' }
      ]
  )

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    itemIndex: number,
    field: 'type' | 'value'
  ) => {
    const { value } = e.target
    const infomations = infomation.map((social, index) => (index === itemIndex ? { ...social, [field]: value } : social))

    setInfomation(infomations)
    saveChange(infomations)
  }

  const deleteURL = (index: number) => {
    const filteredURLs = infomation.filter((_, i) => i !== index)

    setInfomation(filteredURLs)
    saveChange(filteredURLs)
  }

  const addNewInfo = () => {
    const newInfo = { type: '', value: '' }
    const newUrls = [...infomation, newInfo]

    setInfomation(newUrls)
    saveChange(newUrls)
  }

  return (
    <Grid container spacing={6}>
      <Grid item container spacing={2}>
        {infomation.map((url, index) => (
          <Grid item xs={12} key={index} className='flex flex-col gap-6'>
            <div className='flex flex-col items-start gap-4'>
              {index === 0 && <Typography variant='h6'>Contact Infomation</Typography>}
              <div className='flex w-full items-center gap-2'>
                <div className='grid border-none w-full gap-3 grid-cols-3'>
                  <TextField
                    id={`name-${index}`}
                    className='col-span-1'
                    size='medium'
                    label='Name'
                    fullWidth
                    value={url.type}
                    disabled={index < 3}
                    onChange={e => handleChange(e, index, 'type')}
                  />
                  <div className='col-span-2 flex'>
                    <TextField
                      id={`link-${index}`}
                      size='medium'
                      label={index == 0 ? 'Number' : index == 1 ? 'Address' : index == 2 ? 'Email' : 'value'}
                      fullWidth
                      value={url.value}
                      onChange={e => handleChange(e, index, 'value')}
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
        <Button size='small' variant='contained' onClick={addNewInfo} startIcon={<i className='bx bx-plus' />}>
          Add new
        </Button>
      </Grid>
    </Grid>
  )
}

export default StepSocialMedia
