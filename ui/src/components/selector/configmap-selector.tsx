import { useMemo } from 'react'
import { ConfigMap } from 'kubernetes-types/core/v1'

import { useResources } from '@/lib/api'
import { Combobox, ComboboxOption } from '@/components/ui/combobox'

export function ConfigMapSelector({
  selectedConfigMap,
  onConfigMapChange,
  namespace,
  placeholder = 'Select a configmap',
  className,
}: {
  selectedConfigMap?: string
  onConfigMapChange: (configMap: string) => void
  namespace?: string
  placeholder?: string
  className?: string
}) {
  const { data, isLoading } = useResources('configmaps', namespace)

  const options: ComboboxOption[] = useMemo(() => {
    return (
      data
        ?.slice()
        .sort((a, b) => {
          const nameA = a.metadata?.name?.toLowerCase() || ''
          const nameB = b.metadata?.name?.toLowerCase() || ''
          return nameA.localeCompare(nameB)
        })
        .map((cm: ConfigMap) => ({
          value: cm.metadata!.name!,
          label: cm.metadata!.name!,
        })) || []
    )
  }, [data])

  return (
    <Combobox
      options={options}
      value={selectedConfigMap}
      onValueChange={onConfigMapChange}
      placeholder={isLoading ? 'Loading...' : placeholder}
      searchPlaceholder="Search configmaps..."
      emptyText="No configmaps found."
      triggerClassName={className}
      disabled={isLoading}
    />
  )
}
