'use client'

import React, { useState, useEffect } from 'react'

import { useDispatch } from 'react-redux'

import type { EmailTemplate } from 'easy-email-pro-editor'
import { EmailEditorProvider } from 'easy-email-pro-editor'

import type { ThemeConfigProps } from 'easy-email-pro-theme';
import { IconFont, mjmlToJson, Retro } from 'easy-email-pro-theme'

import { Layout } from '@arco-design/web-react'

import { Grid, Card } from '@mui/material'

import { toast } from 'react-toastify'

import { ElementType, PluginManager, t } from 'easy-email-pro-core'

import {
  Countdown,

  // Shopwindow,
  // QRCode,

  MarketingType,
} from "easy-email-pro-kit";

import { EditorHeader } from './components/EditorHeader'
import { useUpload } from './hooks/useUpload'

import 'easy-email-pro-theme/lib/style.css'
import '@arco-themes/react-easy-email-pro/css/arco.css'

import { supabase } from '@/utils/supabase'
import { loadingPrecess } from '@/redux-store/slices/loading'

type Props = {
  emailId: string
}

const EmailEdit = ({ emailId }: Props) => {
  const { upload } = useUpload()

  const dispatch = useDispatch()

  PluginManager.registerPlugins([
    Countdown,

    // Shopwindow,
    // QRCode,
  ])

  const categories: ThemeConfigProps["categories"] = [
    {
      get label() {
        return t("Custom Block");
      },
      active: true,
      displayType: "grid",
      blocks: [
        {
          type: ElementType.STANDARD_PARAGRAPH,
          icon: (
            <IconFont
              className={"block-list-grid-item-icon"}
              iconName="icon-text"
            />
          ),
        },
        {
          type: ElementType.STANDARD_IMAGE,
          payload: {},
          icon: (
            <IconFont
              className={"block-list-grid-item-icon"}
              iconName="icon-img"
            />
          ),
        },
        {
          type: ElementType.STANDARD_BUTTON,
          icon: (
            <IconFont
              className={"block-list-grid-item-icon"}
              iconName="icon-button"
            />
          ),
        },
        {
          type: ElementType.STANDARD_DIVIDER,
          icon: (
            <IconFont
              className={"block-list-grid-item-icon"}
              iconName="icon-divider"
            />
          ),
        },
        {
          type: ElementType.STANDARD_SPACER,
          icon: (
            <IconFont
              className={"block-list-grid-item-icon"}
              iconName="icon-spacing"
            />
          ),
        },
        {
          type: ElementType.STANDARD_NAVBAR,
          icon: (
            <IconFont
              className={"block-list-grid-item-icon"}
              iconName="icon-navbar"
            />
          ),
        },
        {
          type: ElementType.STANDARD_SOCIAL,
          icon: (
            <IconFont
              className={"block-list-grid-item-icon"}
              iconName="icon-social"
            />
          ),
          payload: {
            type: "standard-social",
            data: {},
            attributes: {
              spacing: "8px",
              "icon-size": "30px",
              mode: "horizontal",
            },
            children: [
              {
                data: {},
                type: "standard-social-element",
                children: [
                  {
                    text: "",
                  },
                ],
                attributes: {
                  src: "https://res.cloudinary.com/dfite2e16/image/upload/v1681908489/clgnivsuj0018z9ltiixmxf6k/xkd0kfnytbfywsofk8t6.png",
                  href: "",
                  "padding-left": "0px",
                  "padding-right": "0px",
                  "padding-top": "0px",
                  "padding-bottom": "0px",
                },
              },
              {
                data: {},
                type: "standard-social-element",
                children: [
                  {
                    text: "",
                  },
                ],
                attributes: {
                  src: "https://res.cloudinary.com/dfite2e16/image/upload/v1681908521/clgnivsuj0018z9ltiixmxf6k/ulyduaza1votoacctoi3.png",
                  href: "",
                  "padding-left": "8px",
                  "padding-right": "0px",
                  "padding-top": "0px",
                  "padding-bottom": "0px",
                },
              },
              {
                data: {},
                type: "standard-social-element",
                children: [
                  {
                    text: "",
                  },
                ],
                attributes: {
                  src: "https://res.cloudinary.com/dfite2e16/image/upload/v1681908543/clgnivsuj0018z9ltiixmxf6k/wtefhsfwaapcdbz7knqw.png",
                  href: "",
                  "padding-left": "8px",
                  "padding-right": "0px",
                  "padding-top": "0px",
                  "padding-bottom": "0px",
                },
              },
            ],
          },
        },
        {
          type: ElementType.STANDARD_HERO,
          icon: (
            <IconFont
              className={"block-list-grid-item-icon"}
              iconName="icon-hero"
            />
          ),
          payload: {
            type: "standard-hero",
            data: {},
            attributes: {
              "background-width": "1080px",
              "background-height": "721px",
              "padding-top": "100px",
              "padding-bottom": "50px",
              "background-image-enabled": true,
              "background-url":
                "http://res.cloudinary.com/djnkpbshx/image/upload/v1698677931/easy-email-pro-test/t75ucncjgmm5vwp6r2s4.jpg",
              "background-position": "center center",
              mode: "fluid-height",
            },
            children: [
              {
                type: "standard-h1",
                data: {},
                attributes: {
                  color: "#FFFFFF",
                },
                children: [
                  {
                    text: "We Serve Healthy & Delicious Foods",
                  },
                ],
              },
              {
                type: "standard-paragraph",
                data: {},
                attributes: {
                  color: "#FFFFFF",
                },
                children: [
                  {
                    text: "A small river named Duden flows by their place and supplies it with the necessary regelialia. It is a paradisematic country, in which roasted parts of sentences fly into your mouth.",
                  },
                ],
              },
              {
                type: "standard-button",
                data: {
                  content: "Button",
                },
                attributes: {
                  "padding-top": "30px",
                  "padding-bottom": "30px",
                  "background-color": "#8b2a36",
                },
                children: [
                  {
                    text: "Get Your Order Here!",
                  },
                ],
              },
            ],
          },
        },

        // {
        //   type: MarketingType.MARKETING_SHOPWINDOW,
        //   icon: (
        //     <IconFont
        //       className={"block-list-grid-item-icon"}
        //       iconName="icon-bag"
        //     />
        //   ),
        // },
        
        {
          type: MarketingType.MARKETING_COUNTDOWN,
          icon: (
            <IconFont
              className={"block-list-grid-item-icon"}
              iconName="icon-countdown"
            />
          ),
        } as { type: any, icon: JSX.Element },

        // {
        //   type: MarketingType.MARKETING_QR_CODE,
        //   icon: (
        //     <div className={"block-list-grid-item-icon"}>
        //       <IconFont
        //         className={"block-list-grid-item-icon"}
        //         iconName="icon-qrcode"
        //       />
        //     </div>
        //   ),
        // }
      ],
    },
    {
      get label() {
        return t("Layout");
      },
      active: true,
      displayType: "column",
      blocks: [
        {
          get title() {
            return t("1 column");
          },
          payload: [["100%"]],
        },
        {
          get title() {
            return t("2 column");
          },
          payload: [
            ["50%", "50%"],
            ["33%", "67%"],
            ["67%", "33%"],
            ["25%", "75%"],
            ["75%", "25%"],
          ],
        },
        {
          get title() {
            return t("3 column");
          },
          payload: [
            ["33.33%", "33.33%", "33.33%"],
            ["25%", "50%", "25%"],
            ["25%", "25%", "50%"],
            ["50%", "25%", "25%"],
          ],
        },
        {
          get title() {
            return t("4 column");
          },
          payload: [["25%", "25%", "25%", "25%"]],
        },
      ],
    },
  ];

  const [initialValues, setInitialValues] = useState<EmailTemplate>({
    subject: 'loading',
    content: mjmlToJson(`<mjml>
    <mj-body background-color="#E6E6FA">
      <mj-section background-color="#FFFFFF">
        <mj-column>
            <mj-text font-weight="bold">There is nothing to edit</mj-text>
        </mj-column>
      </mj-section>
    </mj-body>
  </mjml>`)
  })

  const fetchInitialValues = async () => {

    dispatch(loadingPrecess({ visible: false, content: '', commonVisible: true }))

    const { data, error } = await supabase.from('mjmls').select('content, title').eq('id', emailId).single()

    dispatch(loadingPrecess({ commonVisible: false }))

    if (error) {
      toast.warning('Error fetching content', { autoClose: 5000, hideProgressBar: false, type: 'warning' })
    } else {
      setInitialValues({
        subject: data.title,
        content: mjmlToJson(data.content as string)
      })
    }

  }

  useEffect(() => {

    fetchInitialValues()

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emailId])

  const onUpload = (file: Blob): Promise<string> => {
    return upload(file)
  }

  const onSubmit = async (values: EmailTemplate) => {
    console.log(values)
  }

  const config = Retro.useCreateConfig({
    clientId: 'free',
    categories,
    height: 'calc(100vh - 66px)',
    onUpload,
    initialValues: initialValues,
    onSubmit: onSubmit,
    showSourceCode: true,
    showLayer: true,
    showPreview: false,
    showSidebar: true,
    compact: false,
    showDragMoveIcon: true,
    showInsertTips: true
  })

  return (
    <Grid container spacing={6}>
      <Grid item xs={12}>
        <Card className='py-30px'>
          <EmailEditorProvider key={JSON.stringify(initialValues)} {...config}>
            <EditorHeader mjmlId={emailId} extra />
            <Layout.Content>
              <Retro.Layout></Retro.Layout>
            </Layout.Content>
          </EmailEditorProvider>
        </Card>
      </Grid>
    </Grid>
  )
}

export default EmailEdit
