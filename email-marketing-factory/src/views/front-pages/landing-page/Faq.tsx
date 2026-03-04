import classnames from 'classnames'

import { Accordion, AccordionSummary, Typography, AccordionDetails } from '@mui/material'

import ExpandMoreIcon from '@mui/icons-material/ExpandMore'

import frontCommonStyles from '@views/front-pages/styles.module.css'

const Faq = () => {
  const questionAnswers = [
    {
      question: '/ Who can benefit from Focuz?',
      answer:
        "If you're a brand selling on WooCommerce or Shopify and looking to optimize your email marketing while reallocating your team's time to other crucial tasks, Focuz is the perfect solution for you. By centralizing your email marketing efforts in one platform, Focuz enables you to scale your business and concentrate on what truly matters—delivering exceptional products to your customers."
    },
    {
      question: '/ What’s the cost?',
      answer:
        'Focuz offers flexible pricing plans to meet your needs, starting at $89/month for our Starter Brand package and up to $299/month for our Agency Unlimited plan. Opt for annual billing and enjoy a 25% discount across all plans!'
    },
    {
      question: '/ How do I get started?',
      answer:
        'Joining Focuz is simple. Schedule a demo with one of our founders, where we’ll discuss your specific requirements and give you a comprehensive walkthrough of our platform. We can have you fully set up and running in less than 24 hours!'
    },
    {
      question: '/ Is there a free trial? ',
      answer:
        'While we don’t provide a free trial, we’re confident in Focuz’s ability to meet your expectations. If you decide within the first month that it’s not the right fit, we’ll refund your payment—no questions asked.'
    },
    {
      question: '/ What’s involved in the onboarding process?',
      answer:
        'Our onboarding process is designed to be hassle-free. We’ll take care of the technical setup, including integrating your CRMs and ESP accounts and customizing your assets, fonts, and colors. And the best part? We don’t charge for implementation because your success is our priority.'
    },
    {
      question: '/ Which platforms are supported?',
      answer:
        'Focuz currently integrates seamlessly with Shopify, WooCommerce, Klaviyo and Mailchimp. If you use a different email service provider, we can still support your needs through a straightforward HTML export.'
    },
    {
      question: '/ What if I’m using a different platform? ',
      answer:
        'If your brand sells products online through a different platform, we’d still love to help. Reach out to us, and we’ll explore how Focuz can support your email marketing needs.'
    }
  ]

  return (
    <section id='faq' className='pt-[150px] max-md:pt-[90px]'>
      <div
        className={classnames(
          'flex items-center flex-wrap justify-center pb-8 sm:pb-24',
          frontCommonStyles.layoutSpacing
        )}
      >
        <div className='lg:text-5xl md:text-[40px] sm:text-[37px] text-black text-[25px] font-Geomanist lg:text-start text-center w-full'>
          <p>
            Find the <span className='text-primary'>answers</span> to our
          </p>
          frequently asked questions
        </div>
        <div className='flex flex-col gap-10 max-md:gap-4 pt-[74px] max-md:pt-8'>
          {questionAnswers.map((items, index) => (
            <Accordion
              key={index}
              className={`rounded-[20px] ${index % 2 ? 'bg-[#F4F4F6]' : 'bg-[#DDE3FF]'}`}
              defaultExpanded={false}
            >
              <AccordionSummary
                aria-controls='panel1a-content'
                expandIcon={<ExpandMoreIcon className='text-primary text-3xl' />}
                className='p-[50px] max-md:p-[25px]'
              >
                <Typography className='text-black text-2xl font-Helvetica max-md:text-xl'>{items.question}</Typography>
              </AccordionSummary>
              <AccordionDetails className='px-[50px] pt-[0px] pb-[50px] max-md:px-[25px] max-md:pb-[25px]'>
                <Typography className='text-black text-[16px] font-Helvetica'>{items.answer}</Typography>
              </AccordionDetails>
            </Accordion>
          ))}
        </div>
      </div>
    </section>
  )
}

export default Faq
