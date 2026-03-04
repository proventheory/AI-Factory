'use client'

import { useEffect, useState } from 'react';


import classnames from 'classnames'

import { Box, List, ListItem, Typography, useTheme } from '@mui/material';

import frontCommonStyles from '@views/front-pages/styles.module.css'


const Tearms = () => {

    const [activeSection, setActiveSection] = useState<string | null>(null);

    const [isClient, setIsClient] = useState(false)

    const theme = useTheme()

    useEffect(() => {
        setIsClient(true)
    }, [])

    const menuItems: { title: string, id: string }[] = [
        { title: "Agreement to Terms", id: "agreement" },
        { title: "Our Services", id: "services" },
        { title: "Eligibility", id: "eligibility" },
        { title: "Subscription Plans", id: "subscripton" },
        { title: "Billing & Payments", id: "billing" },
        { title: "Cancellation & Termination", id: "cancellation" },
        { title: "User Conduct", id: "user" },
        { title: "Intellectual Property", id: "intellectual" },
        { title: "Limitation of Liability' and other tracking technologies", id: "limitation" },
        { title: "Privacy Policy", id: "privacy" },
        { title: "Modifications to These Terms", id: "modification" },
        { title: "Contact Us", id: "contact" },
    ];

    const content: string[] = [
        '<p><span style="font-weight: 400;">By registering, accessing, or using Focuz, you acknowledge that you&rsquo;ve read, understood, and agreed to these terms. If you don&rsquo;t agree, you must discontinue use immediately.</span></p>',
        '<p><span style="font-weight: 400;">Focuz simplifies email marketing for eCommerce businesses and marketing agencies through:</span></p><ul><li style="font-weight: 400;"><strong>AI-driven email design and automation</strong></li><li style="font-weight: 400;"><strong>Seamless integration with top eCommerce platforms and CRMs</strong></li><li style="font-weight: 400;"><strong>Data-driven insights to optimize conversions</strong></li></ul><p><span style="font-weight: 400;">We empower your team to focus on growth, not grunt work.</span></p>',
        '<p><span style="font-weight: 400;">To use Focuz, you must:</span></p><ul><li style="font-weight: 400;"><span style="font-weight: 400;">Be at least 18 years old.</span></li><li style="font-weight: 400;"><span style="font-weight: 400;">Provide accurate account information.</span></li><li style="font-weight: 400;"><span style="font-weight: 400;">Use the platform in compliance with applicable laws and regulations.</span></li></ul>',
        '<p><span style="font-weight: 400;">Focuz offers flexible subscription options tailored to your business needs. Whether you&rsquo;re a small business or a large agency, our plans ensure you get the most out of our AI tools. For custom solutions, </span><strong>contact us</strong><span style="font-weight: 400;">.</span></p>',
        '<p><span style="font-weight: 400;">Payments are securely processed. By subscribing, you authorize us to charge your selected payment method. All fees are non-refundable, except as required by law. Failure to pay may result in service suspension or termination.</span></p>',
        '<p><span style="font-weight: 400;">You can cancel your subscription anytime via your account dashboard. Upon cancellation, you&rsquo;ll retain access until the end of the billing cycle, but no refunds will be issued for the current period.</span></p>',
        '<p><span style="font-weight: 400;">You agree not to:</span></p><ul><li style="font-weight: 400;"><span style="font-weight: 400;">Misuse the platform (e.g., spamming, illegal activities).</span></li><li style="font-weight: 400;"><span style="font-weight: 400;">Share account access or bypass security features.</span></li><li style="font-weight: 400;"><span style="font-weight: 400;">Violate any intellectual property rights.</span></li></ul><p><span style="font-weight: 400;">Focuz reserves the right to terminate accounts for violations.</span></p>',
        '<p><span style="font-weight: 400;">All content, software, and technology provided by Focuz are owned by or licensed to us. You may not copy, distribute, or reverse-engineer any part of the platform without prior written permission.</span></p>',
        '<p><span style="font-weight: 400;">Focuz is provided &ldquo;as is&rdquo; without warranties of any kind. We are not responsible for any:</span></p><ul><li style="font-weight: 400;"><span style="font-weight: 400;">Direct, indirect, or incidental damages.</span></li><li style="font-weight: 400;"><span style="font-weight: 400;">Loss of data or profits.</span></li><li style="font-weight: 400;"><span style="font-weight: 400;">Service interruptions beyond our control.</span></li></ul>',
        '<p><span style="font-weight: 400;">Your privacy is important to us. Please review our </span><strong>Privacy Policy</strong><span style="font-weight: 400;"> to understand how we handle your data.</span></p>',
        '<p><span style="font-weight: 400;">Focuz may update these terms periodically. We&rsquo;ll notify you of significant changes, and your continued use of the platform after changes signifies your acceptance.</span></p>',
        '<p><span style="font-weight: 400;">We&rsquo;re here to help! If you have questions about these terms, reach out:</span></p><p><strong>Email:</strong> <a href="mailto:hello@focuz.ai"><span style="font-weight: 400;">hello@focuz.ai</span></a> <span style="font-weight: 400;"><br /></span><strong>Address:</strong><strong><br /></strong><span style="font-weight: 400;">3531 Griffin Road, Suite #100</span><span style="font-weight: 400;"><br /></span><span style="font-weight: 400;">Fort Lauderdale, FL 33312</span></p>'
    ]

    const handleScrollTo = (id: string) => {
        const element = document.getElementById(id);

        if (element) {
            element.scrollIntoView({ behavior: "smooth" });
            setActiveSection(id);
        }
    };

    return (isClient ? <section style={{ background: 'white' }} >
        <div
            className={classnames(
                'flex items-center flex-wrap justify-center pb-8 sm:pb-24 pt-[130px] max-md:pt-[67px] max-md:pr-0 text-black',
                frontCommonStyles.layoutSpacing
            )}
        >
            <div className='w-full flex flex-col gap-6 pb-[46px] max-md:pr-[24px]'>
                <div
                    className='2xl:text-7xl md:text-6xl sm:text-5xl text-3xl text-black font-Geomanist font-normal lg:tracking-tighter'
                    style={{ WebkitTextStroke: '1px black' }}
                >
                    / Terms of Service
                </div>
                <h1 className=' font-Helvetica max-w-[633px] text-start font-normal'>
                    <strong>Effective Date</strong> :November 14, 2024
                </h1>
                <p className='text-[17px]'>
                    Welcome to <strong>Focuz</strong>, your AI-powered email marketing partner. By accessing or using our services, you agree to the following terms of service. Please read carefully, as these terms outline your rights and responsibilities.
                </p>
            </div>

            <Box sx={{ display: "flex", width: '100vw', [theme.breakpoints.down('md')]: { flexDirection: 'column', alignItems: 'left' } }}>
                <Box
                    sx={{
                        p: 2,
                        bgcolor: "white",
                        top: 0,
                        overflowY: "auto",
                        borderBottom: "1px solid #ddd",
                        [theme.breakpoints.up('md')]: {
                            border: 'none', borderRight: "1px solid #ddd", position: "sticky", width: 250, ml: 0,
                            height: "100vh"
                        },
                    }}
                >
                    <Typography sx={{ mb: 2, py: 5, [theme.breakpoints.down('md')]: { p: 0, mb: 1 } }} className='font-bold text-black text-[16px]'>
                        Table of Contents
                    </Typography>
                    <List>
                        {menuItems.map((item) => (
                            <ListItem key={item.id} disablePadding>
                                <Typography
                                    sx={{ color: 'black', fontSize: '16px', pl: 2, py: 2 }}
                                    className={`hover:underline hover:cursor-pointer ${activeSection == item.id ? 'underline' : ''}`}
                                    onClick={() => handleScrollTo(item.id)}
                                >{item.title}</Typography>
                            </ListItem>
                        ))}
                    </List>
                </Box>
                <Box sx={{ flex: 1, mt: 3, py: 5, mx: 5 }}>
                    {content.map((item, index: number) => (
                        <div
                            id={menuItems[index].id}
                            key={menuItems[index].id}
                            className='mb-10 scroll-mt-[64px]'
                        >
                            <Typography variant="h4" className='font-bold text-black' gutterBottom>
                                {menuItems[index].title}
                            </Typography>
                            <Typography paragraph className='text-black text-[18px]'>
                                <span dangerouslySetInnerHTML={{ __html: item }} />
                            </Typography>
                        </div>
                    ))}
                </Box>
            </Box>
        </div>
    </section > : <></>)
}

export default Tearms


