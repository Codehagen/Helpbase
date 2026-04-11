import { Header } from "@/components/header"
import { Footer } from "@/components/footer"
import { SearchDialog } from "@/components/search-dialog"
import { getSearchIndex } from "@/lib/search"

export default async function MainLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const searchItems = await getSearchIndex()

  return (
    <>
      <div className="flex min-h-svh flex-col">
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
      </div>
      <SearchDialog items={searchItems} />
    </>
  )
}
