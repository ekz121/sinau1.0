import { corsHeaders, handleCors } from '../_shared/cors.ts'
import {
  supabaseAdmin,
  getAuthUser,
  checkNotSuspended,
  errorResponse,
  successResponse,
} from '../_shared/supabaseAdmin.ts'

// @ts-ignore
declare const Deno: { env: { get(key: string): string | undefined } }

const GEMINI_MODEL = 'gemini-2.0-flash-exp'
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

async function callGeminiWithVideo(fileUri: string, apiKey: string): Promise<unknown> {
  const prompt = `Berdasarkan video pembelajaran ini, buatkan:
1. Ringkasan materi dalam 3-5 kalimat yang jelas dan mudah dipahami mahasiswa.
2. Lima soal pilihan ganda dengan 4 opsi jawaban masing-masing, beserta jawaban yang benar dan penjelasan singkat.

Balas HANYA dalam format JSON berikut, tanpa teks tambahan apapun:
{
  "summary": "ringkasan materi di sini",
  "questions": [
    {
      "question": "teks soal",
      "options": ["opsi A", "opsi B", "opsi C", "opsi D"],
      "correct_answer": "opsi yang benar (harus sama persis dengan salah satu opsi)",
      "explanation": "penjelasan singkat mengapa jawaban ini benar"
    }
  ]
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
            maxOutputTokens: 2048,
          },
        }),
      }
    )

    if (res.status === 429) { lastError = new Error('Gemini rate limit hit'); continue }

    const data = await res.json()
    if (!res.ok) throw new Error(data.error?.message || 'Gemini API error')

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text
    if (!text) throw new Error('Empty Gemini response')

    return JSON.parse(text)
  }
  throw lastError ?? new Error('Gemini call failed after retries')
}

function generateFallbackFromDescription(description: string): unknown {
  return {
    summary: description?.trim() || 'Ringkasan tidak tersedia — tidak ada deskripsi video.',
    questions: [
      {
        question: 'Apa topik utama dari video ini?',
        options: ['Sesuai deskripsi kreator', 'Tidak ada informasi', 'Materi lain', 'Tidak relevan'],
        correct_answer: 'Sesuai deskripsi kreator',
        explanation: 'Jawaban ini berdasarkan deskripsi yang diberikan kreator video.',
      },
      {
        question: 'Mengapa penting mempelajari topik ini?',
        options: ['Menambah wawasan akademis', 'Tidak penting', 'Hanya untuk nilai', 'Sudah dipahami semua'],
        correct_answer: 'Menambah wawasan akademis',
        explanation: 'Mempelajari materi baru selalu bermanfaat untuk pengembangan diri.',
      },
      {
        question: 'Bagaimana cara terbaik memahami materi video ini?',
        options: [
          'Tonton dengan fokus dan catat poin penting',
          'Cukup sekali tonton tanpa mencatat',
          'Skip langsung ke kuis',
          'Tidak perlu ditonton sama sekali',
        ],
        correct_answer: 'Tonton dengan fokus dan catat poin penting',
        explanation: 'Mencatat sambil menonton membantu retensi informasi lebih baik.',
      },
    ],
  }
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

    // 2. Cek apakah sudah ada video-level quiz (cache)
    //    Video-level quiz dipakai semua user — tidak generate ulang
    const { data: videoLevelQuiz } = await supabaseAdmin
      .from('quiz_results')
      .select('*')
      .eq('video_id', video_id)
      .eq('is_video_level', true)
      .maybeSingle()

    if (videoLevelQuiz) {
      return successResponse({ ...videoLevelQuiz, cached: true })
    }

    // 3. Fetch video record — hanya video approved
    const { data: video, error: vidErr } = await supabaseAdmin
      .from('videos')
      .select('video_file_url, deskripsi, judul, kategori, status')
      .eq('id', video_id)
      .single()

    if (vidErr || !video) return errorResponse('Video not found', 404)

    // Quiz hanya untuk video approved (atau admin yang trigger saat approve)
    if (!['approved'].includes(video.status)) {
      // Jika dipanggil dari admin pipeline (setelah approve), tetap proses
      const { data: adminCheck } = await supabaseAdmin
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()
      if (adminCheck?.role !== 'admin') {
        return errorResponse('Video belum disetujui', 403)
      }
    }

    const apiKey = Deno.env.get('GEMINI_API_KEY')
    let quizData: unknown
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
        quizData = await callGeminiWithVideo(fileUri, apiKey)
      } catch (geminiErr: unknown) {
        console.error('Gemini processing failed, using fallback:', (geminiErr as Error).message)
        quizData = generateFallbackFromDescription(video.deskripsi)
        isFallback = true
      }
    } else {
      quizData = generateFallbackFromDescription(video.deskripsi)
      isFallback = true
    }

    // 5. Simpan sebagai video-level quiz (user_id NULL = shared cache)
    const payload = quizData as Record<string, unknown>
    const { data: saved, error: saveErr } = await supabaseAdmin
      .from('quiz_results')
      .insert({
        video_id,
        user_id: user.id,   // creator/admin yang trigger
        ai_summary: payload.summary,
        questions_json: JSON.stringify(payload.questions),
        is_fallback: isFallback,
        is_video_level: true,
      })
      .select()
      .single()

    if (saveErr) {
      // Mungkin race condition — ambil yang sudah ada
      const { data: existing } = await supabaseAdmin
        .from('quiz_results')
        .select('*')
        .eq('video_id', video_id)
        .eq('is_video_level', true)
        .maybeSingle()
      if (existing) return successResponse({ ...existing, cached: true })
      return errorResponse('Failed to save quiz: ' + saveErr.message, 500)
    }

    // 6. Update queue status
    await supabaseAdmin
      .from('quiz_generation_queue')
      .update({ status: 'done', processed_at: new Date().toISOString() })
      .eq('video_id', video_id)

    return successResponse({ ...saved, cached: false })
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
