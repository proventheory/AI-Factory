'use client'

// React Imports
import { useState } from 'react'

// MUI Imports
import Card from '@mui/material/Card'
import Grid from '@mui/material/Grid'
import Button from '@mui/material/Button'
import Divider from '@mui/material/Divider'
import Typography from '@mui/material/Typography'
import CardHeader from '@mui/material/CardHeader'
import CardContent from '@mui/material/CardContent'
import CardActions from '@mui/material/CardActions'

import { toast } from 'react-toastify'

import CustomTextField from '@core/components/mui/TextField'

import type { layoutFormType, sectionType } from '@/types/pages/aiEngineTypes'

import { supabase } from '@/utils/supabase'

import { realHtmlGen } from '@/app/server/ai-engine'


// type templateType = {
//   id: string,
//   imageUrl: string
// }

const HtmlGenerator = () => {

  const [htmlFormData, setHtmlFormData] = useState<layoutFormType>({
    system_prompt: '',
    user_prompt: `"logo": "https://aimferclcnvhawzpruzn.supabase.co/storage/v1/object/public/upload/logo/1726562604234-ico",
"voicetone": "friendly and smarter",
"products": [
  {
    "name": "Men's Wool Runners",
    "link": "https://cdn.shopify.com/s/files/1/1104/4168/collections/Allbirds_M_Wool_Runner_Kotare_GREY_ANGLE.png?v=1542061248",
    "price": "$68"
  },
  {
    "name": "Men’s Wool & Tree Insoles",
    "link": "https://cdn.shopify.com/s/files/1/1104/4168/collections/Lounger_LightGrey_Insole_ba956188-b00a-4219-ac50-29e5b908f08b.png?v=1542063051",
    "price": "$34"
  },
  {
    "name": "Men's Tree Loungers",
    "link": "https://cdn.shopify.com/s/files/1/1104/4168/collections/CharcoalTreeLoungerToe_1.png?v=1542062369",
    "price": "$25"
  }
  ,
  {
    "name": "Men's Tree Toppers",
    "link": "https://cdn.shopify.com/s/files/1/1104/4168/collections/Allbirds_Sept_Oct_ReFresh_PDP_TR_TPR_Charcoal_LAT.png?v=1542063205",
    "price": "$25"
  }
  ,
  {
    "name": "Runner Lace Kit",
    "link": "https://cdn.shopify.com/s/files/1/1104/4168/collections/CLG_Lacepack_large_aac37922-deef-41f9-9d71-eb48ec38212f.png?v=1542066356",
    "price": "$25"
  }
  ,
  {
    "name": "Bird Mask",
    "link": "https://cdn.shopify.com/s/files/1/1104/4168/collections/Allbirds_Sept_Oct_ReFresh_PDP_MASK_Sideeye.png?v=1542066457",
    "price": "$25"
  }
  ,
  {
    "name": "Men's Sugar Zeffers",
    "link": "https://cdn.shopify.com/s/files/1/1104/4168/collections/Allbirds_Sugar_Zeffer_BLACK_BTY.png?v=1542062839",
    "price": "$45"
  }

],
"socialMedia": [
  {
    "name": "facebook",
    "link": "https://www.facebook.com/officialhouseofwise"
  },
  {
    "name": "twitter",
    "link": "https://www.twitter.com/officialhouseofwise"
  },
  {
    "name": "instagram",
    "link": "https://www.instagram.com/officialhouseofwise"
  }]`,
    user_context: ''
  })

  // const [templateList, setTemplateList] = useState<templateType[] | null>(null)

  // const [select, setSelect] = useState<templateType | null>(null)

  const templateList = ['37565353-b52b-49f3-8a2d-e06624bc303c', 'afad03ce-5575-433c-8051-c39e4ef514ff', '72bcdd5b-bd45-410e-811a-dfddd0739d19']

  const [html, setHtml] = useState<string>('')

  const getRandomInt = (min: number, max: number): number => {
    min = Math.ceil(min);
    max = Math.floor(max);

    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  const htmlgenerate = async () => {

    if (htmlFormData.user_context && htmlFormData.user_prompt) {

      const template_id = templateList[getRandomInt(0, 2)]

      const { data } = await supabase.from('section_templates').select('html, description, index, title').eq('template_id', template_id)

      const htmlSource = await supabase.from('templates').select('html').eq('id', template_id).single()

      if (!data || !htmlSource.data) {
        toast.warning(`Something went wrong`, {
          autoClose: 5000,
          type: 'error'
        })

        return
      }

      // setHtmlFormData({ ...htmlFormData, system_prompt: htmlSource.data?.html })

      const output = await realHtmlGen(data as sectionType[], htmlFormData)

      setHtml(output)

      toast.success(`Image description generated!`, {
        autoClose: 3000,
        type: 'success'
      })
    } else
      toast.warning(`Please Input image info correctly`, {
        autoClose: 5000,
        type: 'error'
      })

  }

  // const getTemplateList = async () => {

  //   const { data, error } = await supabase.from('templates').select('id, imageUrl')

  //   setTemplateList(data)

  //   if (error) console.error('templateList error', error)

  //   console.log('data', data)

  // }

  // useEffect(() => {

  //   getTemplateList()

  // }, [])

  return (
    <Card>
      <CardHeader title='Html Generate' />
      {/* <Divider />
      <form
        onSubmit={e => {
          e.preventDefault()
        }}
      >
        <CardContent>
          <Grid container spacing={6}>
            <Grid item xs={12} className='flex flex-row items-center justify-between'>
              <Typography variant='body2' className='font-medium'>
                Select template
              </Typography>
            </Grid>
            <Grid item xs={12} className='grid grid-cols-5 gap-4 max-md:gap-4 max-sm:grid-cols-3'>
              {
                templateList?.map((item: templateType, index) => {
                  return <img key={index} src={item.imageUrl} className="w-full h-auto" onClick={() => setSelect(item)} />
                })
              }
            </Grid>
          </Grid>
        </CardContent>
        <Divider />
        <CardActions>
          <Button type='submit' variant='contained' >
            Confirm Template
          </Button>
        </CardActions>
      </form> */}
      <Divider />
      <form
        onSubmit={e => {
          e.preventDefault()
          htmlgenerate()
        }}
      >
        <CardContent>
          <Grid container spacing={6}>
            <Grid item xs={12} className='flex flex-row items-center justify-between'>
              <Typography variant='body2' className='font-medium'>
                Html template
              </Typography>
            </Grid>
            <Grid item xs={12} sm={6}>
              <CustomTextField
                fullWidth
                minRows={4}
                maxRows={10}
                multiline
                label='Brand Info'
                placeholder='Brand Info'
                value={htmlFormData.user_prompt}
                sx={{ '& .MuiInputBase-root.MuiFilledInput-root': { alignItems: 'baseline' } }}
                onChange={e => setHtmlFormData({ ...htmlFormData, user_prompt: e.target.value })}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <CustomTextField
                fullWidth
                minRows={4}
                maxRows={10}
                multiline
                label='prompt'
                value={htmlFormData.user_context}
                onChange={e => setHtmlFormData({ ...htmlFormData, user_context: e.target.value })}
                placeholder='Please input prompt'
                sx={{ '& .MuiInputBase-root.MuiFilledInput-root': { alignItems: 'baseline' } }}
              />
            </Grid>

          </Grid>
        </CardContent>
        <Divider />
        <CardActions>
          <Button type='submit' variant='contained' >
            Html Generate
          </Button>
        </CardActions>
      </form>
      <Divider />

      <Grid item xs={12}>
        <Typography dangerouslySetInnerHTML={{ __html: html}} style={{
          overflow: 'auto'
        }} />
      </Grid>
    </Card>
  )
}

export default HtmlGenerator
