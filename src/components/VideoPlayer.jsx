import { useRef, useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import { useWalletStore } from '../stores/walletStore'
import { useAppSetting } from '../hooks/useAppSettings'
import PaywallModal from './PaywallModal'
import SummaryCard from './SummaryCard'
import toast from 'react-hot-toast'
import {
  Loader2, Play, Pause, Volume2, VolumeX, Maximize, Minimize,
  RotateCcw, RotateCw, Settings
} from 'lucide-react'

const DEFAULT_PAYWALL_TIME = 60
const DEFAULT_PAYWALL_COIN = 1

function formatTime(seconds) {
  if (!seconds || isNaN(seconds)) return '0:00'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

export default function VideoPlayer({ video, hasPaidAlready, onPaymentSuccess }) {
  const videoRef = useRef(null)
  const containerRef = useRef(null)
  const progressRef = useRef(null)
  const hideControlsTimer = useRef(null)

  const [signedUrl, setSignedUrl] = useState(null)
  const [urlLoading, setUrlLoading] = useState(true)
  const [urlError, setUrlError] = useState('')

  // Custom controls state
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(1)
  const [isMuted, setIsMuted] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [showControls, setShowControls] = useState(true)
  const [buffered, setBuffered] = useState(0)
  const [isSeeking, setIsSeeking] = useState(false)
  const [playbackRate, setPlaybackRate] = useState(1)
  const [showSpeedMenu, setShowSpeedMenu] = useState(false)
  const [skipIndicator, setSkipIndicator] = useState(null) // { side: 'left'|'right', text: string }

  // Paywall state
  const [showPaywall, setShowPaywall] = useState(false)
  const [paywallTriggered, setPaywallTriggered] = useState(false)
  const [isPaidSession, setIsPaidSession] = useState(hasPaidAlready)

  // Summary state
  const [videoEnded, setVideoEnded] = useState(false)
  const [summaryData, setSummaryData] = useState(null)
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [existingSummaryChecked, setExistingSummaryChecked] = useState(false)
  const [summaryError, setSummaryError] = useState(null)

  const { profile } = useAuthStore()
  const { getSignedVideoUrl, purchaseContinue, generateSummary } = useWalletStore()
  const navigate = useNavigate()

  const { value: previewSecondsStr } = useAppSetting('free_preview_seconds', String(DEFAULT_PAYWALL_TIME))
  const { value: paywallCoinStr } = useAppSetting('paywall_coin', String(DEFAULT_PAYWALL_COIN))
  const PAYWALL_TIME = parseInt(previewSecondsStr ?? String(DEFAULT_PAYWALL_TIME)) || DEFAULT_PAYWALL_TIME
  const PAYWALL_COIN = parseInt(paywallCoinStr ?? String(DEFAULT_PAYWALL_COIN)) || DEFAULT_PAYWALL_COIN
  const needsPaywall = video?.durasi_detik > PAYWALL_TIME && (video?.harga_koin ?? PAYWALL_COIN) > 0

  // ── Load signed URL ──────────────────────────────────
  useEffect(() => {
    if (!video?.id) return
    setUrlLoading(true)
    getSignedVideoUrl(video.id)
      .then((url) => { setSignedUrl(url); setUrlError('') })
      .catch((err) => { setUrlError(err.message || 'Gagal memuat video') })
      .finally(() => setUrlLoading(false))
  }, [video?.id])

  // ── Check existing summary ──────────────────────────────
  useEffect(() => {
    if (!video?.id || existingSummaryChecked) return
    supabase
      .from('quiz_results')
      .select('*')
      .eq('video_id', video.id)
      .eq('is_video_level', true)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setSummaryData(data)
        setExistingSummaryChecked(true)
      })
  }, [video?.id, existingSummaryChecked])

  // ── Auto-hide controls ───────────────────────────────
  const resetHideTimer = useCallback(() => {
    setShowControls(true)
    clearTimeout(hideControlsTimer.current)
    if (isPlaying) {
      hideControlsTimer.current = setTimeout(() => setShowControls(false), 3000)
    }
  }, [isPlaying])

  useEffect(() => {
    if (!isPlaying) {
      setShowControls(true)
      clearTimeout(hideControlsTimer.current)
    } else {
      resetHideTimer()
    }
    return () => clearTimeout(hideControlsTimer.current)
  }, [isPlaying])

  // ── Listen to fullscreen changes ─────────────────────
  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement)
    }
    document.addEventListener('fullscreenchange', handleFsChange)
    return () => document.removeEventListener('fullscreenchange', handleFsChange)
  }, [])

  // ── Video event handlers ─────────────────────────────
  const handleLoadedMetadata = () => {
    const vid = videoRef.current
    if (vid) {
      setDuration(vid.duration)
      setVolume(vid.volume)
    }
  }

  const handleTimeUpdate = useCallback(() => {
    const vid = videoRef.current
    if (!vid || isSeeking) return

    setCurrentTime(vid.currentTime)

    // Update buffer
    if (vid.buffered.length > 0) {
      setBuffered(vid.buffered.end(vid.buffered.length - 1))
    }

    // Paywall enforcement - video stops at 1 minute
    if (needsPaywall && !isPaidSession && !paywallTriggered) {
      if (vid.currentTime >= PAYWALL_TIME) {
        vid.pause()
        setIsPlaying(false)
        setShowPaywall(true)
        setPaywallTriggered(true)
      }
    }
  }, [needsPaywall, isPaidSession, paywallTriggered, isSeeking, PAYWALL_TIME])

  const handleSeeking = useCallback(() => {
    const vid = videoRef.current
    if (!vid || !needsPaywall || isPaidSession) return
    if (vid.currentTime > PAYWALL_TIME) {
      vid.currentTime = PAYWALL_TIME - 0.1
    }
  }, [needsPaywall, isPaidSession, PAYWALL_TIME])

  const handleEnded = useCallback(async () => {
    setIsPlaying(false)
    setVideoEnded(true)

    setSummaryLoading(true)
    setSummaryError(null)

    // Try up to 2 times with edge function
    let lastError = null
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        if (attempt > 0) await new Promise(r => setTimeout(r, 2000))
        const result = await generateSummary(video.id)
        setSummaryData(result)
        setSummaryLoading(false)
        return
      } catch (err) {
        lastError = err
        console.warn(`[VideoPlayer] Summary generation attempt ${attempt + 1} failed:`, err.message)
      }
    }

    // Fallback: create summary from video description client-side
    try {
      const { data: videoData } = await supabase
        .from('videos')
        .select('deskripsi, judul, kategori')
        .eq('id', video.id)
        .single()

      if (videoData?.deskripsi) {
        const fallbackSummary = {
          ai_summary: videoData.deskripsi,
          questions_json: '[]',
          is_fallback: true,
        }
        setSummaryData(fallbackSummary)
        setSummaryLoading(false)
        return
      }
    } catch (fbErr) {
      console.warn('[VideoPlayer] Fallback summary also failed:', fbErr)
    }

    // Final failure
    setSummaryError(lastError?.message || 'Gagal membuat ringkasan')
    setSummaryLoading(false)
  }, [profile?.id, video?.id, generateSummary])

  // ── Player controls ──────────────────────────────────
  const togglePlay = () => {
    const vid = videoRef.current
    if (!vid) return
    if (vid.paused) {
      vid.play()
      setIsPlaying(true)
    } else {
      vid.pause()
      setIsPlaying(false)
    }
    resetHideTimer()
  }

  const skip = (seconds) => {
    const vid = videoRef.current
    if (!vid) return
    const newTime = Math.max(0, Math.min(vid.duration, vid.currentTime + seconds))

    // Enforce paywall limit - cannot skip past 1 minute if not paid
    if (needsPaywall && !isPaidSession && newTime > PAYWALL_TIME) {
      vid.currentTime = PAYWALL_TIME - 0.1
    } else {
      vid.currentTime = newTime
    }
    setCurrentTime(vid.currentTime)
    resetHideTimer()

    // Show skip indicator
    setSkipIndicator({
      side: seconds > 0 ? 'right' : 'left',
      text: `${Math.abs(seconds)} detik`
    })
    setTimeout(() => setSkipIndicator(null), 800)
  }

  const handleProgressClick = (e) => {
    const vid = videoRef.current
    const bar = progressRef.current
    if (!vid || !bar) return

    const rect = bar.getBoundingClientRect()
    const pos = (e.clientX - rect.left) / rect.width
    const newTime = pos * vid.duration

    // Cannot seek past paywall if not paid
    if (needsPaywall && !isPaidSession && newTime > PAYWALL_TIME) {
      vid.currentTime = PAYWALL_TIME - 0.1
    } else {
      vid.currentTime = newTime
    }
    setCurrentTime(vid.currentTime)
    resetHideTimer()
  }

  const handleVolumeChange = (e) => {
    const vid = videoRef.current
    if (!vid) return
    const val = parseFloat(e.target.value)
    vid.volume = val
    setVolume(val)
    setIsMuted(val === 0)
  }

  const toggleMute = () => {
    const vid = videoRef.current
    if (!vid) return
    vid.muted = !vid.muted
    setIsMuted(vid.muted)
  }

  const toggleFullscreen = async () => {
    const container = containerRef.current
    if (!container) return
    if (!document.fullscreenElement) {
      await container.requestFullscreen?.()
    } else {
      await document.exitFullscreen?.()
    }
  }

  const changeSpeed = (rate) => {
    const vid = videoRef.current
    if (vid) {
      vid.playbackRate = rate
      setPlaybackRate(rate)
    }
    setShowSpeedMenu(false)
    resetHideTimer()
  }

  // ── Keyboard shortcuts ───────────────────────────────
  useEffect(() => {
    const handleKey = (e) => {
      // Only handle if video player is in focus area
      if (!containerRef.current?.contains(document.activeElement) && document.activeElement !== document.body) return

      switch (e.key) {
        case ' ':
        case 'k':
          e.preventDefault()
          togglePlay()
          break
        case 'ArrowLeft':
        case 'j':
          e.preventDefault()
          skip(-10)
          break
        case 'ArrowRight':
        case 'l':
          e.preventDefault()
          skip(10)
          break
        case 'ArrowUp':
          e.preventDefault()
          if (videoRef.current) {
            const newVol = Math.min(1, videoRef.current.volume + 0.1)
            videoRef.current.volume = newVol
            setVolume(newVol)
            setIsMuted(false)
          }
          break
        case 'ArrowDown':
          e.preventDefault()
          if (videoRef.current) {
            const newVol = Math.max(0, videoRef.current.volume - 0.1)
            videoRef.current.volume = newVol
            setVolume(newVol)
            setIsMuted(newVol === 0)
          }
          break
        case 'f':
          e.preventDefault()
          toggleFullscreen()
          break
        case 'm':
          e.preventDefault()
          toggleMute()
          break
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [isPlaying, needsPaywall, isPaidSession, PAYWALL_TIME])

  // ── Pay handler ──────────────────────────────────────
  const handlePay = async () => {
    try {
      await purchaseContinue(video.id)
      setIsPaidSession(true)
      setShowPaywall(false)
      onPaymentSuccess?.()
      toast.success('Pembayaran berhasil! Selamat belajar 🎉')
      const vid = videoRef.current
      if (vid) {
        vid.currentTime = PAYWALL_TIME
        vid.play()
        setIsPlaying(true)
      }
    } catch (err) {
      toast.error(err.message || 'Pembayaran gagal. Coba lagi.')
      throw err
    }
  }

  const handleClosePaywall = () => {
    setShowPaywall(false)
    navigate(-1)
  }

  // ── Double-tap to skip ───────────────────────────────
  const lastTap = useRef({ time: 0, x: 0 })
  const handleContainerClick = (e) => {
    const now = Date.now()
    const dt = now - lastTap.current.time

    // Ignore clicks on controls bar
    if (e.target.closest('.video-controls-bar')) return

    if (dt < 300) {
      // Double tap
      const rect = containerRef.current.getBoundingClientRect()
      const x = e.clientX - rect.left
      const half = rect.width / 2
      if (x < half) {
        skip(-10)
      } else {
        skip(10)
      }
    } else {
      // Single tap — toggle controls or play/pause
      resetHideTimer()
    }
    lastTap.current = { time: now, x: e.clientX }
  }

  // ── Progress percentage ──────────────────────────────
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0
  const bufferedPct = duration > 0 ? (buffered / duration) * 100 : 0
  const paywallPct = duration > 0 ? (PAYWALL_TIME / duration) * 100 : 0

  // ── Loading state ────────────────────────────────────
  if (urlLoading) {
    return (
      <div className="custom-video-wrapper">
        <div className="custom-video-container loading-state">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 text-[#D62839] animate-spin" />
            <p className="text-white/60 text-sm">Memuat video...</p>
          </div>
        </div>
      </div>
    )
  }

  if (urlError) {
    return (
      <div className="custom-video-wrapper">
        <div className="custom-video-container loading-state">
          <div className="text-center">
            <p className="text-white/80 font-medium mb-1">Gagal memuat video</p>
            <p className="text-white/40 text-sm">{urlError}</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Player */}
      <div
        ref={containerRef}
        className={`custom-video-wrapper ${isFullscreen ? 'fullscreen' : ''}`}
        onMouseMove={resetHideTimer}
        onMouseLeave={() => isPlaying && setShowControls(false)}
        onClick={handleContainerClick}
      >
        <div className="custom-video-container">
          <video
            ref={videoRef}
            src={signedUrl}
            playsInline
            preload="metadata"
            controlsList="nodownload noremoteplayback"
            disablePictureInPicture
            onContextMenu={(e) => e.preventDefault()}
            onLoadedMetadata={handleLoadedMetadata}
            onTimeUpdate={handleTimeUpdate}
            onSeeking={handleSeeking}
            onEnded={handleEnded}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            className="custom-video-element"
          />

          {/* Center Play Button (shown when paused) */}
          {!isPlaying && !showPaywall && (
            <button
              onClick={(e) => { e.stopPropagation(); togglePlay() }}
              className="center-play-btn"
            >
              <Play size={32} className="ml-1" />
            </button>
          )}

          {/* Skip indicators */}
          {skipIndicator && (
            <div className={`skip-indicator ${skipIndicator.side}`}>
              {skipIndicator.side === 'left' ? <RotateCcw size={24} /> : <RotateCw size={24} />}
              <span>{skipIndicator.text}</span>
            </div>
          )}

          {/* Controls overlay */}
          <div className={`video-controls-bar ${showControls || !isPlaying ? 'visible' : ''}`}
            onClick={(e) => e.stopPropagation()}>

            {/* Progress bar */}
            <div
              ref={progressRef}
              className="progress-bar-wrapper"
              onClick={handleProgressClick}
            >
              <div className="progress-bar-track">
                {/* Buffered */}
                <div className="progress-buffered" style={{ width: `${bufferedPct}%` }} />
                {/* Paywall marker */}
                {needsPaywall && !isPaidSession && (
                  <div className="progress-paywall-marker" style={{ left: `${paywallPct}%` }} />
                )}
                {/* Progress */}
                <div className="progress-filled" style={{ width: `${progress}%` }}>
                  <div className="progress-thumb" />
                </div>
              </div>
            </div>

            {/* Bottom controls row */}
            <div className="controls-row">
              <div className="controls-left">
                {/* Play/Pause */}
                <button onClick={(e) => { e.stopPropagation(); togglePlay() }} className="ctrl-btn" title={isPlaying ? 'Pause (k)' : 'Play (k)'}>
                  {isPlaying ? <Pause size={18} /> : <Play size={18} className="ml-0.5" />}
                </button>

                {/* Skip -10s */}
                <button onClick={(e) => { e.stopPropagation(); skip(-10) }} className="ctrl-btn" title="Mundur 10 detik (j)">
                  <RotateCcw size={16} />
                </button>

                {/* Skip +10s */}
                <button onClick={(e) => { e.stopPropagation(); skip(10) }} className="ctrl-btn" title="Maju 10 detik (l)">
                  <RotateCw size={16} />
                </button>

                {/* Time */}
                <span className="time-display">
                  {formatTime(currentTime)} / {formatTime(duration)}
                </span>
              </div>

              <div className="controls-right">
                {/* Volume */}
                <div className="volume-group">
                  <button onClick={(e) => { e.stopPropagation(); toggleMute() }} className="ctrl-btn" title="Mute (m)">
                    {isMuted || volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
                  </button>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={isMuted ? 0 : volume}
                    onChange={handleVolumeChange}
                    className="volume-slider"
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>

                {/* Speed */}
                <div className="speed-group">
                  <button onClick={(e) => { e.stopPropagation(); setShowSpeedMenu(!showSpeedMenu) }} className="ctrl-btn speed-btn" title="Kecepatan">
                    <Settings size={14} />
                    <span>{playbackRate}x</span>
                  </button>
                  {showSpeedMenu && (
                    <div className="speed-menu" onClick={(e) => e.stopPropagation()}>
                      {[0.5, 0.75, 1, 1.25, 1.5, 2].map(r => (
                        <button
                          key={r}
                          onClick={() => changeSpeed(r)}
                          className={`speed-option ${playbackRate === r ? 'active' : ''}`}
                        >
                          {r}x
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Fullscreen */}
                <button onClick={(e) => { e.stopPropagation(); toggleFullscreen() }} className="ctrl-btn" title="Fullscreen (f)">
                  {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
                </button>
              </div>
            </div>
          </div>

          {/* Paywall overlay */}
          {showPaywall && (
            <PaywallModal
              video={{ ...video, harga_koin: PAYWALL_COIN }}
              userBalance={profile?.saldo_koin ?? 0}
              onPay={handlePay}
              onClose={handleClosePaywall}
            />
          )}
        </div>
      </div>

      {/* Paywall progress indicator */}
      {needsPaywall && !isPaidSession && !showPaywall && (
        <div className="bg-[#FAFAFA] border border-[#F1D4D6] rounded-xl px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[#6B7280] text-xs font-medium">Preview Gratis</span>
            <span className="text-[#D62839] text-xs font-semibold">
              {Math.floor(PAYWALL_TIME / 60)}:{String(PAYWALL_TIME % 60).padStart(2, '0')} / {Math.floor(video.durasi_detik / 60)}:{String(video.durasi_detik % 60).padStart(2, '0')}
            </span>
          </div>
          <div className="h-1.5 bg-[#F1D4D6] rounded-full overflow-hidden">
            <div
              className="h-full bg-[#D62839] rounded-full transition-all"
              style={{ width: `${(PAYWALL_TIME / video.durasi_detik) * 100}%` }}
            />
          </div>
          <p className="text-[#6B7280] text-xs mt-1.5">
            Video akan berhenti di menit ke-{Math.floor(PAYWALL_TIME / 60)}. Lanjutkan dengan {PAYWALL_COIN} koin.
          </p>
        </div>
      )}

      {/* Summary section */}
      {videoEnded && (
        <div className="mt-2">
          {summaryLoading ? (
            <div className="bg-white border border-[#F1D4D6] rounded-2xl p-8 flex flex-col items-center gap-3">
              <Loader2 className="w-8 h-8 text-[#D62839] animate-spin" />
              <p className="text-[#6B7280] text-sm font-medium">AI sedang membuat ringkasan...</p>
              <p className="text-[#6B7280] text-xs">Ini mungkin membutuhkan beberapa detik</p>
            </div>
          ) : summaryData ? (
            <SummaryCard summaryData={summaryData} />
          ) : summaryError ? (
            <div className="bg-white border border-[#FEE2E2] rounded-2xl p-6 flex flex-col items-center gap-3">
              <div className="w-12 h-12 bg-[#FEE2E2] rounded-full flex items-center justify-center">
                <RotateCcw className="w-5 h-5 text-[#DC2626]" />
              </div>
              <p className="text-[#1F2937] text-sm font-semibold">Gagal membuat ringkasan</p>
              <p className="text-[#6B7280] text-xs text-center max-w-xs">{summaryError}</p>
              <button
                onClick={() => {
                  setSummaryError(null)
                  setVideoEnded(false)
                  setTimeout(() => setVideoEnded(true), 100)
                }}
                className="flex items-center gap-1.5 bg-[#D62839] hover:bg-[#B71C2B] text-white font-semibold px-5 py-2.5 rounded-xl text-sm transition-colors"
              >
                <RotateCcw size={14} /> Coba Lagi
              </button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}
