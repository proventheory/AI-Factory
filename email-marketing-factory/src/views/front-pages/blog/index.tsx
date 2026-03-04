import Image from 'next/image'

import classnames from 'classnames'

import { Card, CardContent } from '@mui/material'

import frontCommonStyles from '@views/front-pages/styles.module.css'

const Blog = () => {
  return (
    <section id='blog'>
      <div
        className={classnames(
          'flex items-center flex-wrap justify-center pb-8 sm:pb-24 pt-[130px] max-md:pt-[67px]',
          frontCommonStyles.layoutSpacing
        )}
      >
        <div className='w-full flex flex-col gap-6 pb-[79px] max-md:pr-[24px]'>
          <div
            className='2xl:text-7xl md:text-6xl sm:text-5xl text-3xl text-black font-Geomanist font-normal lg:tracking-tighter'
            style={{ WebkitTextStroke: '1px black' }}
          >
            / Discover our latest
            <br />
            research
          </div>
          <h1 className='text-black font-Helvetica max-w-[633px] text-start font-normal'>
            Stay connected with Focuz through our blog, where we keep you informed with the latest news, research, and
            developments on our current and upcoming products. Discover how we&apos;re revolutionizing marketing with
            innovative AI solutions and stay ahead of the curve with insights that shape the future of AI-driven
            marketing.
          </h1>
        </div>

        <div className='w-full'>
          <div className='grid grid-cols-1 lg:grid-cols-3 gap-16'>
            <Card className='lg:col-span-2 pb-0 bg-[#F4F4F6] rounded-[32px]'>
              <Image
                src='/images/front-pages/blog/1.svg'
                alt='RAG vs LLMs'
                width={1200}
                height={800}
                className='w-full h-auto rounded-t-[32px]'
              />
              <p className='text-[48px] text-black font-Geomanist px-[50px] py-[30px]'>
                RAG vs LLMs: Comparing Retrieval-Augmented Generation and Large Language Models
              </p>
            </Card>

            <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-4 h-auto'>
              <Card className='bg-[#F4F4F6] rounded-[32px] grid grid-rows-3'>
                <Image
                  src='/images/front-pages/blog/2.svg'
                  alt='How Temperature Settings Influence Creativity'
                  width={600}
                  height={400}
                  className='w-full h-full row-span-2'
                />
                <p className='text-[18px] text-black font-Geomanist px-[50px] py-[30px]'>
                  How Temperature Settings Influence Creativity in AI: Balancing Precision and Imagination
                </p>
              </Card>
              <Card className='bg-[#F4F4F6] rounded-[32px] grid grid-rows-3'>
                <Image
                  src='/images/front-pages/blog/3.svg'
                  alt='Mastering Architecture'
                  width={600}
                  height={400}
                  className='w-full h-full row-span-2'
                />
                <CardContent>
                  <p className='text-[18px] text-black font-Geomanist px-[50px] py-[30px]'>
                    Mastering Architecture: Teaching AI the Theory Behind Impeccable Creative Output
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

export default Blog
