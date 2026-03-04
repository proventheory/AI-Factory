'use client'

// MUI Imports
import Grid from '@mui/material/Grid'

import UserListTable from './UserListTable'
import UserListCards from './UserListCards'

const UserList = () => {
  return (
    <Grid container spacing={6}>
      <Grid item xs={12}>
        <UserListCards />
      </Grid>
      <Grid item xs={12}>
        <UserListTable />
      </Grid>
    </Grid>
  )
}

export default UserList
