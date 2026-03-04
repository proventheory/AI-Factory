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

// Components Imports
import { toast } from 'react-toastify'

import CustomTextField from '@core/components/mui/TextField'

// Styled Component Imports
import { htmlgen, jsongen, layoutgen } from '@/app/server/ai-engine'
import type { layoutFormType } from '@/types/pages/aiEngineTypes'

// type FormDataType = {
//   username: string
//   email: string
//   password: string
//   isPasswordShown: boolean
//   confirmPassword: string
//   isConfirmPasswordShown: boolean
//   firstName: string
//   lastName: string
//   country: string
//   language: string[]
//   date: Date | null
//   phoneNumber: string
// }

const LayoutGenPrompt = `
You are an expert email designer. Create a detailed design idea for a marketing email based on the user context.
Provide a comprehensive textual description of the email layout, including the arrangement of sections, visuals, text content, and overall theme. Mention specific design elements and how they should be used to highlight the brand and products. For the images, describe about the image in detail so that based on the description, image can be generated using AI.

Provide a comprehensive textual description of the email layout, including the arrangement of sections, visuals, text content, and overall theme. Mention specific design elements and how they should be used to highlight the brand and products. Ensure that background colors and component colors are soft and contrasted appropriately.

For example:
The email will start with a hero section featuring a high-quality image of the brand’s flagship product, accompanied by a bold headline and a brief introductory text. Below the hero section, there will be a two-column layout. The left column will feature a carousel showcasing different products, while the right column will include a detailed description of the campaign. Following this, we will have a full-width section with a call-to-action button encouraging users to explore more products. Social media icons will be placed at the bottom to drive engagement. The overall theme will be sleek and modern, using the brand’s signature colors.

Use this structure to create a detailed design idea for the given user inputs.

When you design, follow this theory.
Theory of Design
1. Visual Hierarchy:
Purpose: Guide the viewer's eye through the email in a way that highlights the most important elements first.
Implementation: Use size, color, contrast, and alignment to create a clear flow. Headlines should be larger and bolder than body text, and call-to-action (CTA) buttons should stand out with contrasting colors.
Balance and Symmetry:
Purpose: Create a harmonious layout that feels stable and aesthetically pleasing.
Implementation: Distribute elements evenly within the email. Avoid clutter by leaving enough white space and aligning content to create symmetry.
Contrast:
Purpose: Make important elements stand out and enhance readability.
Implementation: Use contrasting colors for text and backgrounds. Ensure there’s sufficient contrast between different sections of the email to create a clear separation.
Alignment:
Purpose: Organize content in a structured and consistent way.
Implementation: Align text and images to a grid. Consistent alignment creates a cohesive look and makes the email easier to read.

2. Principles of Architecture
Modular Design:
Purpose: Create reusable sections that can be rearranged or reused in different emails.
Implementation: Design with blocks or sections that can be moved around or duplicated. This makes it easier to adapt designs for different content or audiences without starting from scratch.
Responsiveness:
Purpose: Ensure emails look good on any device, whether it’s a desktop, tablet, or mobile phone.
Implementation: Use responsive design techniques like fluid grids, flexible images, and media queries. Test emails on multiple devices to ensure consistent appearance and functionality.
Accessibility:
Purpose: Make sure emails are readable and usable by everyone, including people with disabilities.
Implementation: Use alt text for images, ensure sufficient contrast, avoid relying on color alone to convey meaning, and use clear, readable fonts.
Load Time Optimization:
Purpose: Reduce the time it takes for an email to load, especially on mobile devices.
Implementation: Optimize images for the web, use lightweight code, and avoid embedding large files or unnecessary scripts.

3. Respecting Padding
Consistency in Spacing:
Purpose: Maintain visual consistency and readability by ensuring uniform spacing around elements.
Implementation: Use consistent padding and margins around images, text, and buttons. This helps to create a balanced layout and prevents content from feeling cramped.
Breathing Room:
Purpose: Improve readability and prevent visual overload by providing enough space between different sections.
Implementation: Apply sufficient padding between sections and around individual elements. White space is your friend—it gives your design room to breathe and highlights key content.
Content Isolation:
Purpose: Distinguish different sections of content clearly.
Implementation: Use padding to separate elements like headers, images, and text blocks. This makes it easier for the reader to digest information and understand the structure of the email.
Avoid Overstuffing:
Purpose: Prevent the email from feeling cluttered or overwhelming.
Implementation: Resist the urge to fill every inch of space. Instead, focus on key messages and let them stand out by giving them adequate space.


Here’s a more robust breakdown of the appropriate questions or inputs for Product Offer Email email.
•	Offer Details: Clearly define the specific product or offer, including any unique selling points (USPs) or special features that distinguish it from other products.
•	Target Audience: Identify the primary and secondary audiences for this offer. Are they new customers, returning customers, or high-value segments? How does this offer cater to their specific needs or interests?
•	Call to Action (CTA): What is the most compelling action you want the recipient to take? Consider variations such as “Shop Now,” “Claim Your Discount,” or “Limited-Time Offer.”
•	Urgency Elements: Are there time constraints, limited stock availability, or other factors that create urgency? How will these be communicated (e.g., countdown timers, “While Supplies Last”)?
•	Value Proposition: What makes this offer irresistible? How does it solve a problem, fulfill a need, or enhance the recipient’s life? Include any customer testimonials or data points that reinforce the value.
•	Personalization Options: How can the email be tailored to the individual recipient? This might include dynamic content based on past purchases, location-based offers, or personalized greetings and recommendations.


Here are several detailed layout options for displaying products in your marketing emails. Each option includes information about the direction, order, size, position, and alignment of images, text, and buttons to give you flexibility in how you present products.

Possible Layouts for Product Ordering

#1. Single Column Layout
Description: Each product takes up the full width of the email.
Structure:
- Product Image
- Product Title
- Product Description
- Order Button
Alignment: All elements are centered.

#2. Two-Column Grid Layout
Description: Products are displayed in a two-column grid format.
Structure (Each Column):
- Product Image
- Product Title
- Product Description
- Order Button
Alignment: Elements are centered within each column.

#3. Alternating Image and Button Layout
Description: In each row, the position of the product image and order button alternates.
Structure (Row 1):
- Left: Product Image
- Right: Product Title, Product Description, Order Button
Structure (Row 2):
- Left: Product Title, Product Description, Order Button
- Right: Product Image
Alignment: Elements within each side are aligned to the left or right, depending on the position.

#4. Horizontal Layout
Description: Each product is displayed in a horizontal line.
Structure:
- Left: Product Image
- Center: Product Title, Product Description
- Right: Order Button
Alignment: Elements are aligned horizontally.

#5. Staggered Layout
Description: Products are displayed in a staggered format, creating a dynamic visual effect.
Structure (Row 1):
- Left: Product Image
- Right: Product Title, Product Description, Order Button
Structure (Row 2):
- Left: Product Title, Product Description, Order Button
- Right: Product Image
Alignment: Elements are staggered to create visual interest.

#6. Overlay Layout
Description: The product image serves as the background with text and buttons overlaid.
Structure:
- Background: Product Image
- Overlay: Product Title, Product Description, Order Button
Alignment: Overlay elements are centered or positioned at specific points on the image.

#7. Sidebar Layout
Description: Products are displayed with a sidebar for additional information or navigation.
Structure:
- Left: Sidebar (e.g., categories, filters)
- Right: Product Image, Product Title, Product Description, Order Button
Alignment: Elements within the sidebar are aligned left, while product elements on the right are centered.

#8. Masonry Grid Layout
Description: Products are displayed in a masonry grid, with varying heights for a dynamic look.
Structure:
- Grid with varying product image sizes
- Product Title, Product Description, Order Button below each image
Alignment: Elements are aligned based on the grid structure.

#9. Carousel Layout
Description: Products are displayed in a carousel format that users can swipe or click through.
Structure:
Carousel Slide: Product Image, Product Title, Product Description, Order Button
Alignment: Elements within each slide are centered.

#10. List Layout
Description: Products are displayed in a vertical list, similar to single-column but with more detailed descriptions.
Structure:
- Product Image
- Product Title
- Product Description
- Detailed Specifications
- Order Button
Alignment: All elements are left-aligned or centered.

You can randomly use one of them or mixture of them for product ordering.
`

const JsonGenPrompt = `
You are an expert email designer. Based on the provided detailed design idea, create a JSON layout description for a marketing email. You should follow the idea exactly. Consider direction and position carefully. especially do not confuse left and right and vertical and horizontal. Products will be arranged in a column list.

The json output will be used to generate MJML body code. So use mjml body components.
the MJML body components are accordian, button, carousel, divider, hero, image, navbar, social, spacer, table, text, wrapper.
`

const HtmlGenPropmt = `
You are an expert in HTML and MJML (Mailjet Markup Language). Based on the following JSON layout description and the generated images, create the corresponding MJML code for the marketing email.

Create the MJML code for the entire email layout based on the provided JSON.
Provide only MJML code. No description, no html\`\`\` on top no \`\`\` on bottom
`

const EmailGenerator = () => {
  // States
  const [layoutFormData, setLayoutFormData] = useState<layoutFormType>({
    system_prompt: '',
    user_prompt: '',
    user_context: ''
  })

  // const [jsonFormData, setJsonFormData] = useState<layoutFormType>({
  //   system_prompt: '',
  //   user_prompt: '',
  //   user_context: ''
  // })

  // const [htmlFormData, setHtmlFormData] = useState<layoutFormType>({
  //   system_prompt: '',
  //   user_prompt: '',
  //   user_context: ''
  // })

  // const [layoutDescription, setLayoutDescription] = useState<string>('')
  // const [jsonResult, setJsonResult] = useState<string>('')
  // const [mjmlResult, setMjmlResult] = useState<string>('')

  const [htmlResult, setHtmlResult] = useState<string>('')

  const handleReset = () => {
    setHtmlResult('')
  }

  // const generateLayout = async () => {
  //   console.log('***** layoutFormData', layoutFormData)

  //   const re = await layoutgen({
  //     system_prompt: LayoutGenPrompt,
  //     user_prompt: layoutFormData.user_prompt,
  //     user_context: layoutFormData.user_context
  //   })

  //   console.log('**** layout', re)

  //   const html = await htmlgen({
  //     system_prompt: HtmlGenPropmt,
  //     user_prompt: re ?? '',
  //     user_context: layoutFormData.user_context
  //   })

  //   setHtmlResult(html ?? '')

  //   // console.log('**** ', re)
  //   // setLayoutDescription(re)
  // }

  const generateFinal = async () => {
    const layout = await layoutgen({
      system_prompt: LayoutGenPrompt,
      user_prompt: layoutFormData.user_prompt + `
      Design smart and clean.

Added brand logo. but it is just our company name text with primary color. so do not use the primary color as background color.
When choose the background color, be careful color is not contrasted.
`,
      user_context: layoutFormData.user_context
    })

    toast.success(`Layout successfuly generated!`, {
      autoClose: 1000,
      type: 'success'
    })

    // setLayoutDescription(layout as string)

    const json = await jsongen({
      system_prompt: JsonGenPrompt,
      user_prompt: layout as string,
    user_context: layoutFormData.user_context
    })

    toast.success(`Json successfuly generated!`, {
      autoClose: 1000,
      type: 'success'
    })

    // setJsonResult(json as string)

    const { html } = await htmlgen({
      system_prompt: HtmlGenPropmt,
      user_prompt: json as string,
      user_context: layoutFormData.user_context
    })

    toast.success(`HTML successfuly generated!`, {
      autoClose: 1000,
      type: 'success'
    })

    // console.log('**** ', mjml)
    // setMjmlResult(mjml as string)

    setHtmlResult(html as string)
  }

  return (
    <Card>
      <CardHeader title='Email Generator' />
      <Divider />
      <form
        onSubmit={e => {
          e.preventDefault()
          generateFinal()
        }}
      >
        <CardActions>
          <Button type='submit' variant='contained'>
            Submit
          </Button>
          <Button
            variant='tonal'
            color='secondary'
            onClick={() => {
              handleReset()
            }}
          >
            Reset
          </Button>
        </CardActions>
        <Divider />
        <CardContent>
          <Grid container spacing={6}>
            <Grid item xs={12}>
              <Typography variant='body2' className='font-medium'>
                Prompt
              </Typography>
            </Grid>
            {/* <Grid item xs={12}>
              <CustomTextField
                fullWidth
                minRows={4}
                multiline
                label='System Prompt'
                placeholder='System Prompt...'
                sx={{ '& .MuiInputBase-root.MuiFilledInput-root': { alignItems: 'baseline' } }}
                onChange={e => setLayoutFormData({ ...layoutFormData, system_prompt: e.target.value })}
              />
            </Grid> */}
            <Grid item xs={12} sm={6}>
              <CustomTextField
                fullWidth
                minRows={4}
                multiline
                label='User Prompt'
                placeholder='User Prompt...'
                sx={{ '& .MuiInputBase-root.MuiFilledInput-root': { alignItems: 'baseline' } }}
                onChange={e => setLayoutFormData({ ...layoutFormData, user_prompt: e.target.value })}
              />
              <CustomTextField
                fullWidth
                minRows={4}
                multiline
                label='User Context'
                placeholder='User Context(JSON)...'
                sx={{ '& .MuiInputBase-root.MuiFilledInput-root': { alignItems: 'baseline' }, mt: 6 }}
                onChange={e => setLayoutFormData({ ...layoutFormData, user_context: e.target.value })}
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

export default EmailGenerator
