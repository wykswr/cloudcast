import Topbar from '../components/layout/Topbar'
import Mascot from '../components/common/Mascot'
import { useShell } from '../components/layout/shell'

function PlaceholderPage({ title }: { title: string }) {
  const { openUpload } = useShell()
  return (
    <>
      <Topbar title={title} onUpload={openUpload} />
      <div className="px-7 py-16 text-center text-sakura-ink-soft">
        <Mascot className="text-7xl" />
        <h3 className="mb-1.5 mt-2.5 text-xl text-sakura-ink">Coming soon ♡</h3>
        <p className="text-sm">This corner of CloudCast is still being decorated.</p>
      </div>
    </>
  )
}

export default PlaceholderPage
