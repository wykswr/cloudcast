import { type ChangeEvent, type FormEvent, useEffect, useState } from 'react'
import {
  confirmSignUp,
  fetchAuthSession,
  getCurrentUser,
  signIn,
  signOut,
  signUp,
} from 'aws-amplify/auth'
import AuthCard from './components/AuthCard'
import UploadForm from './components/UploadForm'
import PlaybackPanel from './components/PlaybackPanel'
import VideoLibrary from './components/VideoLibrary'
import {
  type AuthMode,
  type AuthUser,
  type StreamSelection,
  type UploadFormState,
  type UploadState,
  type VideoItem,
} from './types'
import { formatError } from './utils/format'
import { fetchVideos, requestStream, removeVideo } from './lib/api'
import { getUploadError, multipartUpload } from './lib/uploads'

type AuthFormState = {
  email: string
  password: string
}

const initialUploadState: UploadState = { stage: 'idle', percent: 0 }
const initialUploadForm: UploadFormState = { title: '', file: null }
const initialAuthForm: AuthFormState = { email: '', password: '' }

function App() {
  const [authUser, setAuthUser] = useState<AuthUser | null>(null)
  const [authMode, setAuthMode] = useState<AuthMode>('sign-in')
  const [authForm, setAuthForm] = useState<AuthFormState>(initialAuthForm)
  const [confirmCode, setConfirmCode] = useState('')
  const [pendingEmail, setPendingEmail] = useState('')
  const [authError, setAuthError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [checkingAuth, setCheckingAuth] = useState(true)

  const [videos, setVideos] = useState<VideoItem[]>([])
  const [videosLoading, setVideosLoading] = useState(false)

  const [uploadForm, setUploadForm] =
    useState<UploadFormState>(initialUploadForm)
  const [uploadState, setUploadState] =
    useState<UploadState>(initialUploadState)

  const [activeStream, setActiveStream] = useState<StreamSelection | null>(null)

  const loadVideos = async () => {
    setVideosLoading(true)
    try {
      const items = await fetchVideos()
      setVideos(items)
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

  const handleAuthFormChange = (changes: Partial<AuthFormState>): void => {
    setAuthForm((prev) => ({ ...prev, ...changes }))
  }

  const handleSignIn = async (event: FormEvent<HTMLFormElement>) => {
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

  const handleSignUp = async (event: FormEvent<HTMLFormElement>) => {
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

  const handleConfirm = async (event: FormEvent<HTMLFormElement>) => {
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
    setAuthMode('sign-in')
    setConfirmCode('')
    setPendingEmail('')
    setMessage(null)
    setAuthError(null)
    setAuthForm(initialAuthForm)
    setUploadForm(initialUploadForm)
    setUploadState(initialUploadState)
  }

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null
    setUploadForm((prev) => ({ ...prev, file }))
  }

  const handleUpload = async (event: FormEvent<HTMLFormElement>) => {
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
      await multipartUpload({
        file: uploadForm.file,
        title: uploadForm.title || uploadForm.file.name,
        onProgress: setUploadState,
      })
      setUploadForm(initialUploadForm)
      await loadVideos()
    } catch (error) {
      setUploadState((prev) => ({
        ...prev,
        ...getUploadError(error),
      }))
    }
  }

  const handleStartStream = async (video: VideoItem) => {
    try {
      const data = await requestStream(video.id)
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
      await removeVideo(video.id)
      setVideos((prev) => prev.filter((item) => item.id !== video.id))
      if (activeStream?.videoId === video.id) {
        setActiveStream(null)
      }
      setMessage('Video deleted')
    } catch (error) {
      setMessage(formatError(error))
    }
  }

  const authSubmitHandler =
    authMode === 'sign-in'
      ? handleSignIn
      : authMode === 'sign-up'
        ? handleSignUp
        : handleConfirm

  return (
    <div className="min-h-screen bg-linear-to-br from-slate-950 via-slate-900 to-sky-950 text-white">
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
            <AuthCard
              mode={authMode}
              authForm={authForm}
              confirmCode={confirmCode}
              error={authError}
              message={message}
              onSubmit={authSubmitHandler}
              onAuthFormChange={handleAuthFormChange}
              onConfirmCodeChange={(value) => setConfirmCode(value)}
              onSwitchMode={(mode) => setAuthMode(mode)}
            />
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
              <UploadForm
                uploadForm={uploadForm}
                uploadState={uploadState}
                onTitleChange={(value) =>
                  setUploadForm((prev) => ({ ...prev, title: value }))
                }
                onFileChange={handleFileChange}
                onSubmit={handleUpload}
              />
              <PlaybackPanel activeStream={activeStream} />
            </div>

            <VideoLibrary
              videos={videos}
              loading={videosLoading}
              activeStream={activeStream}
              onRefresh={loadVideos}
              onSelect={handleStartStream}
              onDelete={handleDeleteVideo}
            />
          </div>
        ) : null}
      </div>
    </div>
  )
}

export default App
