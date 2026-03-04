'use client'

import { useEffect, useState, useMemo } from 'react'

import Card from '@mui/material/Card'
import CardHeader from '@mui/material/CardHeader'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'
import Checkbox from '@mui/material/Checkbox'
import MenuItem from '@mui/material/MenuItem'
import { useDispatch } from 'react-redux'
import { styled } from '@mui/material/styles'
import TablePagination from '@mui/material/TablePagination'
import type { TextFieldProps } from '@mui/material/TextField'

import classnames from 'classnames'
import { rankItem } from '@tanstack/match-sorter-utils'
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
  getFilteredRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFacetedMinMaxValues,
  getPaginationRowModel,
  getSortedRowModel
} from '@tanstack/react-table'
import type { ColumnDef, FilterFn } from '@tanstack/react-table'
import type { RankingInfo } from '@tanstack/match-sorter-utils'

import { toast } from 'react-toastify'

import { Button } from '@mui/material'

import type { ThemeColor } from '@core/types'
import type { RoleType, UsersType } from '@/types/apps/userTypes'

import OptionMenu from '@core/components/option-menu'
import CustomTextField from '@core/components/mui/TextField'
import CustomAvatar from '@core/components/mui/Avatar'
import TablePaginationComponent from '@components/TablePaginationComponent'

import { getInitials } from '@/utils/getInitials'

import tableStyles from '@core/styles/table.module.css'
import UserDlg from './UserDlg'
import AddUserDrawer from './AddUserDrawer'
import { getSession } from '@/utils/queries'
import { loadingPrecess } from '@/redux-store/slices/loading'

declare module '@tanstack/table-core' {
  interface FilterFns {
    fuzzy: FilterFn<unknown>
  }
  interface FilterMeta {
    itemRank: RankingInfo
  }
}

type UsersTypeWithAction = UsersType & {
  action?: string
}

type UserRoleType = {
  [key: string]: { icon: string; color: string }
}

type UserStatusType = {
  [key: string]: ThemeColor
}

const Icon = styled('i')({})

const fuzzyFilter: FilterFn<any> = (row, columnId, value, addMeta) => {
  // Rank the item
  const itemRank = rankItem(row.getValue(columnId), value)

  // Store the itemRank info
  addMeta({
    itemRank
  })

  // Return if the item should be filtered in/out
  return itemRank.passed
}

const DebouncedInput = ({
  value: initialValue,
  onChange,
  debounce = 500,
  ...props
}: {
  value: string | number
  onChange: (value: string | number) => void
  debounce?: number
} & Omit<TextFieldProps, 'onChange'>) => {
  // States
  const [value, setValue] = useState(initialValue)

  useEffect(() => {
    setValue(initialValue)
  }, [initialValue])

  useEffect(() => {
    const timeout = setTimeout(() => {
      onChange(value)
    }, debounce)

    return () => clearTimeout(timeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  return <TextField {...props} value={value} onChange={e => setValue(e.target.value)} size='small' />
}

const userRoleObj: UserRoleType = {
  admin: { icon: 'bx-shield', color: 'error' },
  user: { icon: 'bx-user', color: 'warning' },
  a_manager: { icon: 'bx-briefcase', color: 'info' }
}

export const userStatusObj: UserStatusType = {
  active: 'primary',
  pending: 'warning',
  inactive: 'secondary'
}

export const userPlanObj: UserStatusType = {
  core: 'success',
  startup: 'info',
}

const columnHelper = createColumnHelper<UsersTypeWithAction>()

const UserListTable = () => {

  const [addUserOpen, setAddUserOpen] = useState(false)
  const [rowSelection, setRowSelection] = useState({})
  const [data, setData] = useState<UsersType[]>([])
  const [globalFilter, setGlobalFilter] = useState('')
  const [open, setOpen] = useState(false)
  const dispatch = useDispatch()
  const [type, setType] = useState<'view' | 'edit'>('view')
  const [userRoles, setUserRoles] = useState<RoleType[]>([])
  const [userData, setUserData] = useState<UsersType>({ id: '', name: '', email: '', role: '', currentPlan: '', sub_plan: '', sub_status: '', status: '', avatar: '', website: '', address: '', amanager_id: '', phoneNumber: '' })

  const columns = useMemo<ColumnDef<UsersTypeWithAction, any>[]>(
    () => [
      {
        id: 'select',
        header: ({ table }) => (
          <Checkbox
            {...{
              checked: table.getIsAllRowsSelected(),
              indeterminate: table.getIsSomeRowsSelected(),
              onChange: table.getToggleAllRowsSelectedHandler()
            }}
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            {...{
              checked: row.getIsSelected(),
              disabled: !row.getCanSelect(),
              indeterminate: row.getIsSomeSelected(),
              onChange: row.getToggleSelectedHandler()
            }}
          />
        )
      },
      columnHelper.accessor('name', {
        header: 'User',
        cell: ({ row }) => (
          <div className='flex items-center gap-4'>
            {getAvatar({ avatar: row.original.avatar, name: row.original.name })}
            <div className='flex flex-col'>
              <Typography variant='h6'>{row.original.name}</Typography>
              <Typography variant='body2'>{row.original.email}</Typography>
            </div>
          </div>
        )
      }),
      columnHelper.accessor('role', {
        header: 'Role',
        cell: ({ row }) => (
          <div className='flex items-center gap-2'>
            <Icon
              className={classnames('text-xl', userRoleObj[row.original.role].icon)}
              sx={{ color: `var(--mui-palette-${userRoleObj[row.original.role].color}-main)` }}
            />
            <Typography className='capitalize' color='text.primary'>
              {row.original.role}
            </Typography>
          </div>
        )
      }),
      columnHelper.accessor('currentPlan', {
        header: 'Plan',
        cell: ({ row }) => (
          <Chip
            variant='outlined'
            label={row.original.currentPlan}
            size='medium'
            color={userPlanObj[row.original.currentPlan]}
            className='capitalize'
          />
        )
      }),
      columnHelper.accessor('sub_plan', {
        header: 'sub_plan',
        cell: ({ row }) =>
          <Chip
            variant='filled'
            label={row.original.sub_plan}
            size='medium'
            color={userPlanObj[row.original.sub_plan]}
            className='capitalize'
          />
      }),
      columnHelper.accessor('sub_status', {
        header: 'sub_status',
        cell: ({ row }) => (
          <div className='flex items-center gap-3'>
            <Chip
              variant='filled'
              label={row.original.sub_status}
              size='medium'
              color={userStatusObj[row.original.sub_status]}
              className='capitalize'
            />
          </div>
        )
      }),
      columnHelper.accessor('status', {
        header: 'user_status',
        cell: ({ row }) => (
          <div className='flex items-center gap-3'>
            <Chip
              variant='outlined'
              label={row.original.status}
              size='medium'
              color={userStatusObj[row.original.status]}
              className='capitalize'
            />
          </div>
        )
      }),
      columnHelper.accessor('action', {
        header: 'Action',
        cell: ({ row }) => (
          <div className='flex items-center'>
            <OptionMenu
              iconButtonProps={{ size: 'medium' }}
              iconClassName='text-textSecondary'
              options={[
                {
                  text: 'View',
                  icon: 'bx-show text-[22px]',
                  menuItemProps: {
                    className: 'flex items-center gap-2 text-textSecondary', onClick: () => {
                      data.filter(ele => {
                        if (ele.id == row.original.id)
                          setUserData(ele)
                      })
                      setType('view')
                      setOpen(true)
                    }
                  }
                },
                {
                  text: 'Edit',
                  icon: 'bx-edit text-[22px]',
                  menuItemProps: {
                    className: 'flex items-center gap-2 text-textSecondary', onClick: () => {
                      data.filter(ele => {
                        if (ele.id == row.original.id)
                          setUserData(ele)
                      })
                      setType('edit')
                      setOpen(true)
                    }
                  }
                }
              ]}
            />
          </div>
        ),
        enableSorting: false
      })
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data]
  )

  const table = useReactTable({
    data: data as UsersType[],
    columns,
    filterFns: {
      fuzzy: fuzzyFilter
    },
    state: {
      rowSelection,
      globalFilter
    },
    initialState: {
      pagination: {
        pageSize: 10
      }
    },
    enableRowSelection: true, //enable row selection for all rows
    // enableRowSelection: row => row.original.age > 18, // or enable row selection conditionally per row
    globalFilterFn: fuzzyFilter,
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    onGlobalFilterChange: setGlobalFilter,
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    getFacetedMinMaxValues: getFacetedMinMaxValues()
  })

  const getAvatar = (params: Pick<UsersType, 'avatar' | 'name'>) => {
    const { avatar, name } = params

    if (avatar) {
      return <CustomAvatar src={avatar || 'avatar'} size={34} />
    } else {
      return <CustomAvatar size={34}>{getInitials(name.replace(/\w+/g, (match) => match.toUpperCase()) as string)}</CustomAvatar>
    }
  }

  const getUserData = async () => {

    dispatch(loadingPrecess({ visible: true, content: 'processing...' }))

    const [session] = await Promise.all([getSession()])

    const res = await fetch('/api/user', { method: 'POST', body: JSON.stringify({ type: 'getList', id: session?.user.id }) })
    const response = await res.json()

    if (!response)
      throw new Error('Filed to fetch userData')
    setData(response.data)

    dispatch(loadingPrecess({ visible: false, content: 'processing...' }))

  }

  const getUserRoles = async () => {
    dispatch(loadingPrecess({ visible: true, content: 'processing...' }))

    const [session] = await Promise.all([getSession()])
    const res = await fetch('/api/user', { method: 'POST', body: JSON.stringify({ type: 'getRoles', id: session?.user.id }) })

    if (res.ok) {
      const response = await res.json()

      setUserRoles(response.data)
    }

    dispatch(loadingPrecess({ visible: false, content: 'processing...' }))
  }

  useEffect(() => {
    getUserData()
    getUserRoles()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleClose = async () => {
    if (type == 'edit') {
      const res = await fetch(`/api/user`, { method: 'POST', body: JSON.stringify({ type: 'update', data: userData }) })

      if (res.ok) {
        toast.success('User updated successfully', { autoClose: 3000, type: 'success' })
        setOpen(false)
        getUserData()
      } else toast.error('Failed to update user. Please check the user email address', { autoClose: 3000, type: 'error' })
    }
  }

  const resetPassword = async () => {
    if (type == 'edit') {
      const res = await fetch('/api/user', { method: 'POST', body: JSON.stringify({ type: 'resetPassword', data: { email: userData.email } }) })

      if (res.ok) {
        toast.success('Password reset successfully', { autoClose: 3000, type: 'success' })
        setOpen(false)
      } else toast.error('Failed to update user. Please check the user email address', { autoClose: 3000, type: 'error' })
    }
  }

  return (
    <>
      <Card>
        <CardHeader title='Filters' className='pbe-4' />
        <div className='flex justify-between flex-col items-start md:flex-row md:items-center p-6 border-bs gap-4'>
          <CustomTextField
            select
            value={table.getState().pagination.pageSize}
            onChange={e => table.setPageSize(Number(e.target.value))}
            className='max-sm:is-full sm:is-[70px]'
          >
            <MenuItem value='10'>10</MenuItem>
            <MenuItem value='25'>25</MenuItem>
            <MenuItem value='50'>50</MenuItem>
          </CustomTextField>
          <div className='flex flex-col sm:flex-row max-sm:is-full items-start sm:items-center gap-4'>
            <DebouncedInput
              value={globalFilter ?? ''}
              onChange={value => setGlobalFilter(String(value))}
              placeholder='Search User'
              className='max-sm:is-full'
            />
            <Button
              variant='contained'
              startIcon={<i className='bx-plus' />}
              onClick={() => setAddUserOpen(!addUserOpen)}
              className='max-sm:is-full'
            >
              Add New User
            </Button>
          </div>
        </div>
        <div className='overflow-x-auto'>
          <table className={tableStyles.table}>
            <thead>
              {table.getHeaderGroups().map(headerGroup => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map(header => (
                    <th key={header.id}>
                      {header.isPlaceholder ? null : (
                        <>
                          <div
                            className={classnames({
                              'flex items-center': header.column.getIsSorted(),
                              'cursor-pointer select-none': header.column.getCanSort()
                            })}
                            onClick={header.column.getToggleSortingHandler()}
                          >
                            {flexRender(header.column.columnDef.header, header.getContext())}
                            {{
                              asc: <i className='bx-chevron-up text-xl' />,
                              desc: <i className='bx-chevron-down text-xl' />
                            }[header.column.getIsSorted() as 'asc' | 'desc'] ?? null}
                          </div>
                        </>
                      )}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            {!data || table.getFilteredRowModel().rows.length === 0 ? (
              <tbody>
                <tr>
                  <td colSpan={table.getVisibleFlatColumns().length} className='text-center'>
                    No data available
                  </td>
                </tr>
              </tbody>
            ) : (
              <tbody>
                {table
                  .getRowModel()
                  .rows.slice(0, table.getState().pagination.pageSize)
                  .map(row => {
                    return (
                      <tr key={row.id} className={classnames({ selected: row.getIsSelected() })}>
                        {row.getVisibleCells().map(cell => (
                          <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
                        ))}
                      </tr>
                    )
                  })}
              </tbody>
            )}
          </table>
        </div>
        <TablePagination
          component={() => <TablePaginationComponent table={table} />}
          count={table.getFilteredRowModel().rows.length}
          rowsPerPage={table.getState().pagination.pageSize}
          page={table.getState().pagination.pageIndex}
          onPageChange={(_, page) => {
            table.setPageIndex(page)
          }}
        />
      </Card>
      <UserDlg handleClose={handleClose} open={open} setOpen={setOpen} setUserData={setUserData} type={type} userData={userData} userRoles={userRoles} resetPassword={resetPassword} />

      <AddUserDrawer
        open={addUserOpen}
        handleClose={() => setAddUserOpen(!addUserOpen)}
        getUserData={getUserData}
        userRoles={userRoles}
      />
    </>
  )
}

export default UserListTable
