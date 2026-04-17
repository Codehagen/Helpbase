import {
  Body,
  Button,
  Container,
  Head,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Tailwind,
  Text,
  pixelBasedPreset,
} from "@react-email/components"

interface SignInMagicLinkProps {
  url: string
  email: string
  expiresInMinutes: number
}

export default function SignInMagicLinkEmail({
  url,
  email,
  expiresInMinutes,
}: SignInMagicLinkProps) {
  return (
    <Html lang="en">
      <Tailwind
        config={{
          presets: [pixelBasedPreset],
          theme: {
            extend: {
              colors: {
                // Cool-neutral palette approximations of the in-app shadcn tokens
                // (oklch doesn't render in email clients). Matches the
                // editorial-technical aesthetic documented in DESIGN.md.
                ink: "#0a0a0a",
                paper: "#ffffff",
                wash: "#fafafa",
                border: "#e5e7eb",
                muted: "#737373",
              },
              fontFamily: {
                sans: [
                  "ui-sans-serif",
                  "system-ui",
                  "-apple-system",
                  "BlinkMacSystemFont",
                  "Segoe UI",
                  "Roboto",
                  "Helvetica Neue",
                  "Arial",
                  "sans-serif",
                ],
                mono: [
                  "ui-monospace",
                  "SFMono-Regular",
                  "Menlo",
                  "Monaco",
                  "Consolas",
                  "monospace",
                ],
              },
            },
          },
        }}
      >
        <Head />
        <Preview>{`Sign in to helpbase — link expires in ${expiresInMinutes} minutes`}</Preview>
        <Body className="bg-wash font-sans py-10">
          <Container className="max-w-[520px] mx-auto bg-paper border border-solid border-border rounded-md px-10 py-8">
            {/* Wordmark — plain text, matches the site header. */}
            <Section>
              <Text className="text-ink text-[15px] font-semibold tracking-tight m-0">
                helpbase
              </Text>
            </Section>

            <Text className="text-ink text-2xl font-semibold tracking-tight mt-8 mb-2">
              Sign in to helpbase
            </Text>
            <Text className="text-muted text-[15px] leading-6 m-0">
              We received a sign-in request for{" "}
              <span className="text-ink font-medium">{email}</span>.
              Click the button below to continue — the link expires in{" "}
              {expiresInMinutes} minutes.
            </Text>

            <Section className="mt-8 mb-8">
              <Button
                href={url}
                className="bg-ink text-paper no-underline rounded-md box-border px-6 py-3 text-[14px] font-medium"
              >
                Sign in to helpbase
              </Button>
            </Section>

            <Text className="text-muted text-[13px] leading-5 m-0">
              Or copy and paste this URL into your browser:
            </Text>
            <Text className="font-mono text-[12px] text-ink leading-5 break-all mt-1">
              <Link href={url} className="text-ink underline">
                {url}
              </Link>
            </Text>

            <Hr className="border-none border-t border-solid border-border my-8" />

            <Text className="text-muted text-[12px] leading-5 m-0">
              If you didn't request this email, you can safely ignore it —
              no action will be taken.
            </Text>
            <Text className="text-muted text-[12px] leading-5 mt-4 mb-0">
              helpbase — docs you can talk to.{" "}
              <Link href="https://helpbase.dev" className="text-muted underline">
                helpbase.dev
              </Link>
            </Text>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  )
}

SignInMagicLinkEmail.PreviewProps = {
  url: "https://helpbase.dev/api/auth/magic-link/verify?token=preview_token_1234567890abcdef",
  email: "you@example.com",
  expiresInMinutes: 10,
} satisfies SignInMagicLinkProps

export { SignInMagicLinkEmail }
