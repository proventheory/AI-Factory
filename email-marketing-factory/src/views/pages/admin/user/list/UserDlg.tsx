import { useEffect, useState } from 'react'

import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Grid, MenuItem, Typography } from '@mui/material'

import DialogCloseButton from '@/components/dialogs/DialogCloseButton'
import CustomTextField from '@/@core/components/mui/TextField'
import type { AManagerType, UsersType, RoleType } from '@/types/apps/userTypes'
import { getInitials } from '@/utils/getInitials'
import CustomAvatar from '@/@core/components/mui/Avatar'

type props = {
  open: boolean
  setOpen: (open: boolean) => void
  type: 'view' | 'edit'
  handleClose: () => void
  resetPassword: () => void
  userData: UsersType
  setUserData: (userData: UsersType) => void
  userRoles: RoleType[]
}

const status = ['active', 'inactive', 'suspended']
const plans = [{ value: 'core', content: 'Core Plan' }, { value: 'startup', content: 'Startup Plan' }, { value: 'none', content: 'None' }]


const UserDlg = ({ open, setOpen, type, handleClose, userData, setUserData, userRoles, resetPassword }: props) => {
  const [aManagers, setAManagers] = useState<AManagerType[] | null>(null)

  const readStyle = { readOnly: type === 'view' };

  useEffect(() => {
    const fetchAManagers = async () => {
      const res = await fetch('/api/user', {
        method: 'POST',
        body: JSON.stringify({ type: 'getAManagers' })
      })

      if (res.ok) {
        const data = await res.json()

        setAManagers(data.data)
      }
    }

    if (open)
      fetchAManagers()
  }, [open])

  return <Dialog
    closeAfterTransition={false}
    fullWidth
    open={open}
    maxWidth='md'
    scroll='body'
    sx={{ '& .MuiDialog-paper': { overflow: 'visible' } }}
  >
    <DialogCloseButton disableRipple onClick={() => setOpen(false)}>
      <i className='bx-x' />
    </DialogCloseButton>
    <DialogTitle variant='h4' className='flex gap-2 flex-col text-center sm:pbs-16 sm:pbe-6 sm:pli-16'>
      User Information
    </DialogTitle>
    <form onSubmit={e => e.preventDefault()}>
      <DialogContent className='overflow-visible pbs-0 sm:pli-16'>
        <Grid container spacing={5}>
          <Grid item xs={12}>
            <CustomTextField
              fullWidth
              label='Name'
              placeholder='John'
              value={userData?.name || ''}
              InputProps={readStyle}
              onChange={(e) => setUserData({ ...userData, name: e.target.value as string })}
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <CustomTextField
              fullWidth
              label='Email'
              type='email'
              placeholder='John@cultura.company'
              value={userData?.email || ''}
              InputProps={readStyle}
              onChange={(e) => setUserData({ ...userData, email: e.target.value as string })}
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <CustomTextField
              select
              fullWidth
              label='Status'
              InputProps={readStyle}
              value={userData?.status || ''}
              onChange={e => setUserData({ ...userData, status: e.target.value as string })}
            >
              {status.map((status, index) => (
                <MenuItem key={index} value={status.toLowerCase().replace(/\s+/g, '-')}>
                  {status}
                </MenuItem>
              ))}
            </CustomTextField>
          </Grid>
          <Grid item xs={12} sm={6}>
            <CustomTextField
              fullWidth
              InputProps={readStyle}
              label='website'
              placeholder='https://focuz.ai'
              value={userData?.website || ''}
              onChange={e => setUserData({ ...userData, website: e.target.value })}
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <CustomTextField
              fullWidth
              InputProps={readStyle}
              label='Address'
              placeholder='1523 Stellar Dr, Kenai, Alaska 99611, USA'
              value={userData?.address || ''}
              onChange={e => setUserData({ ...userData, address: e.target.value })}
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <CustomTextField
              InputProps={readStyle}
              fullWidth
              type='number'
              label='PhoneNumber'
              placeholder='+1 (907) 335-3331'
              value={userData?.phoneNumber || ''}
              onChange={e => setUserData({ ...userData, phoneNumber: e.target.value })}
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <CustomTextField
              select
              InputProps={readStyle}
              fullWidth
              label='UserRole'
              value={userData?.role || ''}
              onChange={e => setUserData({ ...userData, role: e.target.value })}>
              {userRoles && userRoles.length > 0 ? userRoles.map((role, index) => (
                <MenuItem key={index} value={role.value.toLowerCase().replace(/\s+/g, '-')} >
                  {role.content}
                </MenuItem>
              )) : <p className='text-center'>Empty</p>}
            </CustomTextField>
          </Grid>
          <Grid item xs={12}>
            <CustomTextField
              select
              InputProps={readStyle}
              fullWidth
              label='CurrentPlan'
              value={userData?.currentPlan || ''}
              onChange={e => setUserData({ ...userData, currentPlan: e.target.value })}>
              {plans.map((plan, index) => (
                <MenuItem key={index} value={plan.value.replace(/\s+/g, '-')} >
                  {plan.content}
                </MenuItem>
              ))}
            </CustomTextField>
          </Grid>
          <Grid item xs={12} sm={6}>
            <CustomTextField
              InputProps={{ readOnly: true }}
              fullWidth
              label='Subscription Status'
              value={userData?.sub_status || ''}
              onChange={e => setUserData({ ...userData, sub_status: e.target.value })}
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <CustomTextField
              InputProps={{ readOnly: true }}
              fullWidth
              label='Subscription Plan'
              value={userData?.sub_plan || ''}
              onChange={e => setUserData({ ...userData, sub_plan: e.target.value })}
            />
          </Grid>
          {userData?.role == 'user' && <Grid item xs={12}>
            <CustomTextField
              select
              InputProps={readStyle}
              fullWidth
              className='text-[50px]'
              label='Assign Account Manager'
              value={userData?.amanager_id || ''}
              onChange={e => setUserData({ ...userData, amanager_id: e.target.value })}>
              {aManagers && aManagers.filter(ele => ele.id != userData.id).length > 0 ? (
                [{ id: 'none', email: '', avatar: '', name: 'None' }, ...aManagers].map((manager, index) => (
                  <MenuItem key={index} value={manager.id}>
                    <div className='flex flex-row items-center gap-3 py-0'>
                      {index != 0 ? manager.avatar ? (
                        <CustomAvatar src={manager.avatar} size={20} />
                      ) : (
                        <CustomAvatar size={20}>
                          {getInitials(manager.name as string)}
                        </CustomAvatar>
                      ) : <></>}
                      <Typography
                        className="capitalize"
                        color="text.primary"
                      >
                        {manager.name}
                      </Typography>
                    </div>
                  </MenuItem>
                ))
              ) : (
                <p className='text-center'>No Account Manager</p>
              )}
            </CustomTextField>
          </Grid>
          }
          {type == 'edit' && <Grid item xs={12} sm={6}>
            <Button variant='contained' onClick={() => resetPassword()} color='error'>
              Reset Password
            </Button>
          </Grid>}
        </Grid >

      </DialogContent >
      <DialogActions className='justify-center pbs-0 sm:pbe-16 sm:pli-16'>
        {type == 'edit' && <Button variant='contained' type='submit' onClick={() => handleClose()}>
          Submit
        </Button>}
        <Button variant='tonal' color='secondary' type='reset' onClick={() => setOpen(false)} >
          Cancel
        </Button>
      </DialogActions>
    </form >
  </Dialog >
}

export default UserDlg
