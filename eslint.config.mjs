import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['**/.next/**', '**/node_modules/**', '**/dist/**'] },
  ...tseslint.configs.recommended,
  { rules: { '@typescript-eslint/no-explicit-any': 'error' } },
)
