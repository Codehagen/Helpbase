import CodeBlock from "@/components/code-block"

const PHP_CODE = `<?php

$ch = curl_init();

curl_setopt($ch, CURLOPT_URL, 'https://api.example.com/data');
curl_setopt($ch, CURLOPT_POST, 1);
curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode([
    'key' => 'value',
    'anotherKey' => 'anotherValue',
]));
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'Content-Type: application/json',
]);

$response = curl_exec($ch);

curl_close($ch);

echo $response;`

export const CodeIllustration = ({ theme }: { theme?: string }) => (
    <div
        aria-hidden
        className="bg-illustration ring-border-illustration shadow-black/6.5 h-fit max-w-[calc(100vw-6rem)] overflow-hidden rounded-2xl border border-transparent text-sm shadow-md ring-1">
        <div
            aria-hidden
            className="mt-4 flex gap-1.5 px-4">
            <div className="bg-muted-foreground/10 border-foreground/5 size-2 rounded-full border" />
            <div className="bg-muted-foreground/10 border-foreground/5 size-2 rounded-full border" />
            <div className="bg-muted-foreground/10 border-foreground/5 size-2 rounded-full border" />
        </div>
        <CodeBlock
            code={PHP_CODE}
            lang="php"
            maxHeight={300}
            theme={theme || 'github-light'}
            lineNumbers
            className="bg-linear-to-b [&_pre]:mask-y-from-95% to-muted/50 border-background [&_pre]:min-h-auto [&_pre]:max-h-auto aspect-video border-t [&_pre]:aspect-video [&_pre]:border-none [&_pre]:!bg-transparent [&_pre]:px-1"
        />
    </div>
)