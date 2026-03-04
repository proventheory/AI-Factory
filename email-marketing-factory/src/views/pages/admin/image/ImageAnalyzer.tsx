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

import type { layoutFormType } from '@/types/pages/aiEngineTypes'
import { analyzeImage } from '@/app/server/ai-engine'

const ImageAnalyzer = () => {

  const [imageFormData, setImageFormData] = useState<layoutFormType>({
    system_prompt: `Analyze the screenshot of the provided to split into sections, extracting their titles and detailed descriptions.

Output Requirements:

For each section, provide:

- **Section Title:** A concise and descriptive title that accurately reflects the content or purpose of the section.
- **Section Description:** A detailed explanation of the section’s content, purpose, notable features, or style. Include precise positioning details for all text, images, and buttons (e.g., centered, left, right).
- **Style:** A description of the CSS styles affecting the section’s layout, including width, padding, and margin.
- **Flag:** Check if there is part that is displayed as a single image tag in the html code but is displayed as multiple  elements in the screenshot, and if so, set flag to true.

Instructions:

- **HTML Structure Analysis:** Examine the HTML structure to identify logical divisions such as headers, footers, main content areas, and any repeated patterns. Pay attention to embedded CSS or JavaScript that influences the section’s appearance or behavior.

- **Styling and Functionality:** Preserve the original styling and functionality of each section. Describe CSS styles that dictate the layout, including margins, padding, and alignments affecting the section’s elements.

- **Width Consistency:** Identify the maximum width ‘A’ of any section and ensure all sections are described with this uniform width. Update each section’s description to reflect this consistency.

- **Component Identification:** Identify any reusable components or design patterns that could be extracted for use in other templates.

- **Detailed Positioning:** Provide specific details on the positioning and alignment of all elements within each section:
  - **Text:** Indicate whether it is centered, left-aligned, or right-aligned.
  - **Images:** Specify their alignment and any styling affecting their display (e.g., borders, shadows).
  - **Buttons:** Describe their alignment and any special hover effects or interactivity.

Double-check that all text, links, images, and other elements from screenshot are included in the corresponding section.

Output Format:

[
    {
        "index": "1",
        "title": "Header and Introduction",
        "description": "The header is related ....",
        "style": "width:0px; padding:0px; margin:0px;",
        "flag": "false"
    },
    ...
]`,
    user_prompt: '',
    user_context: 'https://aimferclcnvhawzpruzn.supabase.co/storage/v1/object/public/upload/templates/shop-fathers-day-gifts-loaded-with-character-html.jpg'
  })


  const [imageDescription, setImageDescription] = useState<string>('')

  const imageAnalyzer = async () => {

    if (imageFormData.system_prompt && imageFormData.user_prompt) {

      const output = await analyzeImage(imageFormData)

      setImageDescription(JSON.stringify(output))

      toast.success(`Image description generated!`, {
        autoClose: 5000,
        type: 'success'
      })
    } else
      toast.warning(`Please Input image info correctly`, {
        autoClose: 5000,
        type: 'error'
      })

    // if (imageFormData.prompt && imageFormData.imageUrl) {
    //   const description = await getImageDescription(imageFormData)

    //   setImageDescription(description as string)

    //   toast.success(`Image description generated!`, {
    //     autoClose: 5000,
    //     type: 'success'
    //   })
    // }
    // else {
    //   toast.warning(`Please Input image info correctly`, {
    //     autoClose: 5000,
    //     type: 'error'
    //   })
    // }

  }

  return (
    <Card>
      <CardHeader title='Image Analyzer' />
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
                required
                value={imageFormData.user_context}
                sx={{ '& .MuiInputBase-root.MuiFilledInput-root': { alignItems: 'baseline' } }}
                onChange={e => setImageFormData({ ...imageFormData, user_context: e.target.value })}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <CustomTextField
                fullWidth
                minRows={4}
                maxRows={10}
                multiline
                required
                label='System prompt'
                placeholder='input system system'
                value={imageFormData.system_prompt}
                sx={{ '& .MuiInputBase-root.MuiFilledInput-root': { alignItems: 'baseline' } }}
                onChange={e => setImageFormData({ ...imageFormData, system_prompt: e.target.value })}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <CustomTextField
                fullWidth
                minRows={4}
                maxRows={10}
                multiline
                label='User prompt'
                placeholder='input user prompt'
                value={imageFormData.user_prompt}
                sx={{ '& .MuiInputBase-root.MuiFilledInput-root': { alignItems: 'baseline' } }}
                onChange={e => setImageFormData({ ...imageFormData, user_prompt: e.target.value })}
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
    </Card>
  )
}

export default ImageAnalyzer
