import { Button, Card, CardContent } from "@mui/material"

import { GoCpu, GoZap } from "react-icons/go";

import { MdOutlineMarkEmailUnread } from "react-icons/md";

export default function Page() {

    return (
        <div className={`min-h-screen bg-slate-950 text-white`}>
            <main className="container mx-auto px-4 py-16 text-center max-w-[1200px]">
                <h1 className="mb-6 text-5xl font-bold tracking-tight md:text-6xl lg:text-7xl">
                    <span className="bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
                        AI-Powered Email Marketing
                    </span>
                </h1>
                <p className="mx-auto mb-12 max-w-2xl text-lg text-slate-400 md:text-xl">
                    Revolutionize your email campaigns with cutting-edge artificial intelligence. Boost engagement, increase
                    conversions, and save time.
                </p>
                <Button size="large" className="bg-blue-500 px-8 py-6 text-lg hover:bg-blue-600 text-white" href="/demo/campaigns">
                    Start Your Free Demo
                </Button>

                <div className="mt-24 grid gap-8 md:grid-cols-3">
                    <FeatureCard
                        icon={<GoCpu className="h-8 w-8 text-blue-400" />}
                        title="AI-Driven Insights"
                        description="Leverage machine learning to understand your audience and optimize your campaigns."
                    />
                    <FeatureCard
                        icon={<MdOutlineMarkEmailUnread className="h-8 w-8 text-blue-400" />}
                        title="Smart Content Generation"
                        description="Create compelling email content with AI-powered suggestions and auto-completion."
                    />
                    <FeatureCard
                        icon={<GoZap className="h-8 w-8 text-blue-400" />}
                        title="Automated Optimization"
                        description="Automatically improve send times, subject lines, and content for maximum impact."
                    />
                </div>
            </main>
        </div>
    )
}

function FeatureCard({
    icon,
    title,
    description,
}: {
    icon: React.ReactNode
    title: string
    description: string
}) {
    return (
        <Card className="border-slate-800 bg-slate-900/50 backdrop-blur">
            <CardContent className="flex flex-col items-center p-6 text-center">
                <div className="mb-4 rounded-full bg-slate-800/50 p-3">{icon}</div>
                <h2 className="mb-2 text-xl font-semibold text-white">{title}</h2>
                <p className="text-slate-400">{description}</p>
            </CardContent>
        </Card>
    )
}

