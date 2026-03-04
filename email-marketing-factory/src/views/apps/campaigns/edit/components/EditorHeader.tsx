import React, { useState } from 'react'

import { useRouter, usePathname, useParams } from 'next/navigation'

import type { EmailTemplate } from 'easy-email-pro-editor'
import { useEditorProps } from 'easy-email-pro-editor'
import { mjmlToJson, useEditorContext } from 'easy-email-pro-theme'
import { EditorCore } from 'easy-email-pro-core'

import mjml from 'mjml-browser'
import { saveAs } from 'file-saver'
import { Button, InputAdornment, Menu, MenuItem } from '@mui/material'

import { useDispatch } from 'react-redux'

import type { Locale } from '@configs/i18n'

import { Uploader } from '../utils/Uploader'
import { supabase } from '@/utils/supabase'
import { loadingPrecess } from '@/redux-store/slices/loading'
import CustomTextField from '@/@core/components/mui/TextField'
import { success } from '@/utils/toasts'
import { demoPattern } from '@/utils'
import { getLocalizedUrl } from '@/utils/i18n'

export const EditorHeader = (props: { extra?: React.ReactNode; hideImport?: boolean; hideExport?: boolean; mjmlId?: string; }) => {

  const router = useRouter()
  const pathName = usePathname()
  const { lang: locale } = useParams()
  const { values, setFieldValue } = useEditorContext()
  const { reset } = useEditorContext()

  const [anchorImport, setAnchorImport] = useState<HTMLElement | null>(null)
  const [anchorExport, setAnchorExport] = useState<HTMLElement | null>(null)
  const [anchorSub, setAnchorSub] = useState<HTMLElement | null>(null)

  const dispatch = useDispatch()

  const { universalElementSetting } = useEditorProps()

  const onExportJSON = () => {

    setAnchorExport(null)

    navigator.clipboard.writeText(JSON.stringify(values, null, 2))
    saveAs(new Blob([JSON.stringify(values, null, 2)], { type: 'application/json' }), 'easy-email-pro.json')
  }

  const removeElement = (mjml: string) => {

    mjml = mjml.replaceAll(/<mj-breakpoint width="480px" \/>/g, '');
    mjml = mjml.replaceAll('<mj-style>.mjbody a, .mjbody a:hover, .mjbody a:active, .mjbody a[href], .mjbody a[href]:hover, .mjbody a[href]:active {color: inherit;text-decoration: underline}</mj-style>', '');
    mjml = mjml.replaceAll('<mj-style inline="inline">.hide-desktop-block,.hide-desktop-inline-block,.hide-block{display:none!important;mso-hide:all!important}.direction-rtl,.navbar-direction-rtl .mj-link{direction:rtl} </mj-style>', '');
    mjml = mjml.replaceAll('<mj-style>.mjbody a{color:inherit}@media (max-width: 480px){.hide-mobile-block{max-height:0px;overflow:hidden;display:none!important}.hide-desktop-block{display:block!important}.hide-mobile-inline-block{max-height:0px;overflow:hidden;display:none!important}.hide-desktop-inline-block{display:inline-block!important}} </mj-style>', '')

    return mjml
  }

  const onExportMJML = () => {

    setAnchorExport(null)

    let mjmlStr = EditorCore.toMJML({
      element: values.content,
      mode: 'production',
      universalElements: universalElementSetting,
      beautify: true
    })

    mjmlStr = removeElement(mjmlStr)

    navigator.clipboard.writeText(mjmlStr)
    saveAs(new Blob([mjmlStr], { type: 'text/mjml' }), 'easy-email-pro.mjml')
  }

  const onExportHTML = (type: string) => {

    setAnchorExport(null)
    setAnchorSub(null)

    const mjmlStr: string = EditorCore.toMJML({
      element: values.content,
      mode: 'production',
      universalElements: universalElementSetting,
      beautify: true
    })

    let updatedStr: string = ''

    switch (type) {
      case 'klaviyo':
        updatedStr = '{{ unsubscribe_link }}'
        break
      case 'mailChimp':
        updatedStr = '*|UNSUB|*'
        break
      case 'shopify':
        updatedStr = '{{ unsubscribe_url }}'
        break
      case 'hubspot':
        updatedStr = '{{ unsubscribe_link }}'
        break
      case 'activeCampaigns':
        updatedStr = '%UNSUBSCRIBELINK%'
        break
      case 'brevo':
        updatedStr = '[UNSUBSCRIBE]'
        break
      case 'omniSend':
        updatedStr = '{{ unsubscribe_url }}'
        break
      case 'constantContact':
        updatedStr = '{{ unsubscribe_url }}'
        break
      case 'salesforce':
        updatedStr = '%%unsub_center_url%%'
        break
      case 'aweber':
        updatedStr = '{{ unsubscribe_url }}'
        break

      default: {
        updatedStr = '{{ unsubscribe_url }}'
        break
      }
    }

    const html = mjml(mjmlStr.replace('***unsubscribe***', `&nbsp;<span><a href="${updatedStr}" target="_blank">Unsubscribe</a></span>`)).html

    //pattern
    const importUrl = /@import\s+url\([^)]+\);\s*/g;
    const updatedHtml = html.replaceAll(/background="#[0-9a-fA-F]{6}"/g, '').replace(importUrl, '').replaceAll('"//', '"http://').replaceAll("'//", "'http://");

    //remove background issue
    navigator.clipboard.writeText(updatedHtml)
    saveAs(new Blob([updatedHtml], { type: 'text/html' }), 'focuz.html')
  }

  const onImportMJML = async () => {

    setAnchorImport(null)

    const uploader = new Uploader(() => Promise.resolve(''), {
      accept: 'text/mjml',
      limit: 1
    })

    const [file] = await uploader.chooseFile()
    const reader = new FileReader()

    const pageData = await new Promise<[string, EmailTemplate['content']]>((resolve, reject) => {
      reader.onload = function (evt) {
        if (!evt.target) {
          reject()

          return
        }

        try {
          const pageData = mjmlToJson(evt.target.result as any)

          console.log('pageData', pageData)
          resolve([file.name, pageData])
        } catch (error) {
          reject()
        }
      }

      reader.readAsText(file)
    })

    reset({
      subject: pageData[0],
      content: pageData[1]
    })
  }

  const onImportJSON = async () => {

    setAnchorImport(null)

    const uploader = new Uploader(() => Promise.resolve(''), {
      accept: 'application/json',
      limit: 1
    })

    const [file] = await uploader.chooseFile()
    const reader = new FileReader()

    const emailTemplate = await new Promise<EmailTemplate>((resolve, reject) => {
      reader.onload = function (evt) {
        if (!evt.target) {
          reject()

          return
        }

        try {
          const template = JSON.parse(evt.target.result as any) as EmailTemplate

          resolve(template)
        } catch (error) {
          reject()
        }
      }

      reader.readAsText(file)
    })

    reset({
      subject: emailTemplate.subject,
      content: emailTemplate.content
    })
  }

  const udpateMjml = async () => {

    dispatch(loadingPrecess({ commonVisible: true }))

    let mjml = EditorCore.toMJML({
      element: values.content,
      mode: 'production',
      universalElements: universalElementSetting,
      beautify: true
    })

    mjml = removeElement(mjml)
    const { error } = await supabase.from('mjmls').update({ content: mjml, title: values.subject }).eq('id', props.mjmlId)

    if (error)
      console.log('update mjml', error);
    else {
      dispatch(loadingPrecess({ commonVisible: false }))
      success('Email saved successfully.')
    }

    router.push('/campaigns')
  }

  const deleteMjml = async () => {

    dispatch(loadingPrecess({ commonVisible: true }))
    const { error } = await supabase.from('mjmls').delete().eq('id', props.mjmlId)

    if (!error)
      success('Email deleted successfully.')

    dispatch(loadingPrecess({ commonVisible: false }))

    router.push('/campaigns')
  }

  return (
    <>
      {values.subject != 'loading' ? <div style={{ position: 'relative', padding: '15px 20px 15px 20px' }} className='flex flex-row justify-between border-b-black border-b-2'>
        <CustomTextField
          className='w-[300px]'
          onChange={(e) => setFieldValue(null, 'subject', e.target.value)}
          value={values.subject}
          InputProps={{
            startAdornment: (
              <InputAdornment position='start'>
                <i className='bx-edit' />
              </InputAdornment>
            )
          }}
        />

        <div className='flex flex-row gap-2'>
          {demoPattern.test(pathName) ?
            <Button variant='contained' onClick={() => router.push(getLocalizedUrl('demo/campaigns', locale as Locale))
            }><strong>Back</strong></Button> :
            <>
              <Button variant='contained' onClick={udpateMjml}><strong>Save</strong></Button>
              <Button variant='tonal' color='secondary' onClick={deleteMjml}><strong>Delete</strong></Button>
            </>}
          <Button variant='outlined' onClick={(e) => { setAnchorImport(e.currentTarget) }}><strong>import</strong></Button>
          <Button variant='outlined' onClick={(e) => { setAnchorExport(e.currentTarget) }}><strong>export</strong></Button>
        </div>

        <Menu id='import' anchorEl={anchorImport} onClose={() => setAnchorImport(null)}
          open={Boolean(anchorImport)}>
          <MenuItem onClick={onImportMJML}>Import as MJML</MenuItem>
          <MenuItem onClick={onImportJSON}>Import as JSON</MenuItem>
        </Menu>

        <Menu id='export' anchorEl={anchorExport} onClose={() => setAnchorExport(null)}
          open={Boolean(anchorExport)}>
          <MenuItem onClick={(e) => setAnchorSub(anchorSub ? null : e.currentTarget)}> Export as Html</MenuItem>
          <MenuItem onClick={onExportMJML}>Export as MJML</MenuItem>
          <MenuItem onClick={onExportJSON}>Export as JSON</MenuItem>
        </Menu>

        <Menu anchorEl={anchorSub} onClose={() => {
          setAnchorSub(null)
          setAnchorExport(null)
        }}
          open={Boolean(anchorSub)}
          anchorOrigin={{
            vertical: 'center',
            horizontal: 'left',
          }}
          transformOrigin={{
            vertical: 'top',
            horizontal: 'right',
          }}>
          <MenuItem onClick={() => onExportHTML('klaviyo')}>Klaviyo</MenuItem>
          <MenuItem onClick={() => onExportHTML('mailChimp')}>MailChimp</MenuItem>
          <MenuItem onClick={() => onExportHTML('shopify')}>Shopify</MenuItem>
          <MenuItem onClick={() => onExportHTML('hubspot')}>Hubspot</MenuItem>
          <MenuItem onClick={() => onExportHTML('activeCampaigns')}>ActiveCampaigns</MenuItem>
          <MenuItem onClick={() => onExportHTML('brevo')}>Brevo</MenuItem>
          <MenuItem onClick={() => onExportHTML('omniSend')}>OmniSend</MenuItem>
          <MenuItem onClick={() => onExportHTML('constantContact')}>ConstantContact</MenuItem>
          <MenuItem onClick={() => onExportHTML('aweber')}>Aweber</MenuItem>
        </Menu>
      </div> : <></>}

    </>
  )
}
