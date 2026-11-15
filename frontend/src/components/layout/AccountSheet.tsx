import { useAuth } from '../../context/auth-context'
import Avatar from '../common/Avatar'
import Modal from '../common/Modal'
import StorageMeter from '../common/StorageMeter'
import { SignOutIcon } from '../common/icons'

/** Phone-sized account panel: who is signed in, storage, and sign out. */
function AccountSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user, logout } = useAuth()
  return (
    <Modal open={open} onClose={onClose} title="Account">
      <div className="flex items-center gap-3">
        <Avatar email={user?.email} className="size-11" />
        <div className="min-w-0">
          <div className="truncate font-semibold">{user?.email?.split('@')[0] ?? 'You'}</div>
          <div className="truncate text-sm text-ink-3">{user?.email ?? ''}</div>
        </div>
      </div>
      <StorageMeter />
      <div className="flex justify-end gap-2">
        <button type="button" className="btn btn-secondary" data-close onClick={onClose}>
          Close
        </button>
        <button type="button" className="btn btn-secondary text-bad" onClick={() => void logout()}>
          <SignOutIcon />
          Sign out
        </button>
      </div>
    </Modal>
  )
}

export default AccountSheet
