'use client'

import React, { useEffect, useState } from 'react'

import { useRouter } from 'next/navigation'

import { CardContent, Card, Badge, Typography, IconButton, Menu, MenuItem, CircularProgress } from '@mui/material'

import Button from '@mui/material/Button'

import Grid from '@mui/material/Grid'
import MoreVertIcon from '@mui/icons-material/MoreVert'

import { supabase } from '@/utils/supabase'
import { getSession } from '@/utils/queries'
import ImageComponent from '@/utils/imageComponent'

type BrandLogoType = {
  alt: string
  img: string
  is_default: boolean
  id: string
}

const Brand = () => {
  const [brandData, setBrandData] = useState<BrandLogoType[]>([])
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null)
  const [selectedBrandId, setSelectedBrandId] = useState<string | null>(null)
  const router = useRouter()
  const [loading, setLoading] = useState(true)

  const open = Boolean(anchorEl)

  const handleClick = (event: React.MouseEvent<HTMLElement>, brandId: string) => {
    setAnchorEl(event.currentTarget)
    setSelectedBrandId(brandId)
  }

  const handleDefault = async (brand_id: string) => {
    const error_data = await Promise.all(
      brandData.map(async item => {
        try {
          const { error } = await supabase
            .from('profiles_brand')
            .update({ is_default: item.id === brand_id })
            .eq('id', item.id)

          if (error) {
            return error
          }

          return null
        } catch (error) {
          return error
        }
      })
    )

    const filteredErrors = error_data.filter(error => error !== null)

    if (filteredErrors.length > 0) {
      console.error('Errors:', filteredErrors)
    } else {
      getBrandData()
    }
  }

  const handleClose = () => {
    setAnchorEl(null)
    setSelectedBrandId(null)
  }

  const getBrandData = async () => {
    setLoading(true)

    const [session] = await Promise.all([getSession()])

    const { data, error } = await supabase
      .from('profiles_brand')
      .select('id, is_default, data')
      .eq('user_id', session?.user.id)
      .order('created_at', { ascending: true })

    if (error) {
      console.log('getBrandData', error)
    }

    const transformedData: BrandLogoType[] =
      data?.map((item, index) => ({
        alt: `${index}`,
        img: item.data.logo,
        is_default: item.is_default,
        id: item.id
      })) || []

    setBrandData(transformedData)
    setLoading(false)
  }

  useEffect(() => {
    getBrandData()
  }, [])

  const options = ['Edit', 'Set as default']

  return (
    <Grid container spacing={6}>
      <Grid item xs={12}>
        <Card>
          <CardContent className='px-[40px]'>
            {!loading ? (
              <div className='flex flex-col gap-5'>
                <div className='flex w-full justify-end'>
                  <Button
                    variant='contained'
                    className='bg-primary'
                    startIcon={<i className='bx-plus' />}
                    onClick={() => router.push('/onboarding')}
                  >
                    New Brand
                  </Button>
                </div>
                <div className='grid grid-cols-4 max-lg:grid-cols-3 max-md:grid-cols-2 gap-10 max-sm:grid-cols-1'>
                  {brandData.length > 0 ? (
                    brandData.map((item, index) => {
                      return item.is_default ? (
                        <Badge
                          badgeContent={'default'}
                          color='primary'
                          key={index}
                          anchorOrigin={{ vertical: 'top', horizontal: 'left' }}
                          className='border rounded bs-full flex flex-col p-1'
                        >
                          <div className='flex w-full justify-end'>
                            <IconButton
                              aria-label='more'
                              id='long-button'
                              aria-controls={open ? 'long-menu' : undefined}
                              aria-expanded={open ? 'true' : undefined}
                              aria-haspopup='true'
                              onClick={event => handleClick(event, item.id)}
                            >
                              <MoreVertIcon />
                            </IconButton>
                            <Menu
                              id='long-menu'
                              MenuListProps={{
                                'aria-labelledby': 'long-button'
                              }}
                              anchorEl={anchorEl}
                              open={open}
                              onClose={handleClose}
                              slotProps={{
                                paper: {
                                  style: {
                                    maxHeight: 48 * 4.5,
                                    width: '20ch'
                                  }
                                }
                              }}
                            >
                              {options.map(option => (
                                <MenuItem
                                  key={option}
                                  onClick={async () => {
                                    if (selectedBrandId) {
                                      if (option !== 'Edit') await handleDefault(selectedBrandId)
                                      else {
                                        router.push(`/brands/${selectedBrandId}`)
                                      }
                                    }

                                    handleClose()
                                  }}
                                >
                                  {option}
                                </MenuItem>
                              ))}
                            </Menu>
                          </div>
                          <div className='flex justify-center items-center col-span-1 p-4'>
                            <ImageComponent src={item.img} alt={item.alt} width={200} height={200} style={{ height: '210px', objectFit: 'contain' }} />
                          </div>
                        </Badge>
                      ) : (
                        <div key={index} className='border rounded bs-full flex flex-col col-span-1 p-1'>
                          <div className='flex w-full justify-end'>
                            <IconButton
                              aria-label='more'
                              id='long-button'
                              aria-controls={open ? 'long-menu' : undefined}
                              aria-expanded={open ? 'true' : undefined}
                              aria-haspopup='true'
                              onClick={event => handleClick(event, item.id)}
                            >
                              <MoreVertIcon />
                            </IconButton>
                            <Menu
                              id='long-menu'
                              MenuListProps={{
                                'aria-labelledby': 'long-button'
                              }}
                              anchorEl={anchorEl}
                              open={open}
                              onClose={handleClose}
                              slotProps={{
                                paper: {
                                  style: {
                                    maxHeight: 48 * 4.5,
                                    width: '20ch'
                                  }
                                }
                              }}
                            >
                              {options.map(option => (
                                <MenuItem
                                  key={option}
                                  onClick={async () => {
                                    if (selectedBrandId) {
                                      if (option !== 'Edit') await handleDefault(selectedBrandId)
                                      else {
                                        router.push(`brands/${selectedBrandId}`)
                                      }
                                    }

                                    handleClose()
                                  }}
                                >
                                  {option}
                                </MenuItem>
                              ))}
                            </Menu>
                          </div>
                          <div className='flex justify-center items-center col-span-1 p-4'>
                            <ImageComponent src={item.img} alt={item.alt} width={200} height={200} style={{ height: '210px', objectFit: 'contain' }} />
                          </div>
                        </div>
                      )
                    })
                  ) : (
                    <Typography variant='h3'>No Brand</Typography>
                  )}
                </div>
              </div>
            ) : (
              <CircularProgress />
            )}
          </CardContent>
        </Card>
      </Grid>
    </Grid>
  )
}

export default Brand
