import { corsHeaders, handleCors } from '../_shared/cors.ts'
import {
  supabaseAdmin,
  getAuthUser,
  checkNotSuspended,
  errorResponse,
  successResponse,
} from '../_shared/supabaseAdmin.ts'
import { requireFullVideoAccess } from '../_shared/videoAccess.ts'

// @ts-ignore
declare const Deno: { env: { get(key: string): string | undefined } }

const GEMINI_MODEL = Deno.env.get('GEMINI_MODEL') || 'gemini-2.5-flash-lite'
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta'

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function uploadToGeminiFileApi(videoBytes: Uint8Array, mimeType: string, apiKey: string): Promise<string> {
  const startRes = await fetch(
    `${GEMINI_API_BASE}/files?key=${apiKey}`,
    {
      method: 'POST',
      headers: {
        'X-Goog-Upload-Protocol': 'resumable',
        'X-Goog-Upload-Command': 'start',
        'X-Goog-Upload-Header-Content-Length': String(videoBytes.byteLength),
        'X-Goog-Upload-Header-Content-Type': mimeType,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ file: { display_name: 'sinau-video' } }),
    }
  )

  const uploadUrl = startRes.headers.get('x-goog-upload-url')
  if (!uploadUrl) throw new Error('Failed to get upload URL from Gemini File API')

  const uploadRes = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Content-Length': String(videoBytes.byteLength),
      'X-Goog-Upload-Offset': '0',
      'X-Goog-Upload-Command': 'upload, finalize',
    },
    body: videoBytes,
  })

  const uploadData = await uploadRes.json()
  if (!uploadData.file?.uri) throw new Error('File upload to Gemini failed')

  const fileUri = uploadData.file.uri
  const fileName = uploadData.file.name
  for (let i = 0; i < 20; i++) {
    const statusRes = await fetch(`${GEMINI_API_BASE}/${fileName}?key=${apiKey}`)
    const statusData = await statusRes.json()
    if (statusData.state === 'ACTIVE') return fileUri
    if (statusData.state === 'FAILED') throw new Error('Gemini file processing failed')
    await sleep(3000)
  }
  throw new Error('Gemini file did not become ACTIVE in time')
}

async function callGeminiWithVideo(fileUri: string, apiKey: string): Promise<string> {
  const prompt = `Berdasarkan video pembelajaran ini, buatkan ringkasan materi dalam 3-5 kalimat yang jelas dan mudah dipahami mahasiswa. Fokus pada poin-poin utama dan konsep kunci.

Balas HANYA dalam format JSON berikut, tanpa teks tambahan apapun:
{
  "summary": "ringkasan materi di sini"
}`

  let lastError: Error | null = null
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await sleep(5000 * attempt)

    const res = await fetch(
      `${GEMINI_API_BASE}/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { file_data: { mime_type: 'video/mp4', file_uri: fileUri } },
              { text: prompt },
            ],
          }],
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.3,
            maxOutputTokens: 1024,
          },
        }),
      }
    )

    if (res.status === 429) { lastError = new Error('Gemini rate limit hit'); continue }

    const data = await res.json()
    if (!res.ok) throw new Error(data.error?.message || 'Gemini API error')

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text
    if (!text) throw new Error('Empty Gemini response')

    const parsed = JSON.parse(text)
    return parsed.summary
  }
  throw lastError ?? new Error('Gemini call failed after retries')
}

function generateFallbackFromDescription(description: string): string {
  return description?.trim() || 'Ringkasan tidak tersedia — tidak ada deskripsi video.'
}

Deno.serve(async (req: Request) => {
  const corsRes = handleCors(req)
  if (corsRes) return corsRes

  try {
    // 1. Authenticate user
    const user = await getAuthUser(req)
    await checkNotSuspended(user.id)

    const { video_id } = await req.json()
    if (!video_id) return errorResponse('video_id is required')
    const video = await requireFullVideoAccess(user.id, video_id)

    // 2. Cek apakah sudah ada video-level summary (cache)
    const { data: videoLevelSummary } = await supabaseAdmin
      .from('quiz_results')
      .select('*')
      .eq('video_id', video_id)
      .eq('is_video_level', true)
      .maybeSingle()

    if (videoLevelSummary?.ai_summary) {
      return successResponse({ 
        ai_summary: videoLevelSummary.ai_summary,
        is_fallback: videoLevelSummary.is_fallback,
        cached: true 
      })
    }

    const apiKey = Deno.env.get('GEMINI_API_KEY')
    let summary: string
    let isFallback = false

    // 4. Coba Gemini video processing
    if (apiKey && video.video_file_url) {
      try {
        const { data: fileData, error: fileErr } = await supabaseAdmin
          .storage
          .from('videos')
          .download(video.video_file_url)

        if (fileErr) throw new Error('Failed to download video: ' + fileErr.message)

        const videoBytes = new Uint8Array(await fileData.arrayBuffer())
        const fileUri = await uploadToGeminiFileApi(videoBytes, 'video/mp4', apiKey)
        summary = await callGeminiWithVideo(fileUri, apiKey)
      } catch (geminiErr: unknown) {
        console.error('Gemini processing failed, using fallback:', (geminiErr as Error).message)
        summary = generateFallbackFromDescription(video.deskripsi)
        isFallback = true
      }
    } else {
      summary = generateFallbackFromDescription(video.deskripsi)
      isFallback = true
    }

    // 5. Simpan sebagai video-level summary (user_id NULL = shared cache)
    // Update existing quiz_results or insert new
    if (videoLevelSummary) {
      const { error: updateErr } = await supabaseAdmin
        .from('quiz_results')
        .update({
          ai_summary: summary,
          is_fallback: isFallback,
        })
        .eq('id', videoLevelSummary.id)

      if (updateErr) {
        console.error('Failed to update summary:', updateErr)
      }
      return successResponse({ ai_summary: summary, is_fallback: isFallback, cached: false })
    } else {
      const { error: saveErr } = await supabaseAdmin
        .from('quiz_results')
        .insert({
          video_id,
          user_id: user.id,
          ai_summary: summary,
          questions_json: '[]',
          is_fallback: isFallback,
          is_video_level: true,
        })

      if (saveErr) {
        // Mungkin race condition — ambil yang sudah ada
        const { data: existing } = await supabaseAdmin
          .from('quiz_results')
          .select('*')
          .eq('video_id', video_id)
          .eq('is_video_level', true)
          .maybeSingle()
        if (existing) return successResponse({ ai_summary: existing.ai_summary, is_fallback: existing.is_fallback, cached: true })
        return errorResponse('Failed to save summary: ' + saveErr.message, 500)
      }

      return successResponse({ ai_summary: summary, is_fallback: isFallback, cached: false })
    }
  } catch (err: unknown) {
    const e = err as Error
    const status = e.message === 'Account suspended' ? 403
      : e.message?.includes('token') ? 401
      : 500
    return new Response(JSON.stringify({ error: e.message }), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
