import { useCallback, useEffect, useRef, useState } from "react";

import { Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, ImageList, ImageListItem, Tab, Typography } from "@mui/material";

import Lottie from "lottie-react";

import TabContext from "@mui/lab/TabContext";

import TabList from "@mui/lab/TabList";

import TabPanel from "@mui/lab/TabPanel";

import loadingData from '@/utils/loading1.json'

import DialogCloseButton from "@/components/dialogs/DialogCloseButton";
import { supabase } from "@/utils/supabase";

import CustomTextField from "@/@core/components/mui/TextField";
import { rearrangeOjbect } from "@/utils/math";
import { getSession } from "@/utils/queries";
import ImageComponent from "@/utils/imageComponent";
import type { ImageTypes } from './ProductAdd';

type Props = {
    open: boolean;
    setOpen: (open: boolean) => void;
    setProducts: (imageUrls: ImageTypes[]) => void
    pathName: string
};

const NewsletterDlg = ({ open, setOpen, setProducts, pathName }: Props) => {
    const [data, setData] = useState<string[]>([])
    const [selectData, setSelectData] = useState<ImageTypes[]>([])
    const [loading, setLoading] = useState<boolean>(false)
    const [tabIndex, setTabIndex] = useState<string>('1')
    const [hasMore, setHasMore] = useState(true);
    const observer = useRef<IntersectionObserver | null>(null);
    const [query, setQuery] = useState({ type: 'image', page: 1, limit: 20, search: '' });
    const [uImages, setUImages] = useState<{ url: string, id: string, title: string }[]>([])
    const [uLoading, setULoading] = useState<boolean>(false)
    const [select, setSelect] = useState<string[]>([])

    const lastImageRef = useCallback(
        (node: HTMLDivElement | null) => {
            if (loading) return;
            if (observer.current) observer.current.disconnect();

            observer.current = new IntersectionObserver((entries) => {
                if (entries[0].isIntersecting && hasMore) {
                    setQuery((prevQuery) => ({ ...prevQuery, page: prevQuery.page + 1 }));
                }
            });

            if (node) observer.current.observe(node);
        },
        [loading, hasMore]
    );

    const fetchImages = useCallback(async () => {
        try {
            const response = await fetch('/api/unsplash', {
                method: 'POST',
                body: JSON.stringify(query),
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const { data } = await response.json();

            const temp = query.search ? data.results : data

            const urls = temp.map((ele: any) => {
                if (!uImages.some(uImage => uImage?.id == ele.id)) {
                    return { url: ele.urls.small, id: ele.id, title: ele.alt_description }
                }
            });

            return urls;
        } catch (error) {
            console.error('Error fetching images:', error);

            return [];
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [query])

    useEffect(() => {
        if (open) {
            setUImages([])
            setSelectData([])
            setSelect([])
            setQuery({ type: 'image', page: 1, limit: 20, search: '' })
        }
    }, [open])

    useEffect(() => {
        const loadImages = async () => {
            setULoading(true);
            const newImages = await fetchImages();

            if (query.page == 1) setUImages(newImages)
            else {
                setUImages((prevImages) => rearrangeOjbect([...prevImages, ...newImages]));
            }

            setULoading(false);

            if (newImages.length === 0) {
                setHasMore(false);
            }
        };

        loadImages();
    }, [fetchImages, query.page]);

    const tabHandleChange = (event: React.SyntheticEvent, newValue: string) => { setTabIndex(newValue) }

    useEffect(() => {

        const getPictureList = async () => {
            try {
                setLoading(true)

                const [session] = await Promise.all([getSession(pathName)])

                const { data, error } = await supabase.from('profiles_brand').select('data').eq('user_id', session?.user.id).eq('is_default', true).single()

                if (error) throw error
                const urls: string[] = data.data?.imageUrls.map((ele: string) => { return ele })

                setData(urls)
                setLoading(false)

            } catch (error) {
                setLoading(false)

                console.error('Error fetching product list:', error)
            }
        }

        if (open)
            getPictureList()
    }, [open, pathName])

    return <>
        <Dialog
            closeAfterTransition={false}
            open={open}
            keepMounted
            sx={{ '& .MuiDialog-paper': { overflow: 'visible', height: '90vh', width: '80vw' } }}
        >
            <DialogTitle variant='h4' className='flex gap-2 flex-col text-center sm:pbs-16 sm:pbe-6 sm:pli-16'>
                Choose a Picture for Your Marketing Campaign.
            </DialogTitle>
            <DialogContent>
                <DialogCloseButton onClick={() => setOpen(false)} disableRipple>
                    <i className='bx-x' />
                </DialogCloseButton>

                <TabContext value={tabIndex}>
                    <TabList onChange={tabHandleChange} aria-label='icon tabs'>
                        <Tab value='1' label='Assets' />
                        <Tab value='2' label='Browse Stock Photos' />
                    </TabList>
                    <TabPanel value='1'>
                        {!loading && (data.length > 0 ?
                            <div className='w-full h-full flex flex-col gap-4 pt-0 mt-2'>
                                <ImageList variant="masonry" cols={3} gap={5}>
                                    {data.map((item, index: number) => (
                                        <ImageListItem
                                            key={index}
                                            onClick={() => {
                                                if (!selectData.some(select => select.title == index.toString()))
                                                    setSelectData([...selectData, { title: index.toString(), src: item, productUrl: '' }])
                                                else setSelectData(selectData.filter(ele => ele.title != index.toString()))
                                            }}
                                            className={`flex flex-col justify-between gap-0 rounded`}>
                                            <ImageComponent
                                                alt={item}
                                                className={`w-full h-auto p-1 border-2 ${selectData.some(select => select.title == index.toString()) ? 'border-primary' : 'border-transparent'}`}
                                                width={200}
                                                height={100}
                                                src={item}
                                            />
                                        </ImageListItem>
                                    ))}
                                </ImageList>
                            </div> : <div className="w-full h-full text-center flex flex-col justify-center">
                                <Typography variant='h5' className='mbe-2.5'>
                                    Your assets are empty
                                </Typography>
                            </div>)
                        }
                        {
                            loading && <div className={`flex w-full h-full items-center justify-center bg-white/80`}>
                                <Lottie animationData={loadingData} className="!w-[200px] !h-[200px]" />
                            </div>
                        }
                    </TabPanel>
                    <TabPanel value="2">
                        <CustomTextField
                            className="w-full px-1 mb-2"
                            placeholder="🔍 Search free high-resolution photos form Unsplash"
                            value={query.search}
                            onChange={(e) => {
                                setHasMore(true)
                                if (!e.target.value) setUImages([])
                                setQuery((prevQuery) => ({ ...prevQuery, page: 1, search: e.target.value }));
                            }}
                        />
                        {
                            !(uLoading && query.page == 1) && (uImages.length > 0 ?
                                <ImageList variant="masonry" cols={2} gap={10}>
                                    {uImages.map((item, index) => (
                                        <div
                                            ref={uImages.length === index + 1 ? lastImageRef : null}
                                            key={index}
                                            onClick={() => {
                                                if (select.includes(item.id)) {
                                                    setSelect(select.filter((id) => id !== item.id));
                                                } else {
                                                    setSelect([...select, item.id]);
                                                }
                                            }}
                                        >
                                            <ImageListItem
                                                className={
                                                    select.includes(item?.id) ? "border-primary border-2 p-1" : "p-1"
                                                }>
                                                {item?.url &&
                                                    <ImageComponent
                                                        alt={item?.id}
                                                        width={200}
                                                        height={200}
                                                        src={`${item?.url}`}
                                                    />
                                                }
                                            </ImageListItem>
                                        </div>
                                    ))}
                                </ImageList>
                                : <Typography variant="h6" className="p-5 text-center">
                                    No images found. Check your spelling, or search for something else
                                    (&quot;funny cat&quot; is always a winner).
                                </Typography>)
                        }

                        {uLoading &&
                            (<Box sx={{ display: "flex", justifyContent: "center", mt: 2 }}>
                                <CircularProgress />
                            </Box>)}

                    </TabPanel>
                </TabContext>


            </DialogContent>
            <DialogActions className='dialog-actions-dense p-4'>
                <Button className='border hover:bg-primary' variant='outlined' onClick={() => {
                    observer.current = null
                    setProducts([...selectData, ...uImages.filter(item => { if (item?.id) return select.includes(item.id) }).map(ele => { return { src: ele.url, title: ele.title, productUrl: '' } })])
                    setOpen(false);

                }}>Confirm</Button>
            </DialogActions>
        </Dialog>
    </>
};

export default NewsletterDlg;