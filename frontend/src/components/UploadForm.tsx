import type { ChangeEvent, FormEvent } from 'react'
import type { UploadFormState, UploadState } from '../types'

type UploadFormProps = {
  uploadForm: UploadFormState
  uploadState: UploadState
  onTitleChange: (value: string) => void
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void | Promise<void>
}

function UploadForm({
  uploadForm,
  uploadState,
  onTitleChange,
  onFileChange,
  onSubmit,
}: UploadFormProps) {
  return (
    <div className="rounded-3xl border border-white/10 bg-slate-900/40 p-6 shadow-2xl shadow-sky-900/20">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-sky-200">
            Upload
          </p>
          <h2 className="text-xl font-semibold text-white">
            Push a new video to S3
          </h2>
          <p className="text-sm text-slate-300">
            Files are chunked into 10MB parts and streamed via presigned URLs.
          </p>
        </div>
        <div className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-100">
          {uploadState.stage === 'uploading'
            ? `${uploadState.percent}%`
            : 'Ready'}
        </div>
      </div>

      <form className="mt-4 space-y-4" onSubmit={onSubmit}>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="block text-sm text-slate-200">
            Title (optional)
            <input
              type="text"
              value={uploadForm.title}
              onChange={(event) => onTitleChange(event.target.value)}
              className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white outline-none ring-2 ring-transparent transition focus:ring-sky-500/60"
              placeholder="My launch demo"
            />
          </label>
          <label className="block text-sm text-slate-200">
            Video file
            <input
              type="file"
              accept="video/*"
              onChange={onFileChange}
              className="mt-1 w-full rounded-xl border border-dashed border-white/20 bg-slate-900/60 px-3 py-2 text-sm text-white outline-none ring-2 ring-transparent transition file:mr-3 file:rounded-lg file:border-0 file:bg-sky-500/20 file:px-3 file:py-2 file:text-sky-100 hover:border-sky-400/60 focus:ring-sky-500/60"
            />
          </label>
        </div>

        <div className="flex items-center justify-between text-xs text-slate-400">
          <span>Chunk size: 10MB · S3 multipart upload</span>
          {uploadState.message && (
            <span
              className={
                uploadState.stage === 'error' ? 'text-rose-200' : 'text-sky-200'
              }
            >
              {uploadState.message}
            </span>
          )}
        </div>

        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
          <div
            className={`h-full rounded-full transition-all ${uploadState.stage === 'error'
              ? 'bg-rose-400'
              : 'bg-linear-to-r from-sky-400 to-cyan-300'
              }`}
            style={{ width: `${uploadState.percent}%` }}
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={uploadState.stage === 'uploading'}
            className="rounded-xl bg-linear-to-r from-sky-500 to-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:from-sky-400 hover:to-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {uploadState.stage === 'uploading' ? 'Uploading...' : 'Start upload'}
          </button>
          <span className="text-xs text-slate-400">
            S3 key pattern: user/video/raw/file
          </span>
        </div>
      </form>
    </div>
  )
}

export default UploadForm
