import { ViewerSection } from '@/components/viewer/viewer-section'
import { Sidebar } from '@/components/layout/sidebar'

export default function Home() {
  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      <main className="flex-1 overflow-hidden">
        <ViewerSection />
      </main>
    </div>
  )
}
