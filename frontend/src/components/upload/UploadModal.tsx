import { useRef, useState, type DragEvent } from 'react'
import Modal from '../common/Modal'
import Mascot from '../common/Mascot'
import { useVideos } from '../../context/videos-context'
import { getUploadError } from '../../lib/uploads'
import { formatBytes } from '../../utils/format'
import type { UploadState } from '../../types'

const IDLE: UploadState = { stage: 'idle', percent: 0 }

type UploadModalProps = {
  open: boolean
  onClose: () => void
}

function UploadModal({ open, onClose }: UploadModalProps) {
  const { upload } = useVideos()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [state, setState] = useState<UploadState>(IDLE)

  const uploading = state.stage === 'uploading'

  const reset = () => {
    setFile(null)
    setTitle('')
    setState(IDLE)
  }

  const close = () => {
    if (uploading) return // don't abandon an in-flight upload by accident
    reset()
    onClose()
  }

  const pickFile = (next: File | null) => {
    if (!next) return
    setFile(next)
    if (!title) setTitle(next.name.replace(/\.[^.]+$/, ''))
    setState(IDLE)
  }

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragOver(false)
    pickFile(e.dataTransfer.files?.[0] ?? null)
  }

  const handleUpload = async () => {
    if (!file) {
      setState({ stage: 'error', percent: 0, message: 'Pick a video first ♡' })
      return
    }
    try {
      await upload({
        file,
        title: title || file.name,
        onProgress: setState,
      })
      reset()
      onClose()
    } catch (err) {
      setState((prev) => ({ ...prev, ...getUploadError(err) }))
    }
  }

  return (
    <Modal open={open} onClose={close}>
      <button
        className="absolute right-4 top-4 grid size-8 place-items-center rounded-full bg-[#fff3f8] text-base text-sakura-ink-soft"
        onClick={close}
      >
        ✕
      </button>
      <h2 className="text-xl">Upload a clip 📼</h2>
      <p className="mb-5 mt-1 text-[13px] text-sakura-ink-soft">
        Drop a video and we'll tuck it away just for you ♡
      </p>

      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={`cursor-pointer rounded-[20px] border-[3px] border-dashed p-7 text-center transition ${
          dragOver
            ? 'border-sakura-pink-deep bg-[#fff5fa]'
            : 'border-[#ffb6cd] bg-gradient-to-b from-white to-[#fff7fa]'
        }`}
      >
        <Mascot className="text-5xl" />
        <h4 className="mb-0.5 mt-2 text-base">
          {file ? file.name : 'Drag your video here'}
        </h4>
        <p className="text-xs text-sakura-ink-soft">
          {file
            ? formatBytes(file.size)
            : 'or click to browse · mp4 / mov · big files welcome'}
        </p>
        <input
          ref={inputRef}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
        />
      </div>

      <div className="mt-4 text-left">
        <label className="mb-1.5 block text-xs font-bold text-sakura-ink-soft">
          Title
        </label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Give it a cute name ✨"
          className="sk-input"
        />
      </div>

      {state.stage !== 'idle' && (
        <div className="mt-4">
          <div className="h-4 overflow-hidden rounded-full bg-[#ffe4ee]">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${state.percent}%`,
                background:
                  state.stage === 'error'
                    ? '#fb7185'
                    : 'repeating-linear-gradient(45deg,#ff8fb1 0 12px,#ff5d8f 12px 24px)',
              }}
            />
          </div>
          <div className="mt-1.5 flex justify-between text-xs text-sakura-ink-soft">
            <span className={state.stage === 'error' ? 'text-sakura-fail' : ''}>
              {state.message ?? 'Uploading…'}
            </span>
            <span>{state.percent}%</span>
          </div>
        </div>
      )}

      <div className="mt-5 flex gap-2.5">
        <button
          className="sk-btn sk-btn-ghost flex-1 rounded-2xl py-3"
          onClick={close}
          disabled={uploading}
        >
          Cancel
        </button>
        <button
          className="sk-btn sk-btn-primary flex-1 rounded-2xl py-3"
          onClick={handleUpload}
          disabled={uploading || !file}
        >
          {uploading ? 'Uploading…' : 'Upload & sparkle ✨'}
        </button>
      </div>
    </Modal>
  )
}

export default UploadModal
