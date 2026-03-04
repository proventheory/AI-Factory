'use client'

import React, { useState } from 'react'

import Grid from '@mui/material/Grid'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'

import { IconButton } from '@mui/material'

import CustomColorPicker from '@/utils/colorPicker'

export type BrandColor = {
  primaryColor: string[]
  secondColor: string[]
}

type Props = {
  brandColor: BrandColor
  saveChange: (color: BrandColor) => void
}

const StepBrandingColor = ({ brandColor, saveChange }: Props) => {
  const [primaryColors, setPrimaryColors] = useState<string[]>(brandColor?.primaryColor)
  const [secondaryColors, setSecondaryColors] = useState<string[]>(brandColor?.secondColor)


  const onChangeColor = (id: number, index: number, color: string) => {
    if (id === 1) {
      const newPrimaryColors = [...primaryColors]

      newPrimaryColors[index] = color
      setPrimaryColors(newPrimaryColors)
      saveChange({ primaryColor: newPrimaryColors, secondColor: secondaryColors })
    } else if (id === 2) {
      const newSecondaryColors = [...secondaryColors]

      newSecondaryColors[index] = color
      setSecondaryColors(newSecondaryColors)
      saveChange({ primaryColor: primaryColors, secondColor: newSecondaryColors })
    }
  }

  const addPrimaryColor = () => {
    setPrimaryColors([...primaryColors, '#2511dd'])
  }

  const addSecondaryColor = () => {
    setSecondaryColors([...secondaryColors, '#2511dd'])
  }

  const deleteItem = (id: number, index: number) => {
    if (id === 1) {
      const newPrimaryColors = primaryColors.filter((_, i) => i !== index)

      setPrimaryColors(newPrimaryColors)
      saveChange({ primaryColor: newPrimaryColors, secondColor: secondaryColors })
    } else if (id === 2) {
      const newSecondaryColors = secondaryColors.filter((_, i) => i !== index)

      setSecondaryColors(newSecondaryColors)
      saveChange({ primaryColor: primaryColors, secondColor: newSecondaryColors })
    }
  }

  return (
    <div className='w-full flex flex-col gap-4'>
      <Typography variant='h6'>Brand color</Typography>
      <Grid container spacing={6}>
        <Grid item xs={12} lg={6} className='flex flex-col gap-6'>
          <div className='flex flex-col items-start gap-4'>
            <Button variant='contained' onClick={addPrimaryColor} className='w-[200px]'>
              Add Primary Color
            </Button>
            <div className='flex flex-col gap-4 w-full'>
              {primaryColors?.map((color, index) => (
                <div className='flex flex-row w-full' key={index} >

                  <CustomColorPicker
                    color={color}
                    onChangeColor={newColor=>onChangeColor(1, index, newColor)}
                  />

                  {primaryColors.length > 1 && (
                    <IconButton size='small' onClick={() => deleteItem(1, index)}>
                      <i className='bx bx-x text-2xl' />
                    </IconButton>
                  )}
                </div>
              ))}
            </div>
          </div>
        </Grid>
        <Grid item xs={12} lg={6} className='flex flex-col gap-6'>
          <div className='flex flex-col items-start gap-4'>
            <Button variant='contained' onClick={addSecondaryColor} className='w-[200px]'>
              Add Secondary Color
            </Button>
            <div className='flex flex-col gap-4 w-full'>
              {secondaryColors?.map((color, index) => (
                <div className='flex flex-row w-full' key={index}
                >
                  <CustomColorPicker
                    color={color}
                    onChangeColor={newColor=>onChangeColor(2, index, newColor)}
                  />
                  {secondaryColors.length > 1 && (
                    <IconButton size='small' onClick={() => deleteItem(2, index)}>
                      <i className='bx bx-x text-2xl' />
                    </IconButton>
                  )}
                </div>
              ))}
            </div>
          </div>
        </Grid>
      </Grid>
    </div>
  )
}

export default StepBrandingColor

