import { useEffect, useState } from 'react'

import Grid from '@mui/material/Grid'
import Button from '@mui/material/Button'
import { Avatar, Box, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, ImageList, ImageListItem, ImageListItemBar, List, ListItem, Typography } from '@mui/material'

import DeleteIcon from '@mui/icons-material/Delete';

import { v4 as uuidv4 } from 'uuid';
import { toast } from 'react-toastify'
import { useDropzone } from 'react-dropzone'

import DialogCloseButton from '@/components/dialogs/DialogCloseButton'
import { supabase } from '@/utils/supabase'
import ImageComponent from '@/utils/imageComponent'

type FileProp = {
  name: string
  type: string
  size: number
}

type Props = {
  imageUrls: string[]
  saveChange: (urls: string[]) => void
}

const StepAssets = ({ imageUrls, saveChange }: Props) => {
  const [open, setOpen] = useState<boolean>(false)
  const [images, setImages] = useState<string[]>(imageUrls)
  const [uploadLoading, setUploadLoading] = useState<boolean>(false)
  const [hoverId, setHoverId] = useState<number | null>(null)

  const [files, setFiles] = useState<File[]>([])

  const { getRootProps, getInputProps } = useDropzone({
    maxSize: 2000000,
    accept: {
      'image/*': ['.png', '.jpg', '.jpeg', '.gif']
    },
    onDrop: (acceptedFiles: File[]) => {
      setFiles(prev => [...prev, ...acceptedFiles.map((file: File) => Object.assign(file))])
    },
    onDropRejected: () => {
      toast.error('You can only upload maximum size of 2 MB.', {
        autoClose: 3000
      })
    }
  })

  const renderFilePreview = (file: FileProp) => {
    if (file.type.startsWith('image')) {
      return <img width={38} height={38} alt={file.name} src={URL.createObjectURL(file as any)} />
    } else {
      return <i className='bx-file' />
    }
  }

  const handleRemoveFile = (file: FileProp, index: number) => {
    const uploadedFiles = files
    const filtered = uploadedFiles.filter((i: FileProp, num: number) => num !== index)

    setFiles([...filtered])
  }

  const fileList = files.map((file: FileProp, index: number) => (
    <ListItem key={index.toString()}>
      <div className='file-details h-full'>
        <div className='file-preview'>{renderFilePreview(file)}</div>
        <div>
          <Typography className='file-name w-[90px] overflow-hidden whitespace-nowrap text-ellipsis'>{file.name}</Typography>
          <Typography className='file-size' variant='body2'>
            {Math.round(file.size / 100) / 10 > 1000
              ? `${(Math.round(file.size / 100) / 10000).toFixed(1)} mb`
              : `${(Math.round(file.size / 100) / 10).toFixed(1)} kb`}
          </Typography>
        </div>
      </div>
      <IconButton onClick={() => handleRemoveFile(file, index)}>
        <i className='bx-x text-xl' />
      </IconButton>
    </ListItem>
  ))

  const handleRemoveAllFiles = () => {
    setFiles([])
  }


  useEffect(() => {
    saveChange(images)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [images])

  return (
    <Grid container spacing={6}>
      <Grid item xs={12} className='flex flex-row items-center justify-between mb-3'>
        <Button variant='outlined' sx={{ width: '100px', height: '100px' }} onClick={() => {
          setOpen(true)
          setFiles([])
        }}>
          +Add Images
        </Button>
      </Grid>
      <Grid item xs={12}>
        {images.length < 1 ?
          <Typography variant='h4' className='mbe-2.5'>
            Your assets are empty
          </Typography> :

          <ImageList variant='masonry' gap={10} className='grid grid-cols-6 max-lg:grid-cols-4 max-sm:grid-cols-3 max-h-[500px] overflow-y-auto'>
            {images.map((item, index) => {
              return (
                <ImageListItem key={index}
                  onMouseLeave={() => setHoverId(null)}
                  onMouseEnter={() => setHoverId(index)}
                >
                  <ImageComponent
                    alt={index.toString()}
                    width={100}
                    height={100}
                    src={`${item}?w=100&fit=crop&auto=format`}
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
                          setImages((prev) => prev.filter((_, i) => i !== index));

                          if (!item.includes('https://images.unsplash.com')) {
                            const { error } = await supabase.storage.from('upload').remove([`${item.split('upload/')[1]}`])

                            if (error) {
                              console.error('Error delete file:', error.message)
                            }
                          }
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
      <Dialog
        closeAfterTransition={false}
        open={open}
        keepMounted
        fullWidth
        sx={{ '& .MuiDialog-paper': { overflow: 'visible', height: '90vh' } }}
      >
        <DialogTitle variant='h4' className='flex gap-2 flex-col text-center sm:pbs-6 sm:pli-16'>
          Upload picture for your marketing campaign.
        </DialogTitle>
        <DialogContent>
          <DialogCloseButton onClick={() => setOpen(false)} disableRipple>
            <i className='bx-x' />
          </DialogCloseButton>
          {uploadLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
              <CircularProgress />
            </Box>
          ) : <>
            <div {...getRootProps({ className: 'dropzone' })}>
              <input {...getInputProps()} />
              <div className='flex items-center flex-col'>
                <Avatar variant='rounded' className='bs-12 is-12 mbe-9'>
                  <i className='bx-upload' />
                </Avatar>
                <Typography variant='h5' className='mbe-2.5'>
                  Drop files here or click to upload.
                </Typography>
                <Typography color='text.secondary'>Allowed *.jpeg, *.jpg, *.png, *.gif</Typography>
                <Typography color='text.secondary'>Max size of 2 MB</Typography>
              </div>
            </div>
            <List className='overflow-x-auto grid grid-cols-3 gap-1 max-sm:grid-cols-2'>{fileList}</List></>}
        </DialogContent>
        <DialogActions className='dialog-actions-dense p-4'>
          {files.length ? (
            <>
              <div className='buttons'>
                <Button color='error' variant='outlined' onClick={handleRemoveAllFiles}>
                  Remove All
                </Button>
                <Button variant='contained'
                  className='border hover:bg-primary'
                  onClick={async () => {
                    setUploadLoading(true)

                    const savefiles = files.map(item => {
                      const saveFile = supabase.storage.from('upload').upload(`assets/${uuidv4()}-${item.name.split('.').pop()}`, item)

                      return saveFile;
                    })

                    try {
                      const saveResult = await Promise.all(savefiles);

                      const temp = saveResult.map(result => {
                        if (!result.error) {
                          const { data: uploadFileName } = supabase.storage.from('upload').getPublicUrl(result.data?.path)

                          return uploadFileName.publicUrl
                        }
                        else throw result.error
                      })

                      const fileNames = await Promise.all(temp)

                      setImages([...images, ...fileNames])

                    } catch (error) {
                      toast.error('Oops, there are some issues with the upload.', { autoClose: 5000 })
                    }

                    setUploadLoading(false)
                    setOpen(false)
                  }}
                >Upload Files</Button>
              </div>
            </>
          ) : null}
        </DialogActions>
      </Dialog>
    </Grid >
  )
}

export default StepAssets
