export const DocumentMdIllustration = () => {
    return (
        <div
            aria-hidden
            className="relative size-fit">
            <div className="z-2 after:border-foreground/15 text-shadow-sm absolute -right-3 bottom-2 rounded bg-slate-600 px-1.5 py-0.5 text-[10px] font-semibold text-white shadow-lg shadow-slate-900/25 after:absolute after:inset-0 after:rounded after:border">MD</div>
            <div className="bg-illustration corner-tr-bevel ring-border-illustration z-1 shadow-black/6.5 relative w-16 space-y-2 rounded-md rounded-tr-[15%] p-2.5 shadow-md ring-1">
                <div className="space-y-1.5">
                    <div className="flex items-center gap-1">
                        <div className="text-foreground/30 text-[6px] font-bold">#</div>
                        <div className="bg-foreground/20 h-[3px] w-6 rounded-full" />
                    </div>
                    <div className="space-y-0.5 pl-0.5">
                        <div className="bg-foreground/10 h-0.5 w-full rounded-full" />
                        <div className="bg-foreground/10 h-0.5 w-9 rounded-full" />
                        <div className="bg-foreground/10 h-0.5 w-10 rounded-full" />
                    </div>
                </div>
                <div className="space-y-1.5">
                    <div className="flex items-center gap-1">
                        <div className="text-foreground/30 text-[6px] font-bold">##</div>
                        <div className="bg-foreground/15 h-[3px] w-5 rounded-full" />
                    </div>
                    <div className="space-y-0.5 pl-0.5">
                        <div className="bg-foreground/10 h-0.5 w-10 rounded-full" />
                        <div className="bg-foreground/10 h-0.5 w-7 rounded-full" />
                    </div>
                    <div className="space-y-0.5 pl-0.5">
                        <div className="bg-foreground/10 h-0.5 w-10 rounded-full" />
                        <div className="bg-foreground/10 h-0.5 w-7 rounded-full" />
                        <div className="bg-foreground/10 h-0.5 w-full rounded-full" />
                    </div>
                </div>
            </div>
        </div>
    )
}

export default DocumentMdIllustration