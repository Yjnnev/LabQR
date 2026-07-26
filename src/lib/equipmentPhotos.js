import { supabase } from './supabaseClient'

const BUCKET = 'equipment-photos'

// uploads one file to the equipment-photos bucket and returns its public URL
export async function uploadPhoto(file) {
  const path = `${crypto.randomUUID()}-${file.name}`
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file)
  if (uploadError) throw uploadError

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return data.publicUrl
}

// pulls the storage path back out of a public URL so we can delete the file
function extractStoragePath(url) {
  const marker = `/${BUCKET}/`
  const idx = url.indexOf(marker)
  if (idx === -1) return null
  return url.slice(idx + marker.length)
}

export async function deletePhotoFile(url) {
  const path = extractStoragePath(url)
  if (!path) return
  await supabase.storage.from(BUCKET).remove([path])
}
