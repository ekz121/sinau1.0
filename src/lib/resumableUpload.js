import * as tus from 'tus-js-client'
import { supabase } from './supabase'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL

function getStorageEndpoint() {
  const hostname = new URL(supabaseUrl).hostname
  const projectRef = hostname.split('.')[0]

  if (!projectRef) throw new Error('URL Supabase tidak valid')
  return `https://${projectRef}.storage.supabase.co/storage/v1/upload/resumable`
}

export async function uploadVideoResumable({ file, objectName, onProgress }) {
  const { data: { session }, error: sessionError } = await supabase.auth.getSession()
  if (sessionError || !session?.access_token) {
    throw new Error('Sesi login berakhir. Silakan login kembali sebelum mengunggah.')
  }

  return new Promise((resolve, reject) => {
    const upload = new tus.Upload(file, {
      endpoint: getStorageEndpoint(),
      retryDelays: [0, 3000, 5000, 10000, 20000],
      headers: {
        authorization: `Bearer ${session.access_token}`,
        'x-upsert': 'false',
      },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      // Include the destination path so a previous upload can never be resumed
      // into a different newly-generated object path.
      fingerprint: () => Promise.resolve(`sinau-video-${objectName}`),
      metadata: {
        bucketName: 'videos',
        objectName,
        contentType: file.type || 'video/mp4',
        cacheControl: '3600',
      },
      // Supabase requires 6 MB chunks for resumable uploads.
      chunkSize: 6 * 1024 * 1024,
      onError: reject,
      onProgress: (bytesUploaded, bytesTotal) => {
        const percentage = bytesTotal > 0 ? (bytesUploaded / bytesTotal) * 100 : 0
        onProgress?.(percentage)
      },
      onSuccess: () => resolve({ path: objectName, uploadUrl: upload.url }),
    })

    upload.findPreviousUploads()
      .then((previousUploads) => {
        if (previousUploads.length > 0) upload.resumeFromPreviousUpload(previousUploads[0])
        upload.start()
      })
      .catch(reject)
  })
}
