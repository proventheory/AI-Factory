/**
 * ! The server actions below are used to fetch the static data from the fake-db. If you're using an ORM
 * ! (Object-Relational Mapping) or a database, you can swap the code below with your own database queries.
 */

'use server'

import OpenAI from 'openai'
import { z } from 'zod'
import { zodResponseFormat } from 'openai/helpers/zod'

import mjml2html from 'mjml'


import { p_mjmlPart, section_system_prompt, updateMjml, user_context_section } from '@/utils/constrants'

import type { imageFormType, layoutFormType, mjmlGenType, sectionType } from '@/types/pages/aiEngineTypes'


// import {
//   LAYOUT_FOOTER,
//   LAYOUTS_ADDITIONAL_PRODUCTS_RECOMMENDATIONS,
//   LAYOUTS_HEADER,
//   LAYOUTS_HERO,
//   LAYOUTS_OFFER_DETAIL,
//   LAYOUTS_PRODUCT_DETAIL,
//   LAYOUTS_SOCIAL_PROOF,
//   LAYOUTS_URGENTCY_SCARITY
// } from '@/data/laytouts'
// import { getRandomInt } from '@/utils'

import { supabase } from '@/utils/supabase'

const openai = new OpenAI()

// const PROMPT_LAYOUT_GEN = ''
const SchemaBackground = z.object({
  type: z.enum(['image', 'color']),
  description: z.string()
})

const SchemaComponent = z.object({
  type: z.enum(['button', 'divider', 'image', 'spacer', 'text']),
  background: SchemaBackground,
  description: z.string(),
  placement: z.string(),
  alignment: z.string(),
  attributes: z.string(),
  style: z.string()
})

// const SchemaSection = z.object({
//   type: z.enum(['section']),
//   background: SchemaBackground,
//   description: z.string(),
//   placement: z.string(),
//   alignment: z.string(),
//   attributes: z.string(),
//   style: z.string()
// })

const SchemaGroup: z.ZodType<any> = z.lazy(() =>
  z.object({
    type: z.enum([
      'column',
      'raw',
      'section',
      'accordian',
      'wrapper',
      'carousel',
      'group',
      'hero',
      'navbar',
      'social',
      'table'
    ]),
    background: SchemaBackground,
    description: z.string(),
    placement: z.string(),
    alignment: z.string(),
    attributes: z.string(),
    style: z.string(),
    children: z.array(z.union([SchemaComponent, SchemaGroup]))
  })
)

const UI = z.object({
  type: z.enum(['page']),
  background: SchemaBackground,
  description: z.string(),
  children: z.array(z.union([SchemaComponent, SchemaGroup]))
})

const Summary: z.ZodType<any> = z.lazy(() =>
  z.object({
    index: z.string(),
    description: z.string(),
    title: z.string(),
    position: z.string()
  })
)

const detectSummary: z.ZodType<any> = z.lazy(() =>
  z.object({
    index: z.string(),
    description: z.string(),
    style: z.string(),
    flag: z.boolean(),
    title: z.string(),
    resaon: z.string()
  })
)

const detectSummaryTemplate: z.ZodType<any> = z.lazy(() =>
  z.object({
    description: z.array(detectSummary)
  })
)


const SectionTemplate: z.ZodType<any> = z.lazy(() =>
  z.object({
    title: z.string(),
    index: z.string(),
    html: z.string(),
    description: z.string(),
  })
)

const imageInfo: z.ZodType<any> = z.object({
  images: z.array(
    z.object({
      title: z.string(),
      description: z.string(),
      buttonText: z.string()
    })
  ),
  emailTitle: z.string()
});

const SummaryTemplate = z.object({
  description: z.string(),
  children: z.array(Summary)
})

const MJMLTemplate: z.ZodType<any> = z.object({
  content: z.string(),
})

export const imageGen = async (prompt: string) => {
  const image = await openai.images.generate({ model: 'dall-e-3', prompt })

  console.log(image.data)

  return
}

export const layoutgen = async (data: layoutFormType) => {
  const { system_prompt, user_prompt, user_context } = data

  const updatedSystemPrompt = system_prompt

  // updatedSystemPrompt = updatedSystemPrompt + '\n\nHere is a detailed layout templates. Use this template.\n\n'

  // updatedSystemPrompt += '\n\nHeader Section: \n' + JSON.stringify(LAYOUTS_HEADER[getRandomInt(LAYOUTS_HEADER.length)]) + '\n\n'
  // updatedSystemPrompt += '\n\nHero Section: \n' + JSON.stringify(LAYOUTS_HERO[getRandomInt(LAYOUTS_HERO.length)]) + '\n\n'

  // updatedSystemPrompt +=
  //   '\n\nProduct Details Section: \n' + JSON.stringify(LAYOUTS_PRODUCT_DETAIL[getRandomInt(LAYOUTS_PRODUCT_DETAIL.length)]) + '\n\n'
  // updatedSystemPrompt +=
  //   '\n\nOffer Details Section: \n' + JSON.stringify(LAYOUTS_OFFER_DETAIL[getRandomInt(LAYOUTS_OFFER_DETAIL.length)]) + '\n\n'
  // if (Math.random() < 0.5)
  //   updatedSystemPrompt +=
  //     '\n\nSocial Proof Section: \n' + JSON.stringify(LAYOUTS_SOCIAL_PROOF[getRandomInt(LAYOUTS_SOCIAL_PROOF.length)]) + '\n\n'
  // if (Math.random() < 0.5)
  //   updatedSystemPrompt +=
  //     '\n\nAdditional Products or Recommendations Section: \n' +
  //     JSON.stringify(LAYOUTS_ADDITIONAL_PRODUCTS_RECOMMENDATIONS[getRandomInt(LAYOUTS_ADDITIONAL_PRODUCTS_RECOMMENDATIONS.length)]) +
  //     '\n\n'
  // if (Math.random() < 0.5)
  //   updatedSystemPrompt +=
  //     '\n\nUrgency or Scarcity Section: \n' + JSON.stringify(LAYOUTS_URGENTCY_SCARITY[getRandomInt(LAYOUTS_URGENTCY_SCARITY.length)]) + '\n\n'
  // updatedSystemPrompt += '\n\nFooter Section: \n' + JSON.stringify(LAYOUT_FOOTER[getRandomInt(LAYOUT_FOOTER.length)]) + '\n\n'

  console.log('**** layout system prompt', updatedSystemPrompt);

  const payload: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
    messages: [
      { role: 'system', content: updatedSystemPrompt },
      { role: 'user', content: user_prompt + '\n' + user_context }
    ],
    model: 'gpt-4o-2024-08-06',
    max_tokens: 10000,
    temperature: 0
  }

  const completion = await openai.chat.completions.create(payload)

  // console.log('*** data', completion.choices[0]);

  return completion.choices[0].message.content
}

export const jsongen = async (data: layoutFormType) => {
  console.log('jsonGen data', data)

  try {
    const { system_prompt, user_prompt, user_context } = data

    const payload: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
      model: 'gpt-4o-2024-08-06',
      messages: [
        { role: 'system', content: system_prompt },
        { role: 'user', content: user_prompt + '\n' + user_context }
      ],
      response_format: zodResponseFormat(UI, 'ui'),
      max_tokens: 10000,
      temperature: 1
    }

    const completion = await openai.chat.completions.create(payload)

    console.log('*** data', completion.choices[0].message.content)

    return completion.choices[0].message.content
  } catch (error) {
    console.error('jsongen error', error)

    return
  }
}

export const splitgen = async (data: layoutFormType) => {

  const { system_prompt, user_prompt, user_context } = data

  const payload: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
    messages: [
      { role: 'system', content: system_prompt },
      { role: 'user', content: user_prompt + '\n' + user_context }
    ],
    model: 'gpt-4o-2024-08-06',
    max_tokens: 10000,
    response_format: zodResponseFormat(SectionTemplate, 'SectionTemplate'),
    temperature: 0
  }

  const completion = await openai.chat.completions.create(payload)

  const sectionJson: any = completion.choices[0].message.content || "{}"

  console.log('**** sectionJson', JSON.parse(sectionJson).index, JSON.parse(sectionJson).title);

  return JSON.parse(sectionJson)

}

export const summarygen = async (data: layoutFormType) => {

  const { system_prompt, user_prompt, user_context } = data

  const payload: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
    messages: [
      { role: 'system', content: system_prompt },
      { role: 'user', content: user_prompt + '\n' + user_context }
    ],
    model: 'gpt-4o-2024-08-06',
    max_tokens: 10000,
    response_format: zodResponseFormat(SummaryTemplate, 'SummaryTemplate'),
    temperature: 0
  }

  const completion = await openai.chat.completions.create(payload)

  const summaryJson = completion.choices[0].message.content || "{}"

  return { summaryJson: JSON.parse(summaryJson) }

}

export const htmlgen = async (data: layoutFormType) => {
  const { system_prompt, user_prompt, user_context } = data

  const payload: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
    messages: [
      { role: 'system', content: system_prompt },
      { role: 'user', content: user_prompt + '\n' + user_context }
    ],
    model: 'gpt-4o-2024-08-06',
    max_tokens: 10000,
    temperature: 0
  }

  const completion = await openai.chat.completions.create(payload)

  const mjml = completion.choices[0].message.content
  const htmlOutput = mjml2html(mjml as string)

  return { mjml, html: htmlOutput.html }
}

export const getImageDescription = async (data: imageFormType) => {
  try {
    const output = await openai.chat.completions.create({
      model: 'gpt-4o-2024-08-06',
      max_tokens: 7000,
      temperature: 0,
      messages: [
        {
          role: 'user',
          content: [
            // { type: "text", text: "This is marketing email template image. Clone with html and provide html code. Also Provide structure of the email layout. Describe in details including position, size, style, color, margin, padding, alignment, relationship, overlays, background image, background color, etc of each elements' such as images, fonts, links, layers and so on with exact content and links. so that it can be used to generate html same with the image." },
            {
              type: 'text',
              text: `
              ${data.prompt}
`
            },
            {
              type: 'image_url',
              image_url: {
                url: data.imageUrl
              }
            }
          ]
        }
      ]
    })

    // console.log('*** gpt-v', output.choices[0].message.content)

    return output.choices[0].message.content
  } catch (error) {
    console.log('*** get ai caption error', error)
  }
}

export const sectiongen = async (data: layoutFormType) => {


  const { system_prompt, user_prompt, user_context } = data

  const payload: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
    messages: [
      { role: 'system', content: system_prompt },
      { role: 'user', content: user_prompt + '\n' + user_context }
    ],
    model: 'gpt-4o-2024-11-20',
    max_tokens: 10000,
    response_format: zodResponseFormat(SectionTemplate, 'SectionTemplate'),
    temperature: 0
  }

  const completion = await openai.chat.completions.create(payload)

  const sectionJson: any = completion.choices[0].message.content || "{}"

  return JSON.parse(sectionJson)

}


export const processSection = async (template_id: string) => {

  const { data } = await supabase.from('templates').select('html').eq('id', template_id).single()

  try {

    const summaryJson = {
      children: [{ "index": "1", "description": "The preheader section is hidden by default and contains a brief message about the email's content, which is to save on various Google products. This section is styled to be invisible in the email client but is crucial for preview text in the inbox.", "title": "Preheader" }, { "index": "2", "description": "The header section includes the Google Store logo centered within a table. It is styled with a light background color (#F9F9F9) and padding to ensure the logo is prominently displayed. This section sets the tone for the email with a clean and professional look.", "title": "Header" }, { "index": "3", "description": "The hero section features a large headline and subhead text introducing the Father's Day gift guide. It includes a call-to-action button labeled 'Shop all' and a hero image that adapts to desktop and mobile views. The section is styled with a background color and padding to highlight the main message.", "title": "Hero Section" }, { "index": "4", "description": "This section showcases individual product highlights, each with an image, description, price, and a 'Gift it' call-to-action button. Products include the Pixel 6 Pro, Pixel Buds A-Series, Nest Cam, and Nest Doorbell. Each product is presented in a card-like format with a distinct background color and rounded corners.", "title": "Product Highlights" }, { "index": "5", "description": "The 'Coming Soon' section teases upcoming Google devices with a headline, brief description, and a 'See what’s next' link. It includes an image that adapts to different screen sizes. The section is styled with a light background color and padding to create anticipation for new products.", "title": "Coming Soon" }, { "index": "6", "description": "The 'Special Offers' section highlights additional deals available on the Google Store. It includes a headline, a call-to-action button labeled 'See all offers,' and an image showcasing various products. The section is styled to draw attention to the ongoing promotions.", "title": "Special Offers" }, { "index": "7", "description": "The 'Get More' section outlines additional benefits of shopping at the Google Store, such as Google One membership perks, free shipping, and trade-in offers. Each benefit is presented with an icon, headline, description, and a 'Learn more' link. The section is styled with a light background and card-like layout.", "title": "Additional Benefits" }, { "index": "8", "description": "The footer section includes social media links, feedback options, legal disclaimers, and contact information. It is styled with a clean layout and includes links to privacy policy and terms of service. The footer ensures compliance and provides users with options to manage their email preferences.", "title": "Footer" }]
    }


    const promiseValues = summaryJson.children.map((item: any) => {

      return splitgen({
        system_prompt: `
          Here is the whole html code of the template.
          \`\`\`
          ${data?.html}
          \`\`\`

          Provide only requested section's part.
        `,
        user_context: `${user_context_section}
          
          Here are the title and the description of the section.
          ${JSON.stringify(item)}`
      })
    });

    const result = await Promise.all(promiseValues);

    const sections: sectionType[] = result.map((item, index) => ({
      template_id: template_id,
      html: item.html,
      description: item.description,
      index: index.toString(),
      title: item.title
    }));

    const htmlSection = sections.map((section) => {

      return sectiongen({
        system_prompt: section_system_prompt,
        user_context: `
        this is just template section info of email marekting
        -html code: ${section.html}

        -description: ${section.description}

        -section number: ${section.index}
        `,
        user_prompt: `"logo": "https://aimferclcnvhawzpruzn.supabase.co/storage/v1/object/public/upload/logo/1726562604234-ico",
  "voicetone": "friendly and smarter",
  "products": [
    {
      "name": "Men's Wool Runners",
      "link": "https://cdn.shopify.com/s/files/1/1104/4168/collections/Allbirds_M_Wool_Runner_Kotare_GREY_ANGLE.png?v=1542061248",
      "price": "$68"
    },
    {
      "name": "Men's Wool & Tree Lounger/Tree Skipper Insoles",
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
    }]`
      })
    })

    const finalResult = await Promise.all(htmlSection)

    finalResult.sort((a, b) => a.index - b.index)
    let finalHtml = ''

    finalResult.map(result => {
      finalHtml += result.html
    })

    console.log('finalhtml _______----------------------------_____________________', finalHtml)

    // const saveHtml = await supabase.from('mjml').insert(finalHtml)

    // if (saveHtml.error) console.error('html save error')

  } catch (error) {
    console.error('Error processing summary:', error);
  }
};


export const summaryGenerate = async (data: layoutFormType) => {

  const { summaryJson } = await summarygen({
    system_prompt: data.system_prompt,
    user_prompt: '',
    user_context: data.user_context
  })

  if (!summaryJson || !summaryJson.children || !Array.isArray(summaryJson.children)) {
    throw new Error('summaryJson or summaryJson.children is not defined or not an array');
  }

  return JSON.stringify(summaryJson.children)

}

export const sectionsGenerate = async (data: layoutFormType) => {


  if (data.user_prompt) {

    const promiseValues = JSON.parse(data.user_prompt).map((item: any) => {

      return splitgen({
        system_prompt: data.system_prompt,
        user_context: `${data.user_context}
          
          Here are the title and the description of the section.
          ${JSON.stringify(item)}`
      })
    });

    const result = await Promise.all(promiseValues);

    const sections: sectionType[] = result.map((item, index) => ({
      html: item.html,
      description: item.description,
      index: index.toString(),
      title: item.title
    }));


    sections.sort((a, b) => parseInt(a.index) - parseInt(b.index))

    let generated = ''

    sections.map(result => {
      generated += result.html
    })

    return generated

  }

}


export const detectImage = async (data: imageFormType) => {
  try {

    const output = await openai.chat.completions.create({
      model: 'gpt-4o-2024-08-06',
      max_tokens: 7000,
      temperature: 0,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `
              ${data.prompt}
              `
            },
            {
              type: 'image_url',
              image_url: {
                url: data.imageUrl
              }
            }
          ]
        }
      ],
      response_format: zodResponseFormat(detectSummaryTemplate, 'detectSummaryTemplate'),
    })

    return output.choices[0].message.content
  } catch (error) {
    console.log('*** get ai caption error', error)
  }
}

export const analyzeImage = async (data: layoutFormType) => {

  try {
    const output = await openai.chat.completions.create({
      model: 'gpt-4o-2024-08-06',
      max_tokens: 10000,
      temperature: 0,
      messages: [{ role: 'system', content: [{ type: 'text', text: `${data.system_prompt}` }] },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: ` ${data.user_prompt}`
          },
          {
            type: 'image_url',
            image_url: {
              url: data.user_context
            }
          }
        ]
      }
      ],
      response_format: zodResponseFormat(detectSummaryTemplate, 'detectSummaryTemplate'),
    })

    const result = output.choices[0].message.content || "{}"

    return JSON.parse(result).description

  } catch (error) {
    console.log('*** get ai caption error', error)
  }
}

export const realHtmlGen = async (data: sectionType[], prompt: layoutFormType) => {
  const htmlSection = data.map((section) => {

    return sectiongen({
      system_prompt: section_system_prompt,
      user_context: `
      -This is html template section code of email marekting: ${section.html}

      -This is html template section title: ${section.title}

      -This is section number: ${section.index}
      `,
      user_prompt: prompt.user_prompt
    })
  })

  const finalResult = await Promise.all(htmlSection)

  finalResult.sort((a, b) => a.index - b.index)

  let finalHtml = ''

  finalResult.map(result => {
    finalHtml += result.html
  })

  return finalHtml

}

export const mjmlGen = async (prompt: mjmlGenType) => {

  const { system_prompt, user_prompt, user_context } = prompt

  const typePrompt = system_prompt == `I want ${system_prompt} email`

  const payload: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
    messages: [
      {
        role: 'system', content: `${typePrompt} ${updateMjml}
          This is original mjml template : ${system_prompt}
          This is new brand info: ${user_context}`
      },
      { role: 'user', content: `${user_prompt}` }
    ],
    model: 'gpt-4o-2024-08-06',
    response_format: zodResponseFormat(MJMLTemplate, 'Mjmltemplate'),
    max_tokens: 10000,
    temperature: 0
  }

  const completion = await openai.chat.completions.create(payload)

  const sectionJson: any = completion.choices[0].message.content || "{}"

  console.log('**** sectionJson', JSON.parse(sectionJson).title)

  return JSON.parse(sectionJson)
}


const openAIGen = (p_system: string, p_user: string, template?: z.ZodType<any>, model?: string) => {

  const payload: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
    messages: [
      {
        role: 'system',
        content: p_system,
      },
      {
        role: 'user',
        content: p_user,
      },
    ],
    model: model?.toString() || 'gpt-4o-2024-11-20',
    response_format: template ? zodResponseFormat(template, 'Mjmltemplate') : undefined,
    max_tokens: 10000,
    temperature: 0,
  };

  return payload

}

export const mjmlJsonGen = async (prompt: mjmlGenType) => {

  try {
    const { system_prompt, user_context, user_prompt } = prompt;

    const parsedUserContext = JSON.parse(user_context!);

    const { fonts, brandColor, voicetone } = parsedUserContext

    const mjmlSections = parsedUserContext.sections;

    delete parsedUserContext.fonts;
    delete parsedUserContext.brandColor;
    delete parsedUserContext.sections;

    parsedUserContext.imageInfo.forEach((image: any) => {
      delete image.title;
      delete image.description;
    });

    const sectionsPayloadPromises = mjmlSections.map((section: string) => {
      const payload: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
        messages: [
          {
            role: 'system',
            content: 'You are email marketing Designer & mjml expert.',
          },
          {
            role: 'user',
            content: `${p_mjmlPart}
            This is Brand Info
            font: ${JSON.stringify(fonts)}
            brandColor: ${JSON.stringify(brandColor)}
            voiceTone: ${JSON.stringify(voicetone)}
            This is MJML Code
            ${section}
            `,
          },
        ],
        model: 'gpt-4o-2024-11-20',
        response_format: zodResponseFormat(MJMLTemplate, 'Mjmltemplate'),
        max_tokens: 10000,
        temperature: 0,
      };

      return openai.chat.completions.create(payload);
    });

    const payload = openAIGen('You are email marketing Designer.',
      `This is Json for ${system_prompt} email and give me updated based on basic info.
        Note:
        - Completely replace the original JSON with the new updated data.
        - Do not retain any of the original JSON data.
        - Use this exact JSON format to generate the output.
        - Date Awareness: Automatically update all time-sensitive content and any other references to the current year (2025) to reflect the current year.
        - Use the prompt value to craft the theme of the email.
        - The product links and images of Json have to be updated from imageInfo of basic info rather than being generated.
        - Include a footer with dynamically updated footerRights (e.g., include the current year: “© 2025”), contactInfo, socialMedia.
        - Ensure every text element matches the tone defined in the voicetone field.
        - Provide only JSON code. No description, no JSON \`\`\` on top, no \`\`\` on bottom
        ${user_prompt}
        this is basic info for email marketing.
        ${JSON.stringify(parsedUserContext)}`,
    )

    const imageNum = parsedUserContext.imageInfo.length;

    const imagePayload = openAIGen('You are email marketing Designer.',
      ` I need ${imageNum} highly engaging, creative, and detailed image sections for an ${system_prompt} email marketing campaign. 
        Requirements for each section:
        Title: A captivating and attention-grabbing title that resonates with the target audience, keeping it short and impactful.
        Description: A concise yet detailed description (2-3 sentences) that clearly communicates the value or purpose of the section while maintaining a persuasive tone.
        Button Text: A compelling and action-oriented call-to-action (CTA) button text that encourages the recipient to take the next step.
        Email Title: A cohesive and enticing email subject line that ties all three sections together, designed to boost open rates and click-through rates.
        prompt: ${JSON.parse(user_prompt!).prompt}
        voicetone: ${JSON.parse(user_prompt!).voicetone}
        The output should be in the following format:
        {
          "images": [
            { "title": "", "description": "", "buttonText": "" },
            { "title": "", "description": "", "buttonText": "" },
            { "title": "", "description": "", "buttonText": "" }
          ],
          "emailTitle": ""
        }
        provide only JSON. No description, no JSON \`\`\` on top, no \`\`\` on bottom.`
      , imageInfo
    )

    const fontsPayload = openAIGen('You are mjml expert',
      `I have font information. give me <mj-font> tags based on font info. The output should only include the correct <mj-font> tags without any extra description or explanation.
         fonts: ${JSON.stringify(fonts)}`,
      MJMLTemplate
    )

    const [jsonResponse, imageResponse, fontsResponse, sectionsResponses] = await Promise.all([
      openai.chat.completions.create(payload),
      openai.chat.completions.create(imagePayload),
      openai.chat.completions.create(fontsPayload),
      Promise.all(sectionsPayloadPromises),
    ]);

    const sectionJson = JSON.parse(jsonResponse.choices[0].message.content || '{}');
    const sectionImage = JSON.parse(imageResponse.choices[0].message.content || '{}');
    const sectionfonts = JSON.parse(fontsResponse.choices[0].message.content || '{}').content;

    const sectionsData = sectionsResponses.map(response => JSON.parse(response.choices[0].message.content || '{}').content);

    return { sectionImage, sectionJson, sectionfonts, sectionsData };

  } catch (error) {
    console.log('Error:', error);

    return null;
  }
}