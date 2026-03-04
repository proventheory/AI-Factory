// Type Imports
export type Campaign = {
  id: number
  image: string
  user: string
  tutorImg: string
  completedTasks: number
  totalTasks: number
  userCount: number
  note: number
  view: number
  time: string
  logo: string
  courseTitle: string
  color: string
  desc: string
  status: string
  rating: number
  ratingCount: number, 
  category: string,
  mjml: string
}

export type CampaignDetails = {
  title: string
  about: string
  instructor: string
  instructorAvatar: string
  instructorPosition: string
  skillLevel: string
  totalLectures: number
  totalStudents: number
  isCaptions: boolean
  language: string
  length: string
  content: CampaignContent[]
  description: string[]
}

export type CampaignContent = {
  title: string
  id: string
  topics: CampaignTopic[]
}

export type CampaignTopic = {
  title: string
  time: string
  isCompleted: boolean
}

export type AcademyType = {
  courses: Campaign[]
  courseDetails: CampaignDetails
}


export type campaignType = {
  id: string
  name: string
  icon: string
  url: string
  type: string
}