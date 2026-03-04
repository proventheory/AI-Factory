'use client'

import { Button, Grid } from '@mui/material'

import Lottie from 'lottie-react'

import { useSelector } from 'react-redux';

import type { ChildrenType } from '@core/types'
import type { Locale } from '@configs/i18n'

import BlankLayout from '@layouts/BlankLayout'

import { frontLayoutClasses } from '@layouts/utils/layoutClasses'

import loading from '@/utils/loading.json'
import loading1 from '@/utils/loading1.json'

import type { RootState } from '@/redux-store';
import Customizer from '@/@core/components/customizer';

import { i18n } from '@configs/i18n'
import ScrollToTop from '@/@core/components/scroll-to-top';

type Props = ChildrenType & {
    params: { lang: Locale }
}

const Layout = ({ children, params }: Props) => {

    const direction = i18n.langDirection[params.lang]

    const { visible, commonVisible } = useSelector((state: RootState) => state.loadingReducer)

    return (
        <div className={frontLayoutClasses.root}>
            <Grid container>
                <Grid item xs={1} sx={{ paddingLeft: 2, paddingRight: 2 }}>
                </Grid>
                <Grid item xs={10} sx={{ paddingTop: 20, paddingLeft: 2, paddingRight: 2 }}>
                    <div className={`z-50 fixed inset-0 flex items-center justify-center bg-white/80 ${!visible ? 'hidden' : ''}`}>
                        <Lottie animationData={loading} className="!w-[200px] !h-[200px]" />
                    </div>
                    <div className={`z-50 fixed inset-0 flex items-center justify-center bg-white/80 ${!commonVisible ? 'hidden' : ''}`}>
                        <Lottie animationData={loading1} className="!w-[150px] !h-[150px]" />
                    </div>
                    <BlankLayout systemMode='light'>{children}</BlankLayout>
                </Grid>
                <Grid item xs={1} sx={{ paddingLeft: 2, paddingRight: 2 }}>
                    <ScrollToTop className='mui-fixed'>
                        <Button
                            variant='contained'
                            className='is-10 bs-10 rounded-full p-0 min-is-0 flex items-center justify-center'
                        >
                            <i className='bx-up-arrow-alt' />
                        </Button>
                    </ScrollToTop>
                    <Customizer dir={direction} />

                </Grid>
            </Grid>
        </div>
    )
}

export default Layout
