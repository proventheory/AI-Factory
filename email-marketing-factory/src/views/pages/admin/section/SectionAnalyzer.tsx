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
import { getImageDescription, sectionsGenerate, summaryGenerate } from '@/app/server/ai-engine'
import type { imageFormType, layoutFormType } from '@/types/pages/aiEngineTypes'
import { imagePrompt, summary_system_prompt, user_context_section } from '@/utils/constrants'

const SectionAnalyzer = () => {
  const [summaryFormData, setSummaryFormData] = useState<layoutFormType>({
    system_prompt: summary_system_prompt as string,
    user_prompt: '',
    user_context: ''
  })

  const [imageFormData, setImageFormData] = useState<imageFormType>({
    imageUrl: 'https://aimferclcnvhawzpruzn.supabase.co/storage/v1/object/public/upload/templates/shop-fathers-day-gifts-loaded-with-character-html.jpg',
    prompt: imagePrompt as string
  })

  const [imageDescription, setImageDescription] = useState<string>('')


  const [htmlFormData, setHtmlFormData] = useState<layoutFormType>({
    system_prompt: '',
    user_prompt: '',
    user_context: user_context_section
  })

  const [layoutDescription, setLayoutDescription] = useState<string>('')
  const [generatedResult, setGeneratedResult] = useState<string>('')
  
  const [generatedHtml, setGeneratedHtml] = useState<string>('')

  const generateFinal = async () => {
    const layout = await summaryGenerate(summaryFormData)

    setHtmlFormData({ ...htmlFormData, system_prompt: summaryFormData.user_context })

    setHtmlFormData({ ...htmlFormData, user_prompt: layout })

    setLayoutDescription(layout as string)
    toast.success(`Summary successfuly generated!`, {
      autoClose: 5000,
      type: 'success'
    })

  }

  const generateHtml = async () => {

    let system_prompt = `
      Provide only requested section's part.

      Here is the whole html code of the template.
      \`\`\`
      ${summaryFormData.user_context}
      \`\`\`
    `

    if (imageDescription) system_prompt += ` This is the description about image of template: ${imageDescription}`

    const generated = await sectionsGenerate({
      system_prompt: system_prompt,
      user_prompt: layoutDescription,
      user_context: htmlFormData.user_context
    },)

    setGeneratedResult(generated as string)

    setGeneratedHtml(generated as string)

    toast.success(`HTML successfuly generated!`, {
      autoClose: 5000,
      type: 'success'
    })

  }

  const imageAnalyzer = async () => {

    if (imageFormData.prompt && imageFormData.imageUrl) {
      const description = await getImageDescription(imageFormData)

      setImageDescription(description as string)

      toast.success(`Image description generated!`, {
        autoClose: 5000,
        type: 'success'
      })
    }
    else {
      toast.warning(`Please Input image info correctly`, {
        autoClose: 5000,
        type: 'error'
      })
    }

  }

  return (
    <Card>
      <CardHeader title='Section Analyzer' />
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
                Summary Generator
              </Typography>
            </Grid>
            <Grid item xs={12} sm={6}>
              <CustomTextField
                fullWidth
                minRows={4}
                maxRows={10}
                multiline
                label='System Prompt'
                placeholder='System Prompt...'
                value={summaryFormData.system_prompt}
                sx={{ '& .MuiInputBase-root.MuiFilledInput-root': { alignItems: 'baseline' } }}
                onChange={e => setSummaryFormData({ ...summaryFormData, system_prompt: e.target.value })}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <CustomTextField
                fullWidth
                minRows={4}
                maxRows={10}
                multiline
                label='Html code'
                placeholder='html source code'
                sx={{ '& .MuiInputBase-root.MuiFilledInput-root': { alignItems: 'baseline' } }}
                onChange={e => setSummaryFormData({ ...summaryFormData, user_context: e.target.value })}
              />
            </Grid>
            <Grid item xs={12}>
              <CustomTextField
                fullWidth
                minRows={4}
                maxRows={10}
                multiline
                label='Output'
                value={layoutDescription}
                onChange={e => setLayoutDescription(e.target.value)}
                sx={{ '& .MuiInputBase-root.MuiFilledInput-root': { alignItems: 'baseline' } }}
              />
            </Grid>
          </Grid>
        </CardContent>
        <Divider />
        <CardActions>
          <Button type='submit' variant='contained' >
            Summary Generate
          </Button>
        </CardActions>
      </form>
      <Divider />
      <form
        onSubmit={e => {
          e.preventDefault()
          imageAnalyzer()
        }}
      >
        <CardContent>
          <Grid container spacing={6}>
            <Grid item xs={12} className='flex flex-row items-center justify-between'>
              <Typography variant='body2' className='font-medium'>
                Image Analyzer
              </Typography>
            </Grid>

            <Grid item xs={12}>
              <CustomTextField
                fullWidth
                rows={1}
                multiline
                label='Image Url'
                placeholder='input image url'
                value={imageFormData.imageUrl}
                sx={{ '& .MuiInputBase-root.MuiFilledInput-root': { alignItems: 'baseline' } }}
                onChange={e => setImageFormData({ ...imageFormData, imageUrl: e.target.value })}
              />
            </Grid>
            <Grid item xs={12}>
              <CustomTextField
                fullWidth
                minRows={4}
                maxRows={10}
                multiline
                label='Image Prompt'
                placeholder='Image Prompt...'
                value={imageFormData.prompt}
                sx={{ '& .MuiInputBase-root.MuiFilledInput-root': { alignItems: 'baseline' } }}
                onChange={e => setImageFormData({ ...imageFormData, prompt: e.target.value })}
              />
            </Grid>
            <Grid item xs={12}>
              <CustomTextField
                fullWidth
                minRows={4}
                maxRows={10}
                multiline
                label='Output'
                value={imageDescription}
                sx={{ '& .MuiInputBase-root.MuiFilledInput-root': { alignItems: 'baseline' } }}
              />
            </Grid>
          </Grid>
        </CardContent>
        <Divider />
        <CardActions>
          <Button type='submit' variant='contained' >
            Image Analyze
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
            Html Generate
          </Button>
          <Button
            type='reset'
            variant='tonal'
            color='secondary'
            onClick={() => {
              // handleReset()
            }}
          >
            Save Sections
          </Button>
          {/* <Button
            onClick={() => {
              generateHtml()
            }}
          >
            Generate HTML
          </Button> */}
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
                value={htmlFormData.user_context}
                sx={{ '& .MuiInputBase-root.MuiFilledInput-root': { alignItems: 'baseline' } }}
                onChange={e => setHtmlFormData({ ...htmlFormData, user_context: e.target.value })}
              />
            </Grid>

            <Grid item xs={12}>
              <CustomTextField
                fullWidth
                minRows={4}
                maxRows={10}
                multiline
                label='Generated Html code'
                placeholder='genereated html code'
                value={generatedHtml}
                sx={{ '& .MuiInputBase-root.MuiFilledInput-root': { alignItems: 'baseline' } }}
              />
            </Grid>

            <Grid item xs={12} sm={6}>
              <Typography dangerouslySetInnerHTML={{ __html: generatedResult as string }} style={{
                overflow: 'auto'
              }} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <Typography dangerouslySetInnerHTML={{ __html: summaryFormData.user_context as string }} style={{
                overflow: 'auto'
              }} />
            </Grid>
          </Grid>
        </CardContent>
      </form>
    </Card>
  )
}

export default SectionAnalyzer
