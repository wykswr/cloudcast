import { useState, type ChangeEvent, type DragEvent } from 'react'
import { Link } from 'react-router-dom'
import FocusLayout from '../components/layout/FocusLayout'
import StorageMeter from '../components/common/StorageMeter'
import UploadQueueItem from '../components/upload/UploadQueueItem'
import {
  CameraIcon,
  CheckIcon,
  ImageIcon,
  InfoIcon,
  UploadCloudIcon,
  UploadIcon,
} from '../components/common/icons'
import { useUploads } from '../context/uploads-context'
import { isSending } from '../lib/upload-queue'
import { formatBytes } from '../utils/format'

type StepState = 'todo' | 'now' | 'done'

const STEPS = [
  {
    title: 'Upload',
    body: 'Your video is saved to your private library. If the connection drops, we carry on automatically.',
  },
  {
    title: 'Get it ready',
    body: 'We prepare your video so it plays smoothly on phones, tablets and computers, even on slow connections.',
  },
  {
    title: 'Ready to watch',
    body: 'Watch it anytime. Only you can see it.',
  },
]

function StepDot({ state, n }: { state: StepState; n: number }) {
  const tone =
    state === 'done'
      ? 'border-good bg-good text-white'
      : state === 'now'
        ? 'border-accent bg-accent text-white ring-4 ring-accent/15'
        : 'border-[#d3d3cc] bg-white text-ink-2'
  return (
    <span
      className={`grid size-7 shrink-0 place-items-center rounded-full border text-[13px] font-bold ${tone}`}
    >
      {state === 'done' ? <CheckIcon className="size-3.5" strokeWidth={3} /> : n}
    </span>
  )
}

function UploadPage() {
  const { items, summary, addFiles, setTitle, startAll, pause, resume, remove } = useUploads()
  const [dragOver, setDragOver] = useState(false)

  const valid = items.filter((item) => item.stage !== 'skipped')
  const skipped = items.length - valid.length
  const totalBytes = valid.reduce((sum, item) => sum + item.size, 0)
  const anySending = items.some((item) => isSending(item.stage))
  const anyProcessing = items.some((item) => item.stage === 'processing')
  const anyReady = summary.ready > 0
  const started = items.some((item) => item.stage !== 'draft' && item.stage !== 'skipped')
  const steps: StepState[] = [
    anySending ? 'now' : started ? 'done' : 'todo',
    anyProcessing ? 'now' : anyReady && !anySending ? 'done' : 'todo',
    anyReady ? (anyProcessing || anySending ? 'now' : 'done') : 'todo',
  ]
  const allDone = started && summary.inProgress === 0 && summary.drafts === 0 && anyReady

  const onPick = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) addFiles(event.target.files)
    event.target.value = ''
  }
  const onDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault()
    setDragOver(false)
    addFiles(event.dataTransfer.files)
  }

  const startLabel = `Upload ${summary.drafts} ${summary.drafts === 1 ? 'video' : 'videos'}`
  const footerNote = !started
    ? 'You can change titles later, too.'
    : summary.inProgress
      ? 'We’ll let you know when they’re ready to watch.'
      : 'All done. Your videos are ready.'

  const primaryAction =
    summary.drafts > 0 ? (
      <button type="button" className="btn btn-primary h-12 sm:h-11" onClick={startAll}>
        <UploadIcon />
        {started ? `Upload ${summary.drafts} more` : startLabel}
      </button>
    ) : allDone ? (
      <Link to="/" className="btn btn-primary h-12 no-underline sm:h-11">
        Go to library
      </Link>
    ) : summary.inProgress ? (
      <Link to="/" className="btn btn-secondary h-12 no-underline sm:h-11">
        Keep browsing
      </Link>
    ) : null

  return (
    <FocusLayout
      actions={
        <div className="hidden w-[260px] lg:block">
          <StorageMeter className="border-0 bg-transparent p-0" />
        </div>
      }
    >
      <main className="mx-auto flex w-full max-w-[1160px] flex-col gap-7 px-4 pt-6 pb-36 sm:px-6 sm:pt-10 sm:pb-16">
        <div className="flex flex-col gap-1.5">
          <h1 className="m-0 font-display text-[26px] font-semibold tracking-[-0.02em] sm:text-[32px]">
            Upload videos
          </h1>
          <p className="m-0 text-[15px] text-ink-2">
            Big files are fine. If your connection drops, we’ll pick up where we left off, and you
            can keep browsing while they finish.
          </p>
        </div>

        <div className="flex flex-wrap items-start gap-6">
          <section className="flex min-w-0 flex-[999_1_560px] flex-col gap-4">
            <label
              htmlFor="upload-files"
              onDragOver={(event) => {
                event.preventDefault()
                setDragOver(true)
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              className={`relative hidden cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-6 text-center transition-colors focus-within:border-accent sm:flex ${
                items.length ? 'py-8' : 'py-[72px]'
              } ${
                dragOver
                  ? 'border-accent bg-[#eef1ff]'
                  : 'border-[#cfcfc8] bg-white hover:border-accent hover:bg-[#f7f8ff]'
              }`}
            >
              <span className="grid size-14 place-items-center rounded-2xl bg-accent-soft text-accent">
                <UploadCloudIcon className="size-[26px]" />
              </span>
              <span className="text-[17px] font-semibold">
                {dragOver ? 'Release to add videos' : 'Drag videos here'}
              </span>
              <span className="text-sm text-ink-2">
                or <span className="font-semibold text-accent underline">browse your files</span>
              </span>
              <span className="text-xs text-ink-3">Most video files work · up to 50 GB each</span>
              <input
                id="upload-files"
                type="file"
                accept="video/*"
                multiple
                onChange={onPick}
                className="sr-only"
              />
            </label>

            <div className="grid grid-cols-2 gap-2.5 sm:hidden">
              <label className="relative flex min-h-[120px] cursor-pointer flex-col gap-2.5 rounded-2xl border border-[#e0e0da] bg-white p-3.5 focus-within:border-accent">
                <span className="grid size-11 place-items-center rounded-xl bg-accent-soft text-accent">
                  <ImageIcon className="size-[22px]" />
                </span>
                <span className="text-[15px] font-semibold">Choose videos</span>
                <span className="text-xs text-ink-3">From your photos or files</span>
                <input
                  type="file"
                  accept="video/*"
                  multiple
                  onChange={onPick}
                  className="sr-only"
                />
              </label>
              <label className="relative flex min-h-[120px] cursor-pointer flex-col gap-2.5 rounded-2xl border border-[#e0e0da] bg-white p-3.5 focus-within:border-accent">
                <span className="grid size-11 place-items-center rounded-xl bg-bad-soft text-bad">
                  <CameraIcon className="size-[22px]" />
                </span>
                <span className="text-[15px] font-semibold">Record video</span>
                <span className="text-xs text-ink-3">Use your camera</span>
                <input
                  type="file"
                  accept="video/*"
                  capture="environment"
                  onChange={onPick}
                  className="sr-only"
                />
              </label>
              <span className="col-span-2 text-center text-xs text-ink-3">
                Most video files work · up to 50 GB each
              </span>
            </div>

            {items.length ? (
              <div className="surface overflow-hidden">
                <div className="flex items-center justify-between gap-3 border-b border-[#ecece8] px-4 py-3.5">
                  <span className="text-sm font-semibold">
                    {valid.length} {valid.length === 1 ? 'video' : 'videos'}
                    {skipped ? ` · ${skipped} skipped` : ''}
                  </span>
                  <span className="text-[13px] text-ink-3">{formatBytes(totalBytes)} total</span>
                </div>
                <ul className="m-0 list-none p-0">
                  {items.map((item) => (
                    <UploadQueueItem
                      key={item.key}
                      item={item}
                      onTitle={(title) => setTitle(item.key, title)}
                      onPause={() => pause(item.key)}
                      onResume={() => resume(item.key)}
                      onRemove={() => remove(item.key)}
                    />
                  ))}
                </ul>
                <div className="hidden flex-wrap items-center justify-between gap-3 border-t border-[#ecece8] bg-panel px-4 py-3.5 sm:flex">
                  <span className="text-[13px] text-ink-2">{footerNote}</span>
                  {primaryAction}
                </div>
              </div>
            ) : null}
          </section>

          <aside className="flex min-w-0 flex-[1_1_300px] flex-col gap-4">
            <div className="surface flex flex-col gap-4 p-5">
              <h2 className="m-0 text-[15px] font-semibold">What happens next</h2>
              <ol className="m-0 flex list-none flex-col p-0">
                {STEPS.map((step, i) => (
                  <li key={step.title} className="flex gap-3.5">
                    <div className="flex flex-col items-center">
                      <StepDot state={steps[i]} n={i + 1} />
                      {i < STEPS.length - 1 ? (
                        <span
                          className={`my-1 min-h-4 w-0.5 flex-1 ${steps[i] === 'done' ? 'bg-good' : 'bg-line'}`}
                        />
                      ) : null}
                    </div>
                    <div className="flex flex-col gap-1 pb-4">
                      <span className="text-sm font-semibold">{step.title}</span>
                      <span className="text-[13px] leading-snug text-ink-2">{step.body}</span>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
            <div className="flex gap-3 rounded-[14px] bg-accent-soft p-4 text-[13px] leading-normal text-accent-ink">
              <InfoIcon className="mt-px size-[18px] shrink-0" />
              <span>
                Keep this tab open until your uploads finish. If you close it, open CloudCast again
                and upload the file once more. On a phone, use Wi‑Fi for big videos to save data.
              </span>
            </div>
          </aside>
        </div>
      </main>

      {primaryAction ? (
        <div className="fixed inset-x-0 bottom-0 z-30 flex flex-col gap-2 border-t border-line bg-panel px-4 pt-3 pb-[max(24px,env(safe-area-inset-bottom))] sm:hidden">
          {primaryAction}
          <span className="text-center text-xs text-ink-3">{footerNote}</span>
        </div>
      ) : null}
    </FocusLayout>
  )
}

export default UploadPage
