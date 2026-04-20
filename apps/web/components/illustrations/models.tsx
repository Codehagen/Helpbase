import { Gemini } from '@/components/ui/svgs/gemini'
import { PerplexityAi } from '@/components/ui/svgs/perplexity-ai'
import { MistralAi } from '@/components/ui/svgs/mistral-ai'
import { Openai } from '@/components/ui/svgs/openai'
import { Deepseek } from '@/components/ui/svgs/deepseek'
import { QwenLight as Qwen } from '@/components/ui/svgs/qwen'
import { Cohere } from '@/components/ui/svgs/cohere'
import { Play } from 'lucide-react'

type model = {
    name: string
    icon: React.ReactNode
}

export const ModelsIllustration = () => {
    const upModels: model[] = [
        { name: 'Gemini', icon: <Gemini /> },
        { name: 'Perplexity', icon: <PerplexityAi /> },
        { name: 'Deepseek', icon: <Deepseek /> },
    ]

    const bottomModels: model[] = [
        { name: 'Cohere AI', icon: <Cohere /> },
        { name: 'Open AI', icon: <Openai className="fill-foreground" /> },
        { name: 'Qwen', icon: <Qwen className="fill-foreground" /> },
    ]

    return (
        <div
            aria-hidden
            className="min-w-xs mask-x-from-75% relative">
            <div className="bg-muted/50 absolute inset-0 my-auto flex h-10 items-center rounded-lg border px-12">
                <Play className="fill-foreground size-2.5" />
            </div>
            <div className="perspective-dramatic flex flex-col items-center gap-4">
                {upModels.map((model, index) => (
                    <div
                        key={index}
                        style={{ opacity: 1 - (upModels.length - 1 - index) * 0.2, transform: `rotateX(${(upModels.length - 1 - index) * 8}deg)` }}
                        className="flex origin-bottom items-center gap-2.5 [&>svg]:size-5">
                        {model.icon}
                        <span className="text-lg">{model.name}</span>
                    </div>
                ))}
                <div className="flex items-center gap-2.5 [&>svg]:size-5">
                    <MistralAi />
                    <span className="text-lg">Mistral Chat</span>
                </div>
                {bottomModels.map((model, index) => (
                    <div
                        key={index}
                        style={{ opacity: 1 - index * 0.2, transform: `rotateX(${-index * 8}deg)` }}
                        className="flex origin-top items-center gap-2.5 [&>svg]:size-5">
                        {model.icon}
                        <span className="text-lg">{model.name}</span>
                    </div>
                ))}
            </div>
        </div>
    )
}

export default ModelsIllustration