import { ChangeEvent, FormEvent, useEffect, useRef, useState } from 'react'
import Hls from 'hls.js'
import {
  confirmSignUp,
  fetchAuthSession,
  getCurrentUser,
  signIn,
  signOut,
  signUp,
} from 'aws-amplify/auth'

type VideoItem = {
  id: string
  title?: string | null
  status: 'uploading' | 'processing' | 'ready' | 'failed' | string
  createdAt: number
  s3KeyHls?: string | null
}

type UploadState = {
  stage: 'idle' | 'uploading' | 'success' | 'error'
  message?: string
  percent: number
  videoId?: string
}

type StreamSelection = {
  url: string
  title?: string | null
  videoId: string
}

type AuthUser = {
  id: string
  email?: string | null
}

type VideoListResponse = {
  items: VideoItem[]
}

type StreamResponse = {
  streamUrl: string
}

type DeleteVideoResponse = {
  status: string
}

type UploadInitResponse = {
  uploadId: string
  videoId: string
}

type SignPartResponse = {
  presignedUrl: string
}

const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'
).replace(/\/$/, '')
const CHUNK_SIZE = 10 * 1024 * 1024

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  return 'Something went wrong'
}

function formatDate(seconds: number): string {
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(seconds * 1000))
}

function StatusBadge({ status }: { status: VideoItem['status'] }) {
  const tone =
    status === 'ready'
      ? 'bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-500/40'
      : status === 'processing'
        ? 'bg-blue-500/15 text-blue-100 ring-1 ring-blue-500/40'
        : status === 'uploading'
          ? 'bg-amber-500/20 text-amber-100 ring-1 ring-amber-500/40'
          : 'bg-rose-500/20 text-rose-100 ring-1 ring-rose-500/40'

  return (
    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${tone}`}>
      {status}
    </span>
  )
}

function HlsPlayer({ src, title }: { src: string; title?: string | null }) {
  const videoRef = useRef<HTMLVideoElement | null>(null)

  useEffect(() => {
    const video = videoRef.current
    if (!video || !src) {
      return
    }

    const srcUrl = new URL(src)
    const manifestUrl = srcUrl.toString()
    const tokenQuery = srcUrl.searchParams.toString()
    // Base URL of the HLS folder so relative variant/segment requests resolve
    // against the CloudFront origin, not the app origin.
    const baseUrl = new URL('./', srcUrl)

    if (Hls.isSupported()) {
      // Attach signed query parameters to every HLS request (master, variants, segments)
      // so CloudFront key group validation succeeds.
      const SignedLoader = class extends Hls.DefaultConfig.loader {
        constructor(config: any) {
          super(config)
        }
        load(context: any, config: any, callbacks: any) {
          if (context?.url) {
            const url = new URL(context.url, baseUrl)
            if (tokenQuery) {
              const params = new URLSearchParams(tokenQuery)
              params.forEach((value, key) => {
                url.searchParams.set(key, value)
              })
            }
            context.url = url.toString()
          }
          super.load(context, config, callbacks)
        }
      }

      const hls = new Hls({ enableWorker: true, loader: SignedLoader })
      hls.loadSource(manifestUrl)
      hls.attachMedia(video)

      return () => {
        hls.destroy()
      }
    }

    video.src = manifestUrl
    return () => {
      video.removeAttribute('src')
    }
  }, [src])

  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-4 shadow-2xl shadow-sky-900/20">
      <div className="mb-2 flex items-center justify-between text-sm text-slate-300">
        <div className="font-semibold">{title ?? 'HLS Stream'}</div>
        <span className="text-xs text-slate-400">Protected playback</span>
      </div>
      <video
        ref={videoRef}
        controls
        className="aspect-video w-full rounded-xl bg-black ring-2 ring-slate-800"
      />
    </div>
  )
}

function App() {
  const [authUser, setAuthUser] = useState<AuthUser | null>(null)
  const [authMode, setAuthMode] = useState<'sign-in' | 'sign-up' | 'confirm'>(
    'sign-in',
  )
  const [authForm, setAuthForm] = useState({ email: '', password: '' })
  const [confirmCode, setConfirmCode] = useState('')
  const [pendingEmail, setPendingEmail] = useState('')
  const [authError, setAuthError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [checkingAuth, setCheckingAuth] = useState(true)

  const [videos, setVideos] = useState<VideoItem[]>([])
  const [videosLoading, setVideosLoading] = useState(false)

  const [uploadForm, setUploadForm] = useState<{
    title: string
    file: File | null
  }>({ title: '', file: null })
  const [uploadState, setUploadState] = useState<UploadState>({
    stage: 'idle',
    percent: 0,
  })

  const [activeStream, setActiveStream] = useState<StreamSelection | null>(null)

  const apiRequest = async <T,>(
    path: string,
    options: { method?: string; body?: unknown } = {},
  ): Promise<T> => {
    const session = await fetchAuthSession()
    const token =
      session.tokens?.idToken?.toString() ??
      session.tokens?.accessToken?.toString()
    if (!token) {
      throw new Error('Sign in to continue')
    }

    const response = await fetch(`${API_BASE_URL}${path}`, {
      method: options.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    })

    const text = await response.text()
    const data = text ? JSON.parse(text) : null

    if (!response.ok) {
      const detail =
        (data as { detail?: string } | null)?.detail ??
        `Request failed with status ${response.status}`
      throw new Error(detail)
    }

    return data as T
  }

  const loadVideos = async () => {
    setVideosLoading(true)
    try {
      const data = await apiRequest<VideoListResponse>('/videos')
      setVideos(data.items)
    } catch (error) {
      setMessage(formatError(error))
    } finally {
      setVideosLoading(false)
    }
  }

  useEffect(() => {
    const bootstrap = async () => {
      try {
        const session = await fetchAuthSession()
        if (!session.tokens) return
        const user = await getCurrentUser()
        setAuthUser({
          id: user.userId,
          email: user.signInDetails?.loginId ?? user.username,
        })
        await loadVideos()
      } catch {
        setAuthUser(null)
      } finally {
        setCheckingAuth(false)
      }
    }

    bootstrap()
  }, [])

  const handleSignIn = async (event: FormEvent) => {
    event.preventDefault()
    setAuthError(null)
    setMessage(null)
    try {
      const result = await signIn({
        username: authForm.email,
        password: authForm.password,
      })
      if (result.isSignedIn) {
        const user = await getCurrentUser()
        setAuthUser({
          id: user.userId,
          email: user.signInDetails?.loginId ?? user.username,
        })
        setMessage('Signed in')
        await loadVideos()
      } else {
        setMessage('Sign-in requires additional steps in Cognito')
      }
    } catch (error) {
      setAuthError(formatError(error))
    }
  }

  const handleSignUp = async (event: FormEvent) => {
    event.preventDefault()
    setAuthError(null)
    setMessage(null)
    try {
      await signUp({
        username: authForm.email,
        password: authForm.password,
        options: {
          userAttributes: { email: authForm.email },
          autoSignIn: { enabled: false },
        },
      })
      setPendingEmail(authForm.email)
      setAuthMode('confirm')
      setMessage('Check your email for the verification code')
    } catch (error) {
      setAuthError(formatError(error))
    }
  }

  const handleConfirm = async (event: FormEvent) => {
    event.preventDefault()
    setAuthError(null)
    setMessage(null)
    try {
      const username = pendingEmail || authForm.email
      await confirmSignUp({
        username,
        confirmationCode: confirmCode,
      })
      setAuthMode('sign-in')
      setMessage('Email confirmed. You can sign in now.')
    } catch (error) {
      setAuthError(formatError(error))
    }
  }

  const handleSignOut = async () => {
    await signOut()
    setAuthUser(null)
    setVideos([])
    setActiveStream(null)
  }

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null
    setUploadForm((prev) => ({ ...prev, file }))
  }

  const handleUpload = async (event: FormEvent) => {
    event.preventDefault()
    if (!uploadForm.file) {
      setUploadState({
        stage: 'error',
        message: 'Select a file to upload',
        percent: 0,
      })
      return
    }

    setUploadState({
      stage: 'uploading',
      message: 'Starting multipart session',
      percent: 0,
    })

    try {
      const { uploadId, videoId } = await apiRequest<UploadInitResponse>(
        '/videos/upload/init',
        {
          method: 'POST',
          body: {
            filename: uploadForm.file.name,
            contentType: uploadForm.file.type || 'application/octet-stream',
            title: uploadForm.title || uploadForm.file.name,
          },
        },
      )

      const parts: { etag: string; partNumber: number }[] = []
      let uploadedBytes = 0
      let partNumber = 1

      for (
        let offset = 0;
        offset < uploadForm.file.size;
        offset += CHUNK_SIZE
      ) {
        const chunk = uploadForm.file.slice(offset, offset + CHUNK_SIZE)

        setUploadState({
          stage: 'uploading',
          message: `Signing part ${partNumber}`,
          percent: Math.round((uploadedBytes / uploadForm.file.size) * 100),
          videoId,
        })

        const { presignedUrl } = await apiRequest<SignPartResponse>(
          '/videos/upload/sign-part',
          {
            method: 'POST',
            body: { videoId, uploadId, partNumber },
          },
        )

        const putResponse = await fetch(presignedUrl, {
          method: 'PUT',
          body: chunk,
          headers: {
            'Content-Type':
              uploadForm.file.type || 'application/octet-stream',
          },
        })

        if (!putResponse.ok) {
          throw new Error(`Upload failed on part ${partNumber}`)
        }

        const etag = (putResponse.headers.get('ETag') || '').replace(/"/g, '')
        parts.push({ etag, partNumber })

        uploadedBytes += chunk.size
        const percent = Math.min(
          99,
          Math.round((uploadedBytes / uploadForm.file.size) * 100),
        )
        setUploadState({
          stage: 'uploading',
          message: `Uploaded part ${partNumber}`,
          percent,
          videoId,
        })

        partNumber += 1
      }

      await apiRequest('/videos/upload/complete', {
        method: 'POST',
        body: { videoId, uploadId, parts },
      })

      setUploadState({
        stage: 'success',
        message: 'Upload complete. Processing your video...',
        percent: 100,
        videoId,
      })
      setUploadForm({ title: '', file: null })
      await loadVideos()
    } catch (error) {
      setUploadState((prev) => ({
        ...prev,
        stage: 'error',
        message: formatError(error),
      }))
    }
  }

  const handleStartStream = async (video: VideoItem) => {
    try {
      const data = await apiRequest<StreamResponse>(`/videos/${video.id}/stream`)
      setActiveStream({
        url: data.streamUrl,
        title: video.title,
        videoId: video.id,
      })
      setMessage(null)
    } catch (error) {
      setMessage(formatError(error))
    }
  }

  const handleDeleteVideo = async (video: VideoItem) => {
    const confirmed = window.confirm(
      `Delete "${video.title || 'Untitled video'}"? This removes uploaded and processed media files.`,
    )
    if (!confirmed) return

    try {
      await apiRequest<DeleteVideoResponse>(`/videos/${video.id}`, {
        method: 'DELETE',
      })
      setVideos((prev) => prev.filter((item) => item.id !== video.id))
      if (activeStream?.videoId === video.id) {
        setActiveStream(null)
      }
      setMessage('Video deleted')
    } catch (error) {
      setMessage(formatError(error))
    }
  }

  const authCard = (
    <div className="rounded-3xl border border-white/10 bg-slate-900/40 p-6 shadow-2xl shadow-sky-900/20">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-sky-200">
            Cognito
          </p>
          <h2 className="text-xl font-semibold text-white">
            {authMode === 'sign-up'
              ? 'Create your account'
              : authMode === 'confirm'
                ? 'Confirm your code'
                : 'Sign in'}
          </h2>
        </div>
        <span className="rounded-full bg-sky-500/20 px-3 py-1 text-xs font-semibold text-sky-100">
          Secure
        </span>
      </div>

      <form
        className="space-y-3"
        onSubmit={
          authMode === 'sign-in'
            ? handleSignIn
            : authMode === 'sign-up'
              ? handleSignUp
              : handleConfirm
        }
      >
        {authMode !== 'confirm' && (
          <>
            <label className="block text-sm text-slate-200">
              Email
              <input
                type="email"
                required
                value={authForm.email}
                onChange={(event) =>
                  setAuthForm((prev) => ({
                    ...prev,
                    email: event.target.value,
                  }))
                }
                className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white outline-none ring-2 ring-transparent transition focus:ring-sky-500/60"
                placeholder="you@example.com"
              />
            </label>
            <label className="block text-sm text-slate-200">
              Password
              <input
                type="password"
                required
                value={authForm.password}
                onChange={(event) =>
                  setAuthForm((prev) => ({
                    ...prev,
                    password: event.target.value,
                  }))
                }
                className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white outline-none ring-2 ring-transparent transition focus:ring-sky-500/60"
                placeholder="At least 8 characters"
              />
            </label>
          </>
        )}

        {authMode === 'confirm' && (
          <label className="block text-sm text-slate-200">
            Verification code
            <input
              type="text"
              required
              value={confirmCode}
              onChange={(event) => setConfirmCode(event.target.value)}
              className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white outline-none ring-2 ring-transparent transition focus:ring-sky-500/60"
              placeholder="123456"
            />
          </label>
        )}

        {authError && (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">
            {authError}
          </div>
        )}
        {message && !authError && (
          <div className="rounded-xl border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-sm text-sky-100">
            {message}
          </div>
        )}

        <button
          type="submit"
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 to-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:from-sky-400 hover:to-cyan-300"
        >
          {authMode === 'sign-up'
            ? 'Create account'
            : authMode === 'confirm'
              ? 'Confirm code'
              : 'Sign in'}
        </button>
      </form>

      <div className="mt-4 text-xs text-slate-300">
        {authMode === 'sign-in' && (
          <button
            className="font-semibold text-sky-200 hover:text-sky-100"
            onClick={() => setAuthMode('sign-up')}
          >
            Need an account? Create one
          </button>
        )}
        {authMode === 'sign-up' && (
          <button
            className="font-semibold text-sky-200 hover:text-sky-100"
            onClick={() => setAuthMode('sign-in')}
          >
            I already have an account
          </button>
        )}
        {authMode === 'confirm' && (
          <button
            className="font-semibold text-sky-200 hover:text-sky-100"
            onClick={() => setAuthMode('sign-in')}
          >
            Back to sign in
          </button>
        )}
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-sky-950 text-white">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <header className="mb-10 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-sky-200">
              CloudCast
            </p>
            <h1 className="text-3xl font-semibold text-white">
              Secure upload. Protected playback.
            </h1>
            <p className="mt-1 text-sm text-slate-300">
              Cognito-authenticated multipart uploads, DynamoDB metadata, and
              CloudFront signed HLS streams.
            </p>
          </div>
          {authUser ? (
            <div className="flex items-center gap-3">
              <div className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200">
                {authUser.email ?? authUser.id}
              </div>
              <button
                onClick={handleSignOut}
                className="rounded-full border border-white/10 px-4 py-2 text-sm text-slate-200 transition hover:border-sky-400 hover:text-white"
              >
                Sign out
              </button>
            </div>
          ) : null}
        </header>

        {checkingAuth ? (
          <div className="rounded-3xl border border-white/10 bg-slate-900/40 p-8 text-center text-slate-300 shadow-2xl shadow-sky-900/20">
            Checking your session...
          </div>
        ) : null}

        {authUser && message ? (
          <div className="mb-6 rounded-2xl border border-sky-500/30 bg-sky-500/10 px-4 py-3 text-sm text-sky-100">
            {message}
          </div>
        ) : null}

        {!checkingAuth && !authUser ? (
          <div className="grid gap-6 md:grid-cols-2">
            {authCard}
            <div className="rounded-3xl border border-white/10 bg-slate-900/40 p-6 shadow-2xl shadow-cyan-900/20">
              <h2 className="text-xl font-semibold text-white">What you get</h2>
              <ul className="mt-4 space-y-3 text-sm text-slate-200">
                <li className="flex items-start gap-3">
                  <span className="mt-1 h-2 w-2 rounded-full bg-sky-400" />
                  Authenticated multipart uploads directly to S3 with presigned
                  parts.
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-1 h-2 w-2 rounded-full bg-cyan-400" />
                  DynamoDB-backed video catalog filtered by your Cognito
                  identity.
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-1 h-2 w-2 rounded-full bg-emerald-400" />
                  CloudFront-signed HLS playback guarded by short-lived URLs.
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-1 h-2 w-2 rounded-full bg-amber-400" />
                  Clear upload telemetry for large files (10MB parts by default).
                </li>
              </ul>
            </div>
          </div>
        ) : null}

        {authUser ? (
          <div className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
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
                      Files are chunked into 10MB parts and streamed via
                      presigned URLs.
                    </p>
                  </div>
                  <div className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-100">
                    {uploadState.stage === 'uploading'
                      ? `${uploadState.percent}%`
                      : 'Ready'}
                  </div>
                </div>

                <form className="mt-4 space-y-4" onSubmit={handleUpload}>
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="block text-sm text-slate-200">
                      Title (optional)
                      <input
                        type="text"
                        value={uploadForm.title}
                        onChange={(event) =>
                          setUploadForm((prev) => ({
                            ...prev,
                            title: event.target.value,
                          }))
                        }
                        className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white outline-none ring-2 ring-transparent transition focus:ring-sky-500/60"
                        placeholder="My launch demo"
                      />
                    </label>
                    <label className="block text-sm text-slate-200">
                      Video file
                      <input
                        type="file"
                        accept="video/*"
                        onChange={handleFileChange}
                        className="mt-1 w-full rounded-xl border border-dashed border-white/20 bg-slate-900/60 px-3 py-2 text-sm text-white outline-none ring-2 ring-transparent transition file:mr-3 file:rounded-lg file:border-0 file:bg-sky-500/20 file:px-3 file:py-2 file:text-sky-100 hover:border-sky-400/60 focus:ring-sky-500/60"
                      />
                    </label>
                  </div>

                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>Chunk size: 10MB · S3 multipart upload</span>
                    {uploadState.message && (
                      <span
                        className={
                          uploadState.stage === 'error'
                            ? 'text-rose-200'
                            : 'text-sky-200'
                        }
                      >
                        {uploadState.message}
                      </span>
                    )}
                  </div>

                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
                    <div
                      className={`h-full rounded-full transition-all ${
                        uploadState.stage === 'error'
                          ? 'bg-rose-400'
                          : 'bg-gradient-to-r from-sky-400 to-cyan-300'
                      }`}
                      style={{ width: `${uploadState.percent}%` }}
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="submit"
                      disabled={uploadState.stage === 'uploading'}
                      className="rounded-xl bg-gradient-to-r from-sky-500 to-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:from-sky-400 hover:to-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {uploadState.stage === 'uploading'
                        ? 'Uploading...'
                        : 'Start upload'}
                    </button>
                    <span className="text-xs text-slate-400">
                      S3 key pattern: user/video/raw/file
                    </span>
                  </div>
                </form>
              </div>

              <div className="rounded-3xl border border-white/10 bg-slate-900/40 p-6 shadow-2xl shadow-sky-900/20">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-sky-200">
                      Playback
                    </p>
                    <h2 className="text-xl font-semibold text-white">
                      CloudFront signed HLS
                    </h2>
                  </div>
                  {activeStream && (
                    <StatusBadge status="ready" />
                  )}
                </div>
                {activeStream ? (
                  <div className="mt-4">
                    <HlsPlayer
                      src={activeStream.url}
                      title={activeStream.title}
                    />
                    <p className="mt-2 text-xs text-slate-400">
                      Stream URL is short-lived per request.
                    </p>
                  </div>
                ) : (
                  <div className="mt-6 rounded-2xl border border-dashed border-white/20 bg-slate-900/40 p-6 text-sm text-slate-300">
                    Choose a video marked ready to stream a signed URL.
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-slate-900/40 p-6 shadow-2xl shadow-sky-900/20">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-sky-200">
                    Library
                  </p>
                  <h2 className="text-xl font-semibold text-white">
                    Your uploads
                  </h2>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={loadVideos}
                    className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-sky-400 hover:text-white"
                  >
                    Refresh
                  </button>
                  <span className="text-xs text-slate-400">
                    {videosLoading ? 'Updating…' : ''}
                  </span>
                </div>
              </div>

              {videos.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-white/20 bg-slate-900/40 p-6 text-sm text-slate-300">
                  No videos yet. Upload to see processing state and playback.
                </div>
              ) : (
                <div className="space-y-3">
                  {videos.map((video) => (
                    <div
                      key={video.id}
                      className={`flex flex-col gap-3 rounded-2xl border border-white/10 bg-slate-900/50 p-4 transition hover:border-sky-400/40 md:flex-row md:items-center md:justify-between ${
                        activeStream?.videoId === video.id
                          ? 'ring-2 ring-sky-500/60'
                          : ''
                      }`}
                    >
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-3">
                          <h3 className="text-lg font-semibold text-white">
                            {video.title || 'Untitled video'}
                          </h3>
                          <StatusBadge status={video.status} />
                        </div>
                        <p className="text-xs text-slate-400">
                          {formatDate(video.createdAt)} · ID: {video.id}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-3">
                        <button
                          onClick={() => handleStartStream(video)}
                          disabled={video.status !== 'ready'}
                          className="rounded-xl border border-white/10 px-3 py-2 text-sm font-semibold text-slate-100 transition hover:border-sky-400 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {video.status === 'ready'
                            ? 'Stream'
                            : 'Awaiting HLS'}
                        </button>
                        <button
                          onClick={() => handleDeleteVideo(video)}
                          className="rounded-xl border border-rose-500/40 px-3 py-2 text-sm font-semibold text-rose-100 transition hover:border-rose-400 hover:text-white"
                        >
                          Delete
                        </button>
                        <div className="text-xs text-slate-400">
                          {video.status === 'processing'
                            ? 'MediaConvert in progress'
                            : video.status === 'ready'
                              ? 'Signed per playback'
                              : video.status === 'failed'
                                ? 'Processing failed'
                                : 'Uploading to raw bucket'}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}

export default App
