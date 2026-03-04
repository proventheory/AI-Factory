'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, ImageList, ImageListItem, Tab, Typography } from "@mui/material"

import { toast } from 'react-toastify'

import TabContext from '@mui/lab/TabContext'

import TabList from '@mui/lab/TabList'

import TabPanel from '@mui/lab/TabPanel'

import DialogCloseButton from '@/components/dialogs/DialogCloseButton'

import { supabase } from '@/utils/supabase'
import ImageComponent from '@/utils/imageComponent'
import { getSession } from '@/utils/queries'
import { rearrangeOjbect } from '@/utils/math'
import CustomTextField from '@/@core/components/mui/TextField'
import type { ImageTypes } from './ProductAdd'

type props = {
  open: boolean
  setOpen: (open: boolean) => void
  setProducts: (product: { title: string; src: string, productUrl: string }[]) => void
  pathName: string
}

const ProductDlg = ({ open, setOpen, setProducts, pathName }: props) => {

  const [selectData, setSelectData] = useState<ImageTypes[]>([])

  const [select, setSelect] = useState<string[]>([])

  const [tabIndex, setTabIndex] = useState<string>('1')

  const [hasMore, setHasMore] = useState(true);
  const observer = useRef<IntersectionObserver | null>(null);
  const [query, setQuery] = useState({ type: 'image', page: 1, limit: 20, search: '' });
  const [uLoading, setULoading] = useState<boolean>(false)
  const [uImages, setUImages] = useState<{ url: string, id: string, title: string }[]>([])

  const [sHasMore, setSHasMore] = useState(true)
  const sObserver = useRef<IntersectionObserver | null>(null);
  const [sQuery, setSQuery] = useState({ page: 1, limit: 20 });
  const [sLoading, setSLoading] = useState<boolean>(false)
  const [data, setData] = useState<ImageTypes[]>([])

  const [sitemap, steSitemap] = useState<any>()

  const lastImageRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (observer.current) observer.current.disconnect();

      observer.current = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && hasMore) {
          setQuery((prevQuery) => ({ ...prevQuery, page: prevQuery.page + 1 }));
        }
      });

      if (node) observer.current.observe(node);
    },
    [hasMore]
  );

  const sLastImageRef = useCallback(
    (node: HTMLDivElement | null) => {

      if (sObserver.current) sObserver.current.disconnect();

      sObserver.current = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && sHasMore) {
          setSQuery((prevQuery) => ({ ...prevQuery, page: prevQuery.page + 1 }));
        }
      });

      if (node) sObserver.current.observe(node);
    },
    [sHasMore]
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
      setData([])
      setUImages([])
      setSelectData([])
      setSelect([])
      setSQuery({ page: 1, limit: 16 })
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

  useEffect(() => {
    const loadImages = async () => {
      setSLoading(true);

      try {
        if (open) {
          let urlResponse

          if (data.length < 1) {
            const [session] = await Promise.all([getSession(pathName)])

            urlResponse = await supabase.from('profiles_brand').select('data').eq('user_id', session?.user.id).eq('is_default', true).single()
            steSitemap(urlResponse.data?.data.sitemap)
          }

          const res = await fetch('/api/campaigns', {
            method: 'POST',
            body: JSON.stringify({
              sitemap: sitemap || (urlResponse ? urlResponse.data?.data.sitemap : ''), page: sQuery.page, limit: sQuery.limit
            }),
            headers: {
              'Content-Type': 'application/json'
            }
          })

          const response = await res.json()

          if (!response.data && response.data.length == 0)
            setSHasMore(false);
          if (sQuery.page == 1)
            setData(response.data ? response.data : [])
          else setData(data.concat(response.data))
        }
      } catch (errr) {
        setSHasMore(false);

        if (data.length < 1) {
          toast.error('Invalid sitemap. Please check the URL and try again.', { autoClose: 5000, type: 'warning' })
        }
      }

      setSLoading(false);
    };

    loadImages();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sQuery])

  const tabHandleChange = (event: React.SyntheticEvent, newValue: string) => { setTabIndex(newValue) }

  return <>
    <Dialog
      closeAfterTransition={false}
      open={open}
      keepMounted
      sx={{ '& .MuiDialog-paper': { overflow: 'visible', height: '90vh', width: '80vw' } }}
    >
      <DialogTitle variant='h4' className='flex gap-2 flex-col text-center sm:pbs-16 sm:pbe-6 sm:pli-16'>
        Choose a Product for Your Marketing Campaign.
      </DialogTitle>
      <DialogContent>
        <DialogCloseButton onClick={() => setOpen(false)} disableRipple>
          <i className='bx-x' />
        </DialogCloseButton>

        <TabContext value={tabIndex}>
          <TabList onChange={tabHandleChange} aria-label='icon tabs'>
            <Tab value='1' label='products' />
            <Tab value='2' label='Browse Stock Photos' />
          </TabList>
          <TabPanel value='1'>
            {!(sLoading && sQuery.page == 1) && (data.length > 0 ?
              <div className='w-full h-full flex flex-col gap-4 pt-0 mt-2'>
                <div className='grid grid-cols-4 gap-7 max-md:gap-5 max-sm:grid-cols-3'>
                  {data.map((item, index: number) => (
                    item.title && item.src ? <div
                      ref={data.length === index + 1 ? sLastImageRef : null}
                      key={`${item.src}-${index}`}
                      onClick={() => {
                        if (!selectData.some(select => select.title == index.toString()))
                          setSelectData([...selectData, { title: index.toString(), src: item.src, productUrl: item.productUrl }])
                        else setSelectData(selectData.filter(ele => ele.title != index.toString()))
                      }}
                      className={`flex flex-col justify-between gap-0 rounded ${selectData.some(select => select.title == index.toString()) ? 'border-primary border-2' : ''}`}>
                      <ImageComponent
                        className='w-full h-auto'
                        width={100}
                        height={100}
                        src={item.src}
                        alt={index.toString()}
                      />
                      <p className='text-center text-primary overflow-clip'>{item.title}</p>
                    </div> : <></>
                  ))}
                </div>
              </div> : <div className='w-full h-full text-center flex justify-center pt-5'>
                <h3>There is no image. please confirm sitemap url or <strong className='text-red-500'>change the type</strong></h3>
              </div>)}
            {sLoading &&
              (<Box sx={{ display: "flex", justifyContent: "center", mt: 2 }}>
                <CircularProgress />
              </Box>)}
          </TabPanel>
          <TabPanel value='2'>
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
                      key={`${item?.url}-${index}`}
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
          setSelectData([])
          setProducts([...selectData, ...uImages.filter(item => { if (item?.id) return select.includes(item.id) }).map(ele => { return { src: ele.url, title: ele.title, productUrl: '' } })])
          setOpen(false);

        }}>Confirm</Button>
      </DialogActions>
    </Dialog>
  </>
}

export default ProductDlg