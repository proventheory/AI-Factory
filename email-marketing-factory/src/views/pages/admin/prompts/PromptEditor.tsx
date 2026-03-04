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

// Styled Component Imports
import { htmlgen, jsongen, layoutgen } from '@/app/server/ai-engine'
import type { layoutFormType } from '@/types/pages/aiEngineTypes'
import { supabase } from '@/utils/supabase'
import { getSession } from '@/utils/queries'

const PromptEditor = () => {
  const [layoutFormData, setLayoutFormData] = useState<layoutFormType>({
    system_prompt: '',
    user_prompt: '',
    user_context: ''
  })

  const [jsonFormData, setJsonFormData] = useState<layoutFormType>({
    system_prompt: '',
    user_prompt: '',
    user_context: ''
  })

  const [htmlFormData, setHtmlFormData] = useState<layoutFormType>({
    system_prompt: '',
    user_prompt: '',
    user_context: ''
  })

  const [layoutDescription, setLayoutDescription] = useState<string>('')
  const [jsonResult, setJsonResult] = useState<string>('')
  const [mjmlResult, setMjmlResult] = useState<string>('')
  const [htmlResult, setHtmlResult] = useState<string>('')

  const generateFinal = async () => {
    const layout = await layoutgen(layoutFormData)

    setLayoutDescription(layout as string)
    toast.success(`Layout successfuly generated!`, {
      autoClose: 1000,
      type: 'success'
    })

    // const json = await jsongen({
    //   system_prompt: jsonFormData.system_prompt,
    //   user_prompt: layout as string,
    //   user_context: layoutFormData.user_context
    // })

    // setJsonResult(json as string)

    const { mjml, html } = await htmlgen({
      system_prompt: htmlFormData.system_prompt,
      user_prompt: layout as string,
      user_context: layoutFormData.user_context
    })

    toast.success(`HTML successfuly generated!`, {
      autoClose: 1000,
      type: 'success'
    })

    // console.log('**** ', mjml)
    setMjmlResult(mjml as string)

    setHtmlResult(html as string)

    const [session] = await Promise.all([getSession()])

    const { error } = await supabase.from('mjmls').insert({ user_id: session?.user.id, content: `${mjml}` })

    if (error) {
      console.error('Error posting data:', error)
    }
  }

  // const generateLayout = async () => {
  //   console.log('***** layoutFormData', layoutFormData)

  //   const re = await layoutgen(layoutFormData)

  //   setLayoutDescription(re)
  // }

  const generateJson = async () => {
    console.log('***** jsonFormData', jsonFormData)

    const re = await jsongen({
      system_prompt: jsonFormData.system_prompt,
      user_prompt: layoutDescription,
      user_context: layoutFormData.user_context
    })

    console.log('**** ', re)
    setJsonResult(re as string)
  }

  const generateHtml = async () => {
    console.log('***** htmlFormData', htmlFormData)

    const { mjml, html } = await htmlgen({
      system_prompt: htmlFormData.system_prompt,
      user_prompt: layoutDescription,
      user_context: layoutFormData.user_context
    })

    toast.success(`HTML successfuly generated!`, {
      autoClose: 1000,
      type: 'success'
    })

    // console.log('**** ', mjml)
    setMjmlResult(mjml as string)

    setHtmlResult(html as string)
  }

  return (
    <Card>
      <CardHeader title='Multi Column with Form Separator' />
      <Divider />
      <form
        onSubmit={e => {
          e.preventDefault()
          generateFinal()
        }}
      >
        <CardContent>
          <Grid container spacing={6}>
            <Grid item xs={12} className='flex flex-row items-center justify-between'>
              <Typography variant='body2' className='font-medium'>
                Layout Generator
              </Typography>
              <Button variant='contained' disabled={mjmlResult == '' ? true : false}>
                Edit
              </Button>
            </Grid>
            <Grid item xs={12}>
              <CustomTextField
                fullWidth
                minRows={4}
                maxRows={10}
                multiline
                label='System Prompt'
                placeholder='System Prompt...'
                sx={{ '& .MuiInputBase-root.MuiFilledInput-root': { alignItems: 'baseline' } }}
                onChange={e => setLayoutFormData({ ...layoutFormData, system_prompt: e.target.value })}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <CustomTextField
                fullWidth
                minRows={4}
                maxRows={10}
                multiline
                label='User Prompt'
                placeholder='User Prompt...'
                sx={{ '& .MuiInputBase-root.MuiFilledInput-root': { alignItems: 'baseline' } }}
                onChange={e => setLayoutFormData({ ...layoutFormData, user_prompt: e.target.value })}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <CustomTextField
                fullWidth
                minRows={4}
                maxRows={10}
                multiline
                label='User Context'
                placeholder='User Context(JSON)...'
                sx={{ '& .MuiInputBase-root.MuiFilledInput-root': { alignItems: 'baseline' } }}
                onChange={e => setLayoutFormData({ ...layoutFormData, user_context: e.target.value })}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <CustomTextField
                fullWidth
                minRows={4}
                maxRows={10}
                multiline
                label='Output'
                value={layoutDescription}
                sx={{ '& .MuiInputBase-root.MuiFilledInput-root': { alignItems: 'baseline' } }}
              />
            </Grid>
          </Grid>
        </CardContent>
        <Divider />
        <CardActions>
          <Button type='submit' variant='contained'>
            Submit
          </Button>
          <Button
            type='reset'
            variant='tonal'
            color='secondary'
            onClick={() => {
              // handleReset()
            }}
          >
            Reset
          </Button>
        </CardActions>
      </form>
      <Divider />
      <form
        onSubmit={e => {
          e.preventDefault()
          generateJson()
        }}
      >
        <CardContent>
          <Grid container spacing={6}>
            <Grid item xs={12}>
              <Typography variant='body2' className='font-medium'>
                Json Generator
              </Typography>
            </Grid>
            <Grid item xs={12}>
              <CustomTextField
                fullWidth
                minRows={4}
                maxRows={10}
                multiline
                label='System Prompt'
                placeholder='System Prompt...'
                sx={{ '& .MuiInputBase-root.MuiFilledInput-root': { alignItems: 'baseline' } }}
                onChange={e => setJsonFormData({ ...jsonFormData, system_prompt: e.target.value })}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <CustomTextField
                fullWidth
                minRows={4}
                maxRows={10}
                multiline
                label='JSON'
                value={jsonResult}
                sx={{ '& .MuiInputBase-root.MuiFilledInput-root': { alignItems: 'baseline' } }}
                onChange={e => setJsonResult(e.target.value)}
              />
            </Grid>
          </Grid>
        </CardContent>
        <Divider />
        <CardActions>
          <Button type='submit' variant='contained'>
            Submit
          </Button>
          <Button
            type='reset'
            variant='tonal'
            color='secondary'
            onClick={() => {
              // handleReset()
            }}
          >
            Reset
          </Button>
          <Button
            onClick={() => {
              generateHtml()
            }}
          >
            Generate HTML
          </Button>
        </CardActions>
      </form>
      <Divider />
      <form
        onSubmit={e => {
          e.preventDefault()
          generateHtml()
        }}
      >
        <CardActions>
          <Button type='submit' variant='contained'>
            Submit
          </Button>
          <Button
            type='reset'
            variant='tonal'
            color='secondary'
            onClick={() => {
              // handleReset()
            }}
          >
            Reset
          </Button>
          <Button
            onClick={() => {
              generateHtml()
            }}
          >
            Generate HTML
          </Button>
        </CardActions>
        <Divider />
        <CardContent>
          <Grid container spacing={6}>
            <Grid item xs={12}>
              <Typography variant='body2' className='font-medium'>
                Html Generator
              </Typography>
            </Grid>
            <Grid item xs={12}>
              <CustomTextField
                fullWidth
                minRows={4}
                maxRows={10}
                multiline
                label='System Prompt'
                placeholder='System Prompt...'
                sx={{ '& .MuiInputBase-root.MuiFilledInput-root': { alignItems: 'baseline' } }}
                onChange={e => setHtmlFormData({ ...htmlFormData, system_prompt: e.target.value })}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <CustomTextField
                fullWidth
                minRows={4}
                maxRows={10}
                multiline
                label='User Prompt'
                placeholder='User Prompt...'
                sx={{ '& .MuiInputBase-root.MuiFilledInput-root': { alignItems: 'baseline' } }}
                onChange={e => setLayoutFormData({ ...layoutFormData, user_prompt: e.target.value })}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <CustomTextField
                fullWidth
                minRows={4}
                maxRows={10}
                multiline
                label='User Context'
                placeholder='User Context(JSON)...'
                sx={{ '& .MuiInputBase-root.MuiFilledInput-root': { alignItems: 'baseline' } }}
                onChange={e => setLayoutFormData({ ...layoutFormData, user_context: e.target.value })}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <CustomTextField
                fullWidth
                minRows={4}
                maxRows={10}
                multiline
                label='HTML'
                value={mjmlResult}
                sx={{ '& .MuiInputBase-root.MuiFilledInput-root': { alignItems: 'baseline' } }}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <Typography dangerouslySetInnerHTML={{ __html: htmlResult as string }} />
            </Grid>
          </Grid>
        </CardContent>
      </form>
    </Card>
  )
}

export default PromptEditor
