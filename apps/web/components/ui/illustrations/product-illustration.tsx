import { cn } from '@workspace/ui/lib/utils'
import { Vercel } from '@/components/ui/svgs/vercel'
import { Linear } from '@/components/ui/svgs/linear'
import { Slack } from '@/components/ui/svgs/slack'
import { Twilio } from '@/components/ui/svgs/twilio'
import { Supabase } from '@/components/ui/svgs/supabase'
import { Gemini } from '@/components/ui/svgs/gemini'
import { OpenAI } from '@/components/ui/svgs/open-ai'
import { ArrowUp } from 'lucide-react'

const customers = [
    {
        id: 1,
        name: 'Vercel',
        logo: <Vercel className="size-3.5" />,
        date: '10/31/2023',
        nextBilling: '11/30/2027',
        revenue: '$4,356,625.99',
        mrr: '$1360',
        arr: '$13,600',
    },
    {
        id: 2,
        name: 'Linear',
        logo: <Linear className="size-3.5" />,
        date: '03/15/2024',
        nextBilling: '03/15/2025',
        revenue: '$892,450.00',
        mrr: '$2,450',
        arr: '$29,400',
    },
    {
        id: 3,
        name: 'Slack',
        logo: <Slack className="size-3.5" />,
        date: '07/22/2023',
        nextBilling: '07/22/2026',
        revenue: '$1,245,890.50',
        mrr: '$3,200',
        arr: '$38,400',
    },
    {
        id: 4,
        name: 'Twilio',
        logo: <Twilio className="size-3.5" />,
        date: '01/08/2024',
        nextBilling: '01/08/2025',
        revenue: '$567,320.75',
        mrr: '$890',
        arr: '$10,680',
    },
    {
        id: 5,
        name: 'Supabase',
        logo: <Supabase className="size-3.5" />,
        date: '05/12/2024',
        nextBilling: '05/12/2025',
        revenue: '$345,678.90',
        mrr: '$1,200',
        arr: '$14,400',
    },
    {
        id: 6,
        name: 'Gemini',
        logo: <Gemini className="size-3.5" />,
        date: '09/05/2023',
        nextBilling: '09/05/2026',
        revenue: '$789,456.78',
        mrr: '$1,800',
        arr: '$21,600',
    },
]

export const ProductIllustration = ({ className }: { className?: string }) => {
    return (
        <div className="relative h-fit">
            <div className="relative mx-auto max-w-6xl px-6 lg:px-12">
                <div className="flex min-h-96 items-center">
                    <div className={cn('bg-illustration/90 ring-border-illustration shadow-black/6.5 from-card/50 relative mx-auto w-full max-w-5xl rounded-2xl border border-transparent p-6 pb-12 shadow-md ring-1', className)}>
                        <div className="max-w-2xs absolute inset-x-0 bottom-4 z-10 mx-auto">
                            <div className="hue-rotate-300 bg-linear-to-r/increasing absolute inset-0 rounded-full from-emerald-400 via-teal-400 to-purple-400 opacity-25 blur"></div>

                            <div className="shadow-black/6.5 ring-border-illustration bg-illustration relative flex items-center gap-2 rounded-full p-1 shadow-md ring-1">
                                <div className="bg-illustration ring-border-illustration flex size-6 shrink-0 rounded-full shadow-xl ring-1 *:m-auto">
                                    <OpenAI className="size-3.5" />
                                </div>
                                <div className="line-clamp-1 text-[13px]">
                                    Total revenue of <span className="text-foreground font-medium">${customers.reduce((sum, c) => sum + parseFloat(c.revenue.replace(/[$,]/g, '')), 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span> and combined ARR of <span className="text-foreground font-medium">${customers.reduce((sum, c) => sum + parseFloat(c.arr.replace(/[$,]/g, '')), 0).toLocaleString('en-US')}</span>.
                                </div>
                                <ArrowUp className="mr-2 size-3 shrink-0 opacity-65" />
                            </div>
                        </div>
                        <div className="mb-4">
                            <div className="font-medium">Customers</div>
                            <p className="text-muted-foreground mt-0.5 line-clamp-1 text-sm">New users by First user primary channel group (Default Channel Group)</p>
                        </div>
                        <div className="mask-b-from-55%">
                            <table
                                className="w-max table-auto border-collapse lg:w-full"
                                data-rounded="medium">
                                <thead className="dark:bg-background bg-foreground/5">
                                    <tr className="*:border *:px-3 *:py-1.5 *:text-left *:text-sm *:font-medium">
                                        <th>Customer</th>
                                        <th>Date</th>
                                        <th>Revenue</th>
                                        <th>ARR</th>
                                        <th>MRR</th>
                                        <th className="rounded-tr">Next Billing</th>
                                    </tr>
                                </thead>
                                <tbody className="text-sm">
                                    {customers.map((customer) => (
                                        <tr
                                            key={customer.id}
                                            className="text-foreground/75 *:border *:p-2 *:px-3">
                                            <td>
                                                <div className="text-title flex items-center gap-2">
                                                    {customer.logo}
                                                    <span className="text-foreground">{customer.name}</span>
                                                </div>
                                            </td>
                                            <td>{customer.date}</td>
                                            <td>{customer.revenue}</td>
                                            <td>{customer.arr}</td>
                                            <td>{customer.mrr}</td>
                                            <td>{customer.nextBilling}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}