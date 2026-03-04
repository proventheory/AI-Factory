'use client'

import { useCallback, useEffect, useState } from 'react'

import { useRouter, useParams, usePathname } from 'next/navigation'

import { useDispatch } from 'react-redux'
import type { Theme } from '@mui/material';
import { Button, Card, CardContent, IconButton, ImageList, ImageListItem, ImageListItemBar, useMediaQuery } from '@mui/material'
import type { SubmitHandler } from 'react-hook-form'
import { Controller, useForm } from 'react-hook-form'
import Grid from '@mui/material/Grid'
import { toast } from 'react-toastify'

import DeleteIcon from '@mui/icons-material/Delete';

import Handlebars from 'handlebars'

import type { Locale } from '@configs/i18n'
import { getLocalizedUrl } from '@/utils/i18n'
import { mjmlJsonGen } from '@/app/server/ai-engine'
import CustomTextField from '@core/components/mui/TextField'
import { supabase } from '@/utils/supabase'
import { loadingPrecess } from '@/redux-store/slices/loading'

import ProductDlg from './ProductDlg'
import NewsletterDlg from './NewsletterDlg'
import ImageComponent from '@/utils/imageComponent'
import { getSession } from '@/utils/queries';
import { socialIcons } from '@/utils/constrants';
import { demoPattern } from '@/utils';

type PromptTypes = {
  description: string
}

type Props = {
  template_id: string
}

export type ImageTypes = {
  title: string
  src: string
  productUrl: string
}

type SectionsType = {
  style: string
  body: string[]
}

const ProductAdd = ({ template_id }: Props) => {

  const router = useRouter()
  const pathName = usePathname()
  const dispatch = useDispatch()
  const [products, setProducts] = useState<ImageTypes[]>([])
  const { lang: locale } = useParams()

  const [template, setTemplate] = useState<{ type: string, sections: SectionsType, json: JSON, img_count: number } | null>(null)
  const [open, setOpen] = useState<boolean>(false)

  const [hoverId, setHoverId] = useState<number | null>(null)

  const {
    control,
    handleSubmit,
    formState: { errors }
  } = useForm<PromptTypes>({
    defaultValues: {
      description: '',
    }
  })

  const isBelowSmScreen = useMediaQuery((theme: Theme) => theme.breakpoints.down('sm'))

  const onSubmit: SubmitHandler<PromptTypes> = async (formData) => {
    try {

      if (formData.description.length < 30) {
        toast.warning('Warning: The description is too short. It should be at least 30 characters long.', { autoClose: 3000, type: 'warning' })

        return
      }

      if (template?.img_count && products.length < template.img_count) {
        toast.warning(`Oops! You need to select at least ${template.img_count} images before continuing.`, { autoClose: 3000, type: 'warning' })

        return
      }

      dispatch(loadingPrecess({ visible: true, content: 'processing...' }))

      const [session] = await Promise.all([getSession(pathName)])

      const { data: defaultBrand, error } = await supabase
        .from('profiles_brand')
        .select('data, id')
        .eq('user_id', session?.user.id)
        .eq('is_default', true)
        .single()

      if (error) {
        dispatch(loadingPrecess({ visible: false, content: '' }))
        toast.warning('Kindly review your brand information.', {
          autoClose: 5000,
          type: 'error'
        })
        console.error('error', error)
      }

      if (defaultBrand) {

        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { urls, colors, imageUrls, sitemap, contactInfo, ...filteredUserContext } = defaultBrand.data;

        const updatedContext = {
          ...filteredUserContext,
          prompt: formData.description,
          siteUrl: new URL(defaultBrand.data?.sitemap?.url).origin,
          sections: template?.sections.body,
          socialMedia: defaultBrand.data?.socialMedia.map((item: { link: string, name: keyof typeof socialIcons }) => { if (item.link) return { link: item.link, icon: socialIcons[item.name.toLowerCase() as keyof typeof socialIcons] } }),
          imageInfo: products.map(item => {
            const updateSrc = item.src.startsWith('https') ? item.src : item.src.startsWith('//') ? 'https:'.concat(item.src) : 'https://www.'.concat(item.src)

            return {
              link: template?.type == 'product' ? item.productUrl ? item.productUrl : new URL(defaultBrand.data?.sitemap?.url).origin : '', image: updateSrc.replace(/\.(jpg|jpeg|gif|webp|bmp)$/i, '.png')
            }
          })
        }

        if (!template || !template.json) throw new Error('Fail to select template.')

        const output = await mjmlJsonGen({ system_prompt: template.type, user_context: JSON.stringify(updatedContext), user_prompt: JSON.stringify(template.json) })

        if (output) {

          const { sectionJson, sectionImage, sectionsData, sectionfonts } = output

          sectionImage.images.map((image: any, index: number) => {

            if (sectionJson[`product${index + 1}`]) {
              sectionJson[`product${index + 1}`]['title'] = image.title
              sectionJson[`product${index + 1}`]['description'] = image.description
              sectionJson[`product${index + 1}`]['buttonText'] = image.buttonText
            }
          });

          let bodyCode: string = ""

          sectionsData.map((section: string) => {

            bodyCode += section
          })

          const fullMjmlCode = `<mjml> 
          <mj-head>
          ${sectionfonts}
          <mj-style>
            ${template.sections.style}
          </mj-style>
          </mj-head>
          <mj-body width="720px" background-color="#9b9b9b" css-class="mjbody">
          ${bodyCode}
          </mj-body>
          `

          const templateContent = Handlebars.compile(fullMjmlCode)

          const mjmlContent = templateContent(sectionJson).replaceAll('&lt;span&gt;', '<span>').replaceAll('&lt;strong&gt;', '<strong>').replaceAll('&lt;/span&gt;', '</span>').replaceAll('&lt;/strong&gt;', '</strong>')

          const { data: saveMjml, error: saveError } = await supabase.from('mjmls').insert({ user_id: session?.user.id, content: `${mjmlContent}`, title: `${sectionImage.emailTitle}`, type: `${template.type}`, prompt: `${formData.description}`, template_id, brand_id: defaultBrand.id }).select('id').single()

          if (saveError) throw new Error('Faild to save mjml')

          isBelowSmScreen ? router.push(getLocalizedUrl(demoPattern.test(pathName) ? `/demo/campaigns/pre/${saveMjml.id}` : `/campaigns/pre/${saveMjml.id}`, locale as Locale)) : router.push(getLocalizedUrl(demoPattern.test(pathName) ? `/demo/campaigns/edit/${saveMjml.id}` : `/campaigns/edit/${saveMjml.id}`, locale as Locale))

        }
        else throw new Error('Fail to generate Email')

      }

    } catch (error) {
      dispatch(loadingPrecess({ visible: false, content: '' }))
      toast.warning('Oops! Something went wrong, and we couldn’t generate the email. Please try again.', {
        autoClose: 3000,
        type: 'error'
      })
      console.error('Error generating MJML:', error)
    }
  }

  const getTemplate = useCallback(async () => {

    const { data, error } = await supabase.from('templates').select('type, json, img_count, sections').eq('id', template_id).single()

    if (!error && data) {
      setTemplate(data)
      toast.info(`select at least ${data.img_count} images before continuing.`, { autoClose: 3000, type: 'info' })
    }
    else {
      toast.warning('Oops! Something went wrong, and we couldn’t generate the email. Please try again.', {
        autoClose: 5000,
        type: 'error'
      })
      console.error('Error generating MJML:', error)
    }

  }, [template_id])

  useEffect(() => {

    getTemplate()

  }, [template_id, getTemplate])


  const handleSelect = (data: ImageTypes[]) => {

    setProducts([...products, ...data])
  }

  return (
    <Grid container spacing={6}>
      <Grid item xs={12}>
        <Card className='py-30px'>
          <div className='flex flex-wrap sm:items-center justify-between gap-6 p-[20px]'>
            <Button
              variant='outlined'
              onClick={() => router.back()}
              startIcon={<i className='bx-arrow-back' />}
              className='hover:bg-primary hover:border-primary font-Helvetica'
              sx={{ borderColor: '#3751DC', color: '#3751DC' }}
            >
              back
            </Button>
          </div>
          <CardContent className='px-[40px] gap-10 flex flex-col'>
            <Grid item xs={12} className='flex flex-row items-center justify-between'>
              <Button variant='outlined' sx={{ width: '100px', height: '100px' }} onClick={() => {
                setOpen(true)
              }}>
                +Add
              </Button>
            </Grid>
            <Grid item xs={12}>
              {
                products.length > 0 &&
                <ImageList variant='masonry' cols={4} className='grid grid-cols-6 max-lg:grid-cols-4 max-sm:grid-cols-3 max-h-[500px] overflow-y-auto'>
                  {products.map((item, index) => {
                    return (
                      <ImageListItem key={index}
                        onMouseLeave={() => setHoverId(null)}
                        onMouseEnter={() => setHoverId(index)}
                      >
                        <ImageComponent
                          width={200}
                          height={200}
                          src={item.src}
                          alt={index.toString()}
                        />
                        {hoverId == index && <ImageListItemBar
                          sx={{
                            background:
                              'linear-gradient(to bottom, rgba(0,0,0,0.7) 0%, ' +
                              'rgba(0,0,0,0.3) 70%, rgba(0,0,0,0) 100%)',
                          }}
                          position="top"
                          actionIcon={
                            <IconButton
                              onClick={async () => {
                                setProducts((prev) => prev.filter((_, i) => i !== index));

                              }}
                              className='text-white hover:text-red-700'
                              aria-label={`star ${index.toString()}`}>
                              <DeleteIcon />
                            </IconButton>
                          }
                          actionPosition="right"
                        />}
                      </ImageListItem>
                    );
                  })}
                </ImageList>
              }
            </Grid>
            <form
              noValidate
              autoComplete='off'
              action={() => { }}
              onSubmit={handleSubmit(onSubmit)}
              className='grid gap-6 sm:grid-cols-4 grid-cols-2'
            >
              <Controller
                name='description'
                control={control}
                rules={{ required: true }}
                render={({ field }) => (
                  <CustomTextField
                    {...field}
                    minRows={3}
                    maxRows={5}
                    fullWidth
                    multiline
                    label='Email Marketing Specifics'
                    onChange={e => {
                      field.onChange(e.target.value)
                    }}
                    className='focus:border-primary sm:col-span-4 col-span-2'
                    placeholder={`Create a vibrant, engaging product offer email announcing a 50% off storewide sale for Black Friday and Cyber Monday. Use a fun and creative tone, and include plenty of emojis to bring the message to life! 🎉🛒`}
                    {...(errors.description && { error: true, helperText: 'This field is required.' })}
                  />
                )}
              />
              <div className='flex flex-row sm:col-span-4 col-span-2 justify-end'>
                <Button variant='contained' className='bg-primary border-primary max-sm:w-full' type='submit'>
                  Generate
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </Grid>
      {template?.type == 'product' ? <ProductDlg open={open} setOpen={setOpen} setProducts={handleSelect} pathName={pathName} /> : <NewsletterDlg open={open} setOpen={setOpen} setProducts={handleSelect} pathName={pathName} />}
    </Grid >
  )
}

export default ProductAdd
