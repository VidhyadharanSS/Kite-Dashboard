import { useMemo } from 'react'
import { Secret } from 'kubernetes-types/core/v1'

import { useResources } from '@/lib/api'
import { Combobox, ComboboxOption } from '@/components/ui/combobox'

export function SecretSelector({
  selectedSecret,
  onSecretChange,
  namespace,
  placeholder = 'Select a secret',
  className,
  avoidHelmSecrets = false,
}: {
  selectedSecret?: string
  onSecretChange: (secret: string) => void
  namespace?: string
  placeholder?: string
  className?: string
  avoidHelmSecrets?: boolean
}) {
  const { data, isLoading } = useResources('secrets', namespace)

  const options: ComboboxOption[] = useMemo(() => {
    return (
      data
        ?.slice()
        .filter((secret: Secret) => {
          if (avoidHelmSecrets) {
            return !secret.type?.includes('helm.sh/release.v1')
          }
          return true
        })
        .sort((a, b) => {
          const nameA = a.metadata?.name?.toLowerCase() || ''
          const nameB = b.metadata?.name?.toLowerCase() || ''
          return nameA.localeCompare(nameB)
        })
        .map((secret: Secret) => ({
          value: secret.metadata!.name!,
          label: secret.metadata!.name!,
        })) || []
    )
  }, [data, avoidHelmSecrets])

  return (
    <Combobox
      options={options}
      value={selectedSecret}
      onValueChange={onSecretChange}
      placeholder={isLoading ? 'Loading...' : placeholder}
      searchPlaceholder="Search secrets..."
      emptyText="No secrets found."
      triggerClassName={className}
      disabled={isLoading}
    />
  )
}
