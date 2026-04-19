'use client'
import { BarChart, Bar, CartesianGrid, XAxis } from 'recharts'
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'

const chartConfig = {
    desktop: {
        label: 'Desktop',
        color: '#2563eb',
    },
    mobile: {
        label: 'Mobile',
        color: '#60a5fa',
    },
    tablet: {
        label: 'Tablet',
        color: '#9333ea',
    },
} satisfies ChartConfig

const chartData = [
    { month: 'May', desktop: 156, mobile: 224, tablet: 180 },
    { month: 'June', desktop: 156, mobile: 800, tablet: 190 },
    { month: 'January', desktop: 126, mobile: 252, tablet: 175 },
    { month: 'February', desktop: 205, mobile: 410, tablet: 300 },
    { month: 'March', desktop: 200, mobile: 126, tablet: 150 },
    { month: 'April', desktop: 400, mobile: 800, tablet: 450 },
]

export const MonitoringBarChart = () => {
    return (
        <div
            aria-hidden
            className="bg-illustration ring-border-illustration shadow-black/6.5 overflow-hidden rounded-2xl border border-transparent p-8 shadow-md ring-1">
            <div>
                <h3 className="text-foreground mb-1 font-semibold">Monitoring</h3>
                <p className="text-muted-foreground text-sm">January - June 2024</p>
            </div>
            <div className="mt-6 *:!mb-0 *:h-40">
                <ChartContainer
                    className="-mb-12 aspect-auto h-60"
                    config={chartConfig}>
                    <BarChart
                        accessibilityLayer
                        data={chartData}
                        margin={{
                            left: 0,
                            right: 0,
                        }}>
                        <CartesianGrid vertical={false} />
                        <ChartTooltip
                            active
                            cursor={false}
                            content={<ChartTooltipContent className="dark:bg-muted" />}
                        />
                        <XAxis
                            tickLine={false}
                            tickMargin={10}
                            stroke="transparent"
                        />
                        <Bar
                            radius={4}
                            dataKey="mobile"
                            fill="var(--color-emerald-400)"
                        />
                        <Bar
                            radius={4}
                            dataKey="desktop"
                            fill="var(--color-indigo-500)"
                        />
                    </BarChart>
                </ChartContainer>
            </div>
        </div>
    )
}