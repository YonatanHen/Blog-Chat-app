import { useState, type FormEvent } from 'react'
import { ZodFirstPartyTypeKind, type z, type ZodObject, type ZodRawShape, type ZodTypeAny } from 'zod'
import { Button } from '../ui/button.js'
import { Input } from '../ui/input.js'
import { Label } from '../ui/label.js'
import { Textarea } from '../ui/textarea.js'
import { ImageUpload } from './ImageUpload.js'
import { TagsInput } from './TagsInput.js'

type FieldKind = 'checkbox' | 'textarea' | 'tags' | 'image' | 'text'

/**
 * `ZodTypeDef` is the public (near-empty) shape of `_def`; the discriminant and
 * the wrapped schema live on the first-party subtypes. This is the one narrow
 * place where we look at zod's internals, so the cast is kept here.
 */
type ZodDefInternals = { typeName?: string; innerType?: ZodTypeAny; schema?: ZodTypeAny }

function internals(schema: ZodTypeAny): ZodDefInternals {
  return schema._def as ZodDefInternals
}

/**
 * Peel every wrapper off a field until the type that decides the control shows
 * through. One level is not enough: `UpdatePostSchema` is `CreatePostSchema.partial()`,
 * so `tags` arrives as `ZodOptional<ZodDefault<ZodArray>>`. Unwrapping only
 * `ZodDefault` (or only `ZodOptional`) reports it as a plain string field, the
 * comma-split never runs, and the edit form posts `tags: "a, b"` — which the API
 * rejects. None of these wrappers expose `.unwrap()` uniformly, hence `_def`.
 */
function unwrap(schema: ZodTypeAny): ZodTypeAny {
  let current = schema
  for (;;) {
    const def = internals(current)
    const next =
      def.typeName === ZodFirstPartyTypeKind.ZodDefault ||
      def.typeName === ZodFirstPartyTypeKind.ZodOptional ||
      def.typeName === ZodFirstPartyTypeKind.ZodNullable
        ? def.innerType
        : def.typeName === ZodFirstPartyTypeKind.ZodEffects
          ? def.schema
          : undefined
    if (!next) return current
    current = next
  }
}

function fieldKind(key: string, schema: ZodTypeAny): FieldKind {
  const { typeName } = internals(unwrap(schema))
  if (typeName === ZodFirstPartyTypeKind.ZodBoolean) return 'checkbox'
  if (typeName === ZodFirstPartyTypeKind.ZodArray) return 'tags'
  if (key === 'body') return 'textarea'
  // Keyed by name, not by type: a public ID is a plain string to zod, and a raw
  // text box for one would be unusable — nobody types a Cloudinary ID by hand.
  if (key === 'coverImage' || key === 'avatar') return 'image'
  return 'text'
}

/**
 * Renders a form straight from a zod schema and hands `onSubmit` the **parsed**
 * output, never the raw strings — so the schema in `@blog/zod-shared` that the
 * server validates against is the same one that shapes and validates the form.
 */
export function AutoForm<S extends ZodObject<ZodRawShape>>({
  schema,
  initialValues,
  onSubmit,
  submitLabel = 'Save',
  imagePreviewUrl,
}: {
  schema: S
  initialValues?: Partial<z.infer<S>>
  onSubmit: (values: z.infer<S>) => void
  submitLabel?: string
  /** Delivery URL for an already-saved image — the form holds only its ID. */
  imagePreviewUrl?: string
}) {
  // Derived once, up front: `schema.shape` is indexed by an open `string` key,
  // so re-reading it per render would fight `noUncheckedIndexedAccess`.
  const fields: { key: string; kind: FieldKind }[] = Object.entries(schema.shape).map(
    ([key, fieldSchema]) => ({ key, kind: fieldKind(key, fieldSchema) }),
  )

  const [values, setValues] = useState<Record<string, string | boolean | string[] | null>>(() => {
    const initial = (initialValues ?? {}) as Record<string, unknown>
    return Object.fromEntries(
      fields.map(({ key, kind }) => {
        const seed = initial[key]
        switch (kind) {
          case 'checkbox':
            return [key, Boolean(seed ?? false)]
          case 'tags':
            return [key, Array.isArray(seed) ? seed.map(String) : []]
          // null, never '': an empty string is not a valid public ID and would
          // fail the schema on every submit that leaves the image blank.
          case 'image':
            return [key, typeof seed === 'string' ? seed : null]
          default:
            return [key, typeof seed === 'string' ? seed : '']
        }
      }),
    )
  })
  const [errors, setErrors] = useState<Record<string, string>>({})

  // `tags` is already held as an array by TagsInput, so nothing is parsed out of
  // a raw string here — the state shape per field kind is the parsed shape.
  function parsedValue(key: string): unknown {
    return values[key]
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const candidate = Object.fromEntries(fields.map(({ key }) => [key, parsedValue(key)]))
    const result = schema.safeParse(candidate)
    if (!result.success) {
      setErrors(
        Object.fromEntries(result.error.issues.map((issue) => [String(issue.path[0]), issue.message])),
      )
      return
    }
    setErrors({})
    onSubmit(result.data as z.infer<S>)
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {fields.map(({ key, kind }) => {
        return (
          <div key={key} className="flex flex-col gap-1">
            {/* ImageUpload renders its own label and controls. */}
            {kind !== 'image' && <Label htmlFor={key}>{key}</Label>}
            {kind === 'image' ? (
              <ImageUpload
                value={typeof values[key] === 'string' ? (values[key] as string) : null}
                previewUrl={imagePreviewUrl}
                folder={key === 'avatar' ? 'avatars' : 'covers'}
                label={key === 'avatar' ? 'Avatar' : 'Cover image'}
                onChange={(publicId) => setValues((v) => ({ ...v, [key]: publicId }))}
              />
            ) : kind === 'checkbox' ? (
              <input
                id={key}
                type="checkbox"
                checked={Boolean(values[key])}
                onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.checked }))}
              />
            ) : kind === 'tags' ? (
              <TagsInput
                id={key}
                value={Array.isArray(values[key]) ? (values[key] as string[]) : []}
                onChange={(tags) => setValues((v) => ({ ...v, [key]: tags }))}
              />
            ) : kind === 'textarea' ? (
              <Textarea
                id={key}
                value={String(values[key] ?? '')}
                onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
              />
            ) : (
              <Input
                id={key}
                type="text"
                value={String(values[key] ?? '')}
                onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
              />
            )}
            {errors[key] && <p className="text-sm text-[var(--destructive)]">{errors[key]}</p>}
          </div>
        )
      })}
      <Button type="submit">{submitLabel}</Button>
    </form>
  )
}