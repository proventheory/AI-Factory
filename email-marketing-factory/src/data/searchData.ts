type SearchData = {
  id: string
  name: string
  url: string
  excludeLang?: boolean
  icon: string
  section: string
  shortcut?: string
}

const data: SearchData[] = [
  {
    id: '1',
    name: 'Campaigns',
    url: '/campaigns',
    icon: 'bx-envelope',
    section: 'Dashboards'
  },
  {
    id: '2',
    name: 'Brands',
    url: '/brands',
    icon: 'bx-brush',
    section: 'Dashboards'
  },
  {
    id: '3',
    name: 'Onboarding',
    url: '/onboarding',
    icon: 'bx-brush',
    section: 'Dashboards'
  },
]

export default data
