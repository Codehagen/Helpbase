import dynamic from "next/dynamic"

import { Header } from "@/components/header"
import { Hero } from "@/components/marketing/hero"
import Comparator from "@/components/comparator-7"
import FooterSection from "@/components/footer"

// Below-fold sections load via next/dynamic so their JS code-splits out
// of the first-paint bundle. SSR stays on — the HTML ships pre-rendered;
// only client hydration defers.
const HowItWorks = dynamic(() => import("@/components/how-it-works-3"))
const FeaturesOwnIt = dynamic(() => import("@/components/features-1"))
const AiNativeBento = dynamic(() => import("@/components/bento-2"))
const DemoCrossLink = dynamic(() =>
  import("@/components/marketing/demo-cross-link").then((m) => ({
    default: m.DemoCrossLink,
  })),
)
const Pricing = dynamic(() => import("@/components/pricing"))
const FAQs = dynamic(() => import("@/components/faqs-3"))

export default function LandingPage() {
  return (
    <>
      <Header />
      <main
        id="main"
        role="main"
        className="bg-background overflow-hidden">
        <Hero />
        <Comparator />
        <HowItWorks />
        <FeaturesOwnIt />
        <AiNativeBento />
        <DemoCrossLink />
        <Pricing />
        <FAQs />
      </main>
      <FooterSection />
    </>
  )
}
