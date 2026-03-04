'use client'

import { useEffect, useState } from 'react'

import { useParams, useRouter } from 'next/navigation'

import Link from 'next/link'

import { useDispatch } from 'react-redux'


import Card from '@mui/material/Card'

import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Divider from '@mui/material/Divider'

import Typography from '@mui/material/Typography'

import { FaEye, FaRegEdit, FaRegTrashAlt } from "react-icons/fa";

import mjml2html from 'mjml-browser'

import type { FilterFn } from '@tanstack/react-table'
import type { RankingInfo } from '@tanstack/match-sorter-utils'
import { toast } from 'react-toastify'

import { Dialog, DialogActions, DialogTitle, Grid, Pagination } from '@mui/material'

import type { Locale } from '@configs/i18n'

type ChipColorType = {
  color: ThemeColor
}

import { getLocalizedUrl } from '@/utils/i18n'
import type { ThemeColor } from '@/@core/types'
import { supabase } from '@/utils/supabase'
import { getSession } from '@/utils/queries'
import { loadingPrecess } from '@/redux-store/slices/loading'
import { success } from '@/utils/toasts'

declare module '@tanstack/table-core' {
  interface FilterFns {
    fuzzy: FilterFn<unknown>
  }
  interface FilterMeta {
    itemRank: RankingInfo
  }
}

type mjmlType = {
  content: string
  title: string
  category: string
  status: string
  id: string
}

const chipColor: { [key: string]: ChipColorType } = {
  Draft: { color: 'primary' },
  Sent: { color: 'success' },
  Scheduled: { color: 'warning' },
  product: { color: 'secondary' },
  newsletter: { color: 'success' },
}

const CampaignListTable = () => {

  const [data, setData] = useState<mjmlType[]>([])

  const [open, setOpen] = useState<boolean>(false)

  const [deleteItem, setDeleteItem] = useState<mjmlType | null>(null)

  const router = useRouter()

  const [activePage, setActivePage] = useState(0)

  const dispatch = useDispatch()

  const { lang: locale } = useParams()

  const getData = async () => {

    dispatch(loadingPrecess({ commonVisible: true }))

    const [session] = await Promise.all([getSession()])

    const { data, error } = await supabase.from('mjmls').select('*').eq('user_id', session?.user.id).is('deleted_at', null).order('created_at', { ascending: false })

    if (error) {
      toast.error('An error occurred while loading the campaign lists.', {
        autoClose: 5000,
        type: 'error',
        hideProgressBar: false
      })
    }
    else if (data) {
      const tempData: mjmlType[] =
        data.map(item => ({
          id: item.id,
          content: item.content,
          title: item.title ? item.title : 'Untited',
          category: item.type,
          status: 'Draft'
        })) || []

      setData(tempData)
    }

    dispatch(loadingPrecess({ commonVisible: false }))

  }

  useEffect(() => {
    getData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <>
      <Card>
        <Divider />
        <div className='flex items-center justify-end flex-wrap gap-4 p-6'>
          <div className='flex sm:items-center flex-wrap max-sm:flex-col max-sm:is-full gap-4'>
            <Button
              variant='contained'
              className='bg-primary'
              component={Link}
              href={getLocalizedUrl('/campaigns/add', locale as Locale)}
              startIcon={<i className='bx-plus' />}
            >
              New Campaign
            </Button>
          </div>
        </div>
        <div className='overflow-x-auto px-2'>
          {data?.length > 0 ? (
            <Grid container spacing={6}>
              {data.slice(activePage * 6, activePage * 6 + 6).map((item, index) => (
                <Grid item xs={12} sm={6} md={4} key={index} className='relative group'>
                  <div className='border p-2 rounded bs-full group-hover:opacity-30 transition-all duration-300 border-zinc-500'>
                    <div className='pli-2 pbs-2'>
                      <div className='h-[250px] w-auto overflow-hidden'>
                        <div dangerouslySetInnerHTML={{ __html: mjml2html(item.content).html }} />
                      </div>
                    </div>
                    <div className='flex flex-col gap-4 p-6'>
                      <div className='flex items-center justify-between'>
                        <Chip
                          label={item.category}
                          variant='tonal'
                          size='small'
                          color={chipColor[item.category].color}
                        />
                        <Chip label={item.status} variant='tonal' size='small' color={chipColor[item.status].color} />
                      </div>
                      <div className='flex flex-col gap-1'>
                        <Typography
                          variant='h5'
                          className='hover:text-primary'
                        >
                          <strong>{item.title}</strong>
                        </Typography>
                      </div>
                    </div>
                  </div>
                  <div className='w-full h-full hidden group-hover:flex items-center justify-center absolute inset-0 gap-2'>
                    <Button variant='contained' onClick={() => router.push(`/campaigns/pre/${item.id}`)}><FaEye /></Button>
                    <Button onClick={() => router.push(`/campaigns/edit/${item.id}`)} variant='contained' ><FaRegEdit /></Button>
                    <Button variant='contained' onClick={() => {
                      setOpen(true)
                      setDeleteItem(item)
                    }}><FaRegTrashAlt /></Button>
                  </div>
                </Grid>
              ))}
            </Grid>
          ) : (
            <Typography className='text-center'>No campaigns found</Typography>
          )}
          <div className='flex justify-center py-[20px]'>
            <Pagination
              count={Math.ceil(data?.length / 6)}
              page={activePage + 1}
              showFirstButton
              showLastButton
              shape='rounded'
              variant='tonal'
              color='primary'
              onChange={(e, page) => setActivePage(page - 1)}
            />
          </div>
        </div>
      </Card>

      <Dialog
        closeAfterTransition={false}
        open={open}
        disableEscapeKeyDown
        aria-labelledby='alert-dialog-title'
        aria-describedby='alert-dialog-description'
        onClose={(event, reason) => {
          if (reason !== 'backdropClick') {
            setOpen(false)
          }
        }}
      >
        <DialogTitle id='alert-dialog-title'>{`Delete the "${deleteItem?.title}" email?`}</DialogTitle>
        <DialogActions className='dialog-actions-dense'>
          <Button onClick={() => setOpen(false)}>Disagree</Button>
          <Button onClick={async () => {
            if (deleteItem?.id) {
              setOpen(false)
              const { error } = await supabase.from('mjmls').update({ 'deleted_at': new Date().toISOString() }).eq('id', deleteItem.id);

              if (!error) {
                success('Delete email successfully')
                getData()
              }
            }

          }}>Agree</Button>
        </DialogActions>
      </Dialog>
    </>
  )
}

export default CampaignListTable
