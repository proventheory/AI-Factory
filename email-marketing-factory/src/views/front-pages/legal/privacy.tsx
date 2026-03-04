'use client'

import { useEffect, useState } from 'react';


import classnames from 'classnames'

import { Box, List, ListItem, Typography, useTheme } from '@mui/material';

import frontCommonStyles from '@views/front-pages/styles.module.css'


const Privacy = () => {

    const [activeSection, setActiveSection] = useState<string | null>(null);

    const [isClient, setIsClient] = useState(false)

    const theme = useTheme()

    useEffect(() => {
        setIsClient(true)
    }, [])

    const menuItems: { title: string, id: string }[] = [
        { title: "Information We Collect", id: "collect" },
        { title: "How We Use Your Information", id: "infomation" },
        { title: "How We Share Your Information", id: "share" },
        { title: "Cookies and Tracking Technologies", id: "cookies" },
        { title: "Your Rights and Choices", id: "choices" },
        { title: "Data Security", id: "security" },
        { title: "Data Retention", id: "retention" },
        { title: "Third-Party Links", id: "third-party" },
        { title: "International Data Transfers", id: "international" },
        { title: "Children’s Privacy", id: "children" },
        { title: "Changes to This Privacy Policy", id: "change" },
        { title: "Contact Us", id: "contact" },
    ];

    const content: string[] = [
        '<p><span style="font-weight: 400;">We collect the following types of information to provide and improve our services:</span></p><h4><strong>a. Information You Provide to Us</strong></h4><ul><li style="font-weight: 400;"><strong>Account Information</strong><span style="font-weight: 400;">: Name, email     address, and billing details.</span></li><li style="font-weight: 400;"><strong>Communication Data</strong><span style="font-weight: 400;">: Information     shared when contacting us for support or inquiries.</span></li></ul><h4><strong>b. Automatically Collected Information</strong></h4><ul><li style="font-weight: 400;"><strong>Usage Data</strong><span style="font-weight: 400;">: IP address, browser type,     device information, and pages visited.</span></li><li style="font-weight: 400;"><strong>Cookies and Tracking Technologies</strong><span style="font-weight: 400;">:     Used to enhance your experience and gather analytics.</span></li></ul><h4><strong>c. Third-Party Data</strong></h4><ul><li style="font-weight: 400;"><span style="font-weight: 400;">Information from integrated platforms (e.g., Shopify,     Mailchimp) that you connect to Focuz.</span></li></ul>',
        '<p><span style="font-weight: 400;">We use your information to:</span></p><ul><li style="font-weight: 400;"><span style="font-weight: 400;">Provide and improve our services.</span></li><li style="font-weight: 400;"><span style="font-weight: 400;">Personalize your experience on our platform.</span></li><li style="font-weight: 400;"><span style="font-weight: 400;">Communicate with you about your account, updates, and marketing offers.</span></li><li style="font-weight: 400;"><span style="font-weight: 400;">Process payments and manage subscriptions.</span></li><li style="font-weight: 400;"><span style="font-weight: 400;">Ensure security and prevent fraud.</span></li></ul>',
        '<p><span style="font-weight: 400;">We do not sell your personal information. However, we may share your data with:</span></p><ul><li style="font-weight: 400;"><strong>Service Providers</strong><span style="font-weight: 400;">: Third-party companies that help us operate our platform (e.g., payment processors, analytics providers).</span></li><li style="font-weight: 400;"><strong>Legal Obligations</strong><span style="font-weight: 400;">: When required by law or to protect our rights.</span></li></ul><p><strong>Business Transfers</strong><span style="font-weight: 400;">: In the event of a merger, acquisition, or sale of assets.</span></p>',
        '<p><span style="font-weight: 400;">Focuz uses cookies to:</span></p><ul><li style="font-weight: 400;"><span style="font-weight: 400;">Recognize you when you return to our platform.</span></li><li style="font-weight: 400;"><span style="font-weight: 400;">Analyze usage patterns for better functionality.</span></li><li style="font-weight: 400;"><span style="font-weight: 400;">Deliver targeted marketing.</span></li></ul><p><span style="font-weight: 400;">You can control cookies through your browser settings, but disabling them may affect your experience.</span></p>',
        '<p><span style="font-weight: 400;">Depending on your location, you may have the following rights:</span></p><ul><li style="font-weight: 400;"><strong>Access and Update</strong><span style="font-weight: 400;">: Request access to your data or correct inaccuracies.</span></li><li style="font-weight: 400;"><strong>Deletion</strong><span style="font-weight: 400;">: Request deletion of your personal information.</span></li><li style="font-weight: 400;"><strong>Opt-Out</strong><span style="font-weight: 400;">: Unsubscribe from marketing communications.</span></li></ul><p><span style="font-weight: 400;">To exercise these rights, contact us at hello@focuz.ai.</span></p>',
        '<p><span style="font-weight: 400;">We implement industry-standard security measures to protect your personal information. However, no system is completely secure. You are responsible for maintaining the confidentiality of your login credentials.</span></p>',
        '<p><span style="font-weight: 400;">We retain your personal information for as long as necessary to provide our services, comply with legal obligations, and resolve disputes.</span></p>',
        '<p><span style="font-weight: 400;">Our platform may contain links to third-party websites. We are not responsible for the privacy practices or content of these sites.</span></p>',
        '<p><span style="font-weight: 400;">If you are accessing Focuz from outside the United States, please note that your data may be transferred to and processed in the U.S. By using our platform, you consent to this transfer.</span></p>',
        '<p><span style="font-weight: 400;">Focuz is not intended for use by individuals under the age of 18. We do not knowingly collect personal information from minors.</span></p>',
        '<p><span style="font-weight: 400;">We may update this Privacy Policy from time to time. Changes will be posted on this page, and your continued use of the platform signifies your acceptance of the updated policy.</span></p>',
        '<p><span style="font-weight: 400;">For questions or concerns about this Privacy Policy, please contact us:</span></p><p><strong>Email:</strong><span style="font-weight: 400;"> hello@focuz.ai</span><span style="font-weight: 400;"><br /></span><strong>Address:</strong><strong><br /></strong><span style="font-weight: 400;">3531 Griffin Road, Suite #100</span><span style="font-weight: 400;"><br /></span><span style="font-weight: 400;">Fort Lauderdale, FL 33312</span></p>'
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
                    / Privacy Policy
                </div>
                <h1 className=' font-Helvetica max-w-[633px] text-start font-normal'>
                    <strong>Effective Date</strong> :November 14, 2024
                </h1>
                <p className='text-[17px]'>
                    <strong>Focuz</strong> values your privacy and is committed to protecting your personal data. This Privacy Policy explains how we collect, use, and safeguard your information when you use our platform. By accessing or using Focuz, you agree to the terms outlined below.
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

export default Privacy


