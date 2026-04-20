'use client'

import { cn } from '@workspace/ui/lib/utils'
import { toJsxRuntime } from 'hast-util-to-jsx-runtime'
import { JSX, useLayoutEffect, useState } from 'react'
import { Fragment, jsx, jsxs } from 'react/jsx-runtime'
import type { BundledLanguage } from 'shiki/bundle/web'

const highlightCache = new Map()

let shikiPromise: Promise<typeof import('shiki/bundle/web')> | null = null

function getShiki() {
    if (!shikiPromise) {
        shikiPromise = import('shiki/bundle/web')
    }
    return shikiPromise
}

export async function highlight(code: string, lang: BundledLanguage) {
    const cacheKey = `${lang}:${code.length}:${code.slice(0, 50)}:${code.slice(-50)}`

    const cached = highlightCache.get(cacheKey)
    if (cached) return cached

    const { codeToHast } = await getShiki()

    const hast = await codeToHast(code, {
        lang,
        themes: {
            light: 'github-light',
            dark: 'vesper',
        },
    })

    const result = toJsxRuntime(hast, {
        Fragment,
        jsx,
        jsxs,
    }) as JSX.Element

    if (highlightCache.size > 100) {
        const firstKey = highlightCache.keys().next().value
        if (firstKey) highlightCache.delete(firstKey)
    }
    highlightCache.set(cacheKey, result)

    return result
}

type Props = {
    code: string | null
    lang: BundledLanguage
    initial?: JSX.Element
    preHighlighted?: JSX.Element | null
    maxHeight?: number
    className?: string
    theme?: string
    lineNumbers?: boolean // ← added
}

export default function CodeBlock({ code, lang, initial, maxHeight=940, preHighlighted, theme, className }: Props) {
    const [content, setContent] = useState(preHighlighted || initial || null)

    useLayoutEffect(() => {
        if (preHighlighted) {
            return
        }

        let isMounted = true

        if (code) {
            highlight(code, lang).then((result) => {
                if (isMounted) setContent(result)
            })
        }

        return () => {
            isMounted = false
        }
    }, [code, lang, theme, preHighlighted])

    return content ? (
        <div
            className={cn('[&_pre]:no-scrollbar max-h-(--pre-max-height) [&_code]:text-[13px]/2 [&_code]:font-mono [&_pre]:border-l [&_pre]:p-2 [&_pre]:leading-snug', className)}
            style={{ '--pre-max-height': `${maxHeight}px` } as React.CSSProperties}>
            {content}
        </div>
    ) : (
        <pre className="rounded-lg p-4 text-xs">Loading...</pre>
    )
}