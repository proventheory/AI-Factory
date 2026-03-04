// Type Imports
import type { ThemeColor } from '@core/types'

export type UsersType = {
  id: number | string
  role: string
  email: string
  status: string
  avatar: string
  website: string
  address: string
  name: string
  currentPlan: string
  avatarColor?: ThemeColor
  phoneNumber: string
  sub_plan: string
  sub_status: string
  amanager_id: string
}

export type AManagerType = {
  id: string
  email: string
  avatar: string
  name: string
}

export type RoleType = {
  content: string
  value: string
}