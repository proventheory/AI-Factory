// React Imports
import { useEffect, useState } from 'react'

// MUI Imports
import Button from '@mui/material/Button'
import Drawer from '@mui/material/Drawer'
import IconButton from '@mui/material/IconButton'
import MenuItem from '@mui/material/MenuItem'
import Typography from '@mui/material/Typography'
import Divider from '@mui/material/Divider'

import { useForm, Controller, useWatch } from 'react-hook-form'

import { toast } from 'react-toastify'

import type { AManagerType, UsersType, RoleType } from '@/types/apps/userTypes'

import CustomTextField from '@core/components/mui/TextField'
import CustomAvatar from '@/@core/components/mui/Avatar'
import { getInitials } from '@/utils/getInitials'

type Props = {
  open: boolean
  handleClose: () => void
  getUserData: () => void
  userRoles: RoleType[]
}

type FormValidateType = {
  name: string
  email: string
  role: string
  currentPlan: string
  status: string
}

type FormNonValidateType = {
  website: string
  address: string
  contact: string
  phoneNumber: string
  amanager_id: string
}

const initialData = {
  website: '',
  address: '',
  contact: '',
  phoneNumber: '',
  amanager_id: ''
}

const AddUserDrawer = (props: Props) => {
  const { open, handleClose, getUserData, userRoles } = props

  const [formData, setFormData] = useState<FormNonValidateType>(initialData)

  const [aManagers, setAManagers] = useState<AManagerType[] | null>(null)

  const {
    control,
    reset: resetForm,
    handleSubmit,
    formState: { errors }
  } = useForm<FormValidateType>({
    defaultValues: {
      name: '',
      email: '',
      role: '',
      currentPlan: '',
      status: ''
    }
  })

  const selectRole = useWatch({ control, name: 'role' })


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

  const onSubmit = async (data: FormValidateType) => {
    const newUser: UsersType = {
      name: data.name,
      email: data.email,
      role: data.role,
      currentPlan: data.currentPlan,
      status: data.status,
      id: '',
      avatar: '',
      website: formData.website,
      address: formData.address,
      phoneNumber: formData.phoneNumber,
      sub_plan: '',
      sub_status: '',
      amanager_id: formData.amanager_id

    }

    const res = await fetch('/api/user', {
      method: 'POST',
      body: JSON.stringify({ type: 'createList', data: newUser })
    })

    if (res.ok) {
      toast.success('User Registered Successfully', { autoClose: 3000, type: 'success' })
      handleClose()
      getUserData()
      setFormData(initialData)
      resetForm({ name: '', email: '', role: '', currentPlan: '', status: '' })
    } else {
      toast.warn('Registration error:', { autoClose: 3000, type: 'warning' })
    }
  }

  const handleReset = () => {
    handleClose()
    setFormData(initialData)
  }

  return (
    <Drawer
      open={open}
      anchor='right'
      variant='temporary'
      onClose={handleReset}
      ModalProps={{ keepMounted: true }}
      sx={{ '& .MuiDrawer-paper': { width: { xs: 300, sm: 400 } } }}
    >
      <div className='flex items-center justify-between p-6'>
        <Typography variant='h5'>Add New User</Typography>
        <IconButton size='small' onClick={handleReset}>
          <i className='bx-x text-textPrimary text-2xl' />
        </IconButton>
      </div>
      <Divider />
      <div className='p-6'>
        <form onSubmit={handleSubmit(data => onSubmit(data))} className='flex flex-col gap-6'>
          <Controller
            name='name'
            control={control}
            rules={{ required: true }}
            render={({ field }) => (
              <CustomTextField
                {...field}
                fullWidth
                label='Full Name'
                placeholder='John Doe'
                {...(errors.name && { error: true, helperText: 'This field is required.' })}
              />
            )}
          />
          <Controller
            name='email'
            control={control}
            rules={{ required: true }}
            render={({ field }) => (
              <CustomTextField
                {...field}
                fullWidth
                type='email'
                label='Email'
                placeholder='john@example.com'
                {...(errors.email && { error: true, helperText: 'This field is required.' })}
              />
            )}
          />
          <Controller
            name='currentPlan'
            control={control}
            rules={{ required: true }}
            render={({ field }) => (
              <CustomTextField
                select
                fullWidth
                id='select-plan'
                label='Select Plan'
                {...field}
                error={Boolean(errors.currentPlan)}
              >
                <MenuItem value='none'>None</MenuItem>
                <MenuItem value='startup'>Startup Plan</MenuItem>
                <MenuItem value='core'>Core Plan</MenuItem>
              </CustomTextField>
            )}
          />
          <Controller
            name='role'
            control={control}
            rules={{ required: true }}
            render={({ field }) => (
              <CustomTextField
                select
                fullWidth
                id='select-role'
                label='Select Role'
                {...field}
                error={Boolean(errors.role)}
              >
                {userRoles && userRoles.length > 0 ? userRoles.map((role, index) => (
                  <MenuItem key={index} value={role.value.toLowerCase().replace(/\s+/g, '-')} >
                    {role.content}
                  </MenuItem>
                )) : <p className='text-center'>Empty</p>}
              </CustomTextField>
            )}
          />
          <Controller
            name='status'
            control={control}
            rules={{ required: true }}
            render={({ field }) => (
              <CustomTextField
                select
                fullWidth
                id='status'
                label='Select Status'
                {...field}
                {...(errors.status && { error: true, helperText: 'This field is required.' })}
              >
                <MenuItem value='active'>Active</MenuItem>
                <MenuItem value='inactive'>Inactive</MenuItem>
                <MenuItem value='suspended'>Suspended</MenuItem>
              </CustomTextField>
            )}
          />
          <CustomTextField
            label='Website'
            fullWidth
            placeholder='https://example.com'
            value={formData.website}
            onChange={e => setFormData({ ...formData, website: e.target.value })}
          />
          <CustomTextField
            label='Address'
            fullWidth
            placeholder='Palmer, Alaska 99645, USA'
            value={formData.address}
            onChange={e => setFormData({ ...formData, address: e.target.value })}
          />
          <CustomTextField
            label='phoneNumber'
            fullWidth
            type='number'
            placeholder='+1 000 000-0000'
            value={formData.phoneNumber}
            onChange={e => setFormData({ ...formData, phoneNumber: e.target.value })}
          />
          {selectRole == 'user' && <CustomTextField
            select
            fullWidth
            id='select-amanager'
            value={formData.amanager_id}
            label='Assign Account Manager'
            onChange={e => setFormData({ ...formData, amanager_id: e.target.value })}>
            {aManagers && aManagers.length > 0 ? (
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
          </CustomTextField>}
          <div className='flex items-center gap-4'>
            <Button variant='contained' type='submit'>
              Submit
            </Button>
            <Button variant='tonal' color='error' type='reset' onClick={() => handleReset()}>
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </Drawer>
  )
}

export default AddUserDrawer
