// React Imports
import React, { useEffect, useState } from 'react'

// MUI Imports
import Grid from '@mui/material/Grid'
import { TextField, Autocomplete } from '@mui/material'

import Paper from '@mui/material/Paper';

import Typography from '@mui/material/Typography'

import CustomTextField from '@core/components/mui/TextField'

import CustomColorPicker from '@/utils/colorPicker'

import type { Font } from '.';

type Props = {
  fonts: Font[]
  saveChange: (fonts: Font[]) => void
}


const StepFont = ({ fonts, saveChange }: Props) => {

  const [fontList, setFontList] = useState([{ label: '', id: '' }])
  const [first, setFirst] = useState<Font>(fonts[0])
  const [second, setSecond] = useState<Font>(fonts[1])

  const onChangeFirst = (e: React.ChangeEvent<HTMLInputElement>) => {
    console.log(e.target.name + e.target.value);
    setFirst({ ...first, [e.target.name]: e.target.value })
    saveChange([{ ...first, [e.target.name]: e.target.value }, second])
  }

  const handleSecondChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSecond({ ...second, [e.target.name]: e.target.value })
    saveChange([first, { ...second, [e.target.name]: e.target.value }])
  }

  const handleFirstColorChange = (value: string) => {
    setFirst({ ...first, fontFamily: value })
    saveChange([{ ...first, fontFamily: value }, second])
  }

  const handleSecondColorChange = (value: string) => {
    setSecond({ ...second, fontFamily: value })
    saveChange([first, { ...second, fontFamily: value }])
  }

  const onChangeColor = (id: number, color: string) => {
    if (id === 0) {
      setFirst({ ...first, color })
      saveChange([{ ...first, color }, second])
    } else if (id === 1) {
      setSecond({ ...second, color })
      saveChange([first, { ...second, color }])
    }
  }

  useEffect(() => {
    fetch(`https://www.googleapis.com/webfonts/v1/webfonts?key=${process.env.NEXT_PUBLIC_GOOGLE_FONTS_API_KEY}`)
      .then(response => response.json())
      .then(fontData => {
        const list = fontData.items.map((item: { family: string }) => ({ label: `${item.family}`, id: `${item.family}` }));

        setFontList(list)
      })
  }, [])

  return (
    <Grid container spacing={6}>
      <Grid item xs={12} lg={6} className='flex flex-col gap-6'>
        <div className='flex flex-col items-start gap-4'>
          <Typography variant='h6'>Primary Font</Typography>
          <div className='flex flex-col gap-4 w-full'>

            <CustomColorPicker
              color={first.color}
              onChangeColor={newColor => onChangeColor(0, newColor)}
            />

            <CustomTextField
              fullWidth
              size='medium'
              type='number'
              label='Font Size'
              placeholder='12'
              value={first.size}
              name='size'
              onChange={onChangeFirst}
              inputProps={{
                sx: {
                  height: { xs: '32px', sm: '32px' },
                }
              }}
            />
            <Autocomplete
              value={{ label: first.fontFamily, id: first.fontFamily }}
              id='fontFamily'
              fullWidth
              options={fontList}
              getOptionLabel={option => option.label}
              isOptionEqualToValue={(option, value) => option.id === value.id}

              PaperComponent={(props) => (
                <Paper
                  {...props}
                  style={{ fontFamily: `${props.children}` }}>{props?.children}</Paper>
              )}

              onChange={(_, value) => {
                if (value) {
                  handleFirstColorChange(value.id)
                }
              }}
              renderInput={params => (
                <TextField
                  {...params}
                  label='fontFamily'
                  InputLabelProps={{
                    style: { fontFamily: first.fontFamily }
                  }}
                  inputProps={{
                    ...params.inputProps,
                    style: { fontFamily: first.fontFamily }
                  }}
                />
              )}
            />
          </div>
        </div>
      </Grid>
      <Grid item xs={12} lg={6} className='flex flex-col gap-6'>
        <div className='flex flex-col items-start gap-4'>
          <Typography variant='h6'>Secondary Font</Typography>
          <div className='flex flex-col gap-4 w-full'>

            <CustomColorPicker
              color={second.color}
              onChangeColor={newColor => onChangeColor(1, newColor)}
            />
            <CustomTextField
              fullWidth
              size='medium'
              type='number'
              label='Font Size'
              placeholder='12'
              name='size'
              value={second.size}
              onChange={handleSecondChange}
              inputProps={{
                sx: {
                  height: { xs: '32px', sm: '32px' },
                }
              }}
            />
            <Autocomplete
              value={{ label: second.fontFamily, id: second.fontFamily }}
              id='fontFamily'
              options={fontList}
              fullWidth
              getOptionLabel={option => option.label}
              isOptionEqualToValue={(option, value) => option.id === value.id}
              onChange={(_, value) => {
                if (value) {
                  handleSecondColorChange(value.id)
                }
              }}
              renderInput={params => <TextField
                {...params}
                label='fontFamily'
                InputLabelProps={{
                  style: { fontFamily: second.fontFamily }
                }}
                inputProps={{
                  ...params.inputProps,
                  style: { fontFamily: second.fontFamily }
                }}
              />}
            />
          </div>
        </div>
      </Grid>
    </Grid >
  )
}

export default StepFont
