import { Header } from "@/components/header"
import { Hero } from "@/components/marketing/hero"
import Comparator from "@/components/comparator-7"
import HowItWorks from "@/components/how-it-works-3"
import FeaturesOwnIt from "@/components/features-1"
import AiNativeBento from "@/components/bento-2"
import { DemoCrossLink } from "@/components/marketing/demo-cross-link"
import Pricing from "@/components/pricing"
import FAQs from "@/components/faqs-3"
import FooterSection from "@/components/footer"

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
