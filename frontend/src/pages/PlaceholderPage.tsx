import { SettingsIcon, TrashIcon } from '../components/common/icons'
import EmptyState from '../components/library/EmptyState'

function PlaceholderPage({ title }: { title: 'Trash' | 'Settings' }) {
  return (
    <div className="flex flex-col gap-6 px-4 pt-3 pb-16 md:px-8 md:pt-5">
      <h1 className="m-0 font-display text-[26px] font-semibold tracking-[-0.02em] md:text-[28px]">
        {title}
      </h1>
      <EmptyState
        icon={
          title === 'Trash' ? (
            <TrashIcon className="size-10" strokeWidth={1.5} />
          ) : (
            <SettingsIcon className="size-10" strokeWidth={1.5} />
          )
        }
        title="Coming soon"
        message="This part of CloudCast isn’t ready yet."
      />
    </div>
  )
}

export default PlaceholderPage
