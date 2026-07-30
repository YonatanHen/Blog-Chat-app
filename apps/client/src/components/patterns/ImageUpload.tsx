import { useId, useRef, useState } from 'react'
import { uploadImage, UploadsUnavailableError, type UploadFolder } from '../../api/uploads.js'
import { Button } from '../ui/button.js'

/**
 * Optional image picker. Uploads straight to Cloudinary and reports the public
 * ID; `null` means the author cleared it. A post with no image is not an error
 * state — it falls back to art generated from its slug.
 */
export function ImageUpload({
  value,
  previewUrl,
  onChange,
  folder = 'covers',
  label = 'Cover image',
}: {
  value?: string | null
  previewUrl?: string
  onChange: (publicId: string | null) => void
  folder?: UploadFolder
  label?: string
}) {
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  // A local object URL shows the picked file immediately; the server's delivery
  // URL only exists after the post is saved.
  const [localPreview, setLocalPreview] = useState<string>()

  const shown = localPreview ?? previewUrl

  async function handleFile(file: File) {
    setBusy(true)
    setError(undefined)
    try {
      const publicId = await uploadImage(file, folder)
      setLocalPreview(URL.createObjectURL(file))
      onChange(publicId)
    } catch (err) {
      setError(
        err instanceof UploadsUnavailableError
          ? 'Image uploads are not set up on this server. Your post will use its generated cover.'
          : err instanceof Error
            ? err.message
            : 'That image could not be uploaded.',
      )
    } finally {
      setBusy(false)
    }
  }

  function clear() {
    setLocalPreview(undefined)
    setError(undefined)
    onChange(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="font-mono text-xs tracking-[0.09em] text-[var(--muted-foreground)] uppercase">
        {label} <span className="text-[var(--ink-faint)]">— optional</span>
      </span>

      {shown && (
        <img
          src={shown}
          alt=""
          className="aspect-[16/10] w-full max-w-md border border-[var(--border)] object-cover"
        />
      )}

      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void handleFile(file)
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          {busy ? 'Uploading…' : shown ? 'Replace image' : 'Choose image'}
        </Button>
        {(shown || value) && (
          <Button type="button" variant="ghost" size="sm" onClick={clear} disabled={busy}>
            Remove
          </Button>
        )}
      </div>

      <p className="text-xs text-[var(--muted-foreground)]">
        JPG, PNG, WebP or AVIF, up to 5 MB. Leave this empty to use the cover generated from the
        post&rsquo;s title.
      </p>

      {error && <p className="text-xs text-[var(--destructive)]">{error}</p>}
    </div>
  )
}
