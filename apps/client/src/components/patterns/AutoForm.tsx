import { useState, type FormEvent } from 'react'
import { ZodFirstPartyTypeKind, type z, type ZodObject, type ZodRawShape, type ZodTypeAny } from 'zod'
import { Button } from '../ui/button.js'
import { Input } from '../ui/input.js'
import { Label } from '../ui/label.js'
import { Textarea } from '../ui/textarea.js'

type FieldKind = 'checkbox' | 'textarea' | 'tags' | 'text'

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
}: {
  schema: S
  initialValues?: Partial<z.infer<S>>
  onSubmit: (values: z.infer<S>) => void
  submitLabel?: string
}) {
  // Derived once, up front: `schema.shape` is indexed by an open `string` key,
  // so re-reading it per render would fight `noUncheckedIndexedAccess`.
  const fields: { key: string; kind: FieldKind }[] = Object.entries(schema.shape).map(
    ([key, fieldSchema]) => ({ key, kind: fieldKind(key, fieldSchema) }),
  )

  const [values, setValues] = useState<Record<string, string | boolean>>(() => {
    const initial = (initialValues ?? {}) as Record<string, unknown>
    return Object.fromEntries(
      fields.map(({ key, kind }) => {
        const seed = initial[key]
        switch (kind) {
          case 'checkbox':
            return [key, Boolean(seed ?? false)]
          case 'tags':
            return [key, Array.isArray(seed) ? seed.join(', ') : '']
          default:
            return [key, typeof seed === 'string' ? seed : '']
        }
      }),
    )
  })
  const [errors, setErrors] = useState<Record<string, string>>({})

  function parsedValue(key: string, kind: FieldKind): unknown {
    if (kind === 'checkbox') return values[key]
    if (kind === 'tags') {
      const raw = values[key]
      return typeof raw === 'string'
        ? raw
            .split(',')
            .map((tag) => tag.trim())
            .filter(Boolean)
        : []
    }
    return values[key]
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const candidate = Object.fromEntries(
      fields.map(({ key, kind }) => [key, parsedValue(key, kind)]),
    )
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
            <Label htmlFor={key}>{key}</Label>
            {kind === 'checkbox' ? (
              <input
                id={key}
                type="checkbox"
                checked={Boolean(values[key])}
                onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.checked }))}
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