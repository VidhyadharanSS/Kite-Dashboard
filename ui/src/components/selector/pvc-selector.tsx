import { useMemo } from 'react'
import { PersistentVolumeClaim } from 'kubernetes-types/core/v1'

import { useResources } from '@/lib/api'
import { Combobox, ComboboxOption } from '@/components/ui/combobox'

export function PVCSelector({
  selectedPVC,
  onPVCChange,
  namespace,
  placeholder = 'Select a PVC',
  className,
}: {
  selectedPVC?: string
  onPVCChange: (pvc: string) => void
  namespace?: string
  placeholder?: string
  className?: string
}) {
  const { data, isLoading } = useResources('persistentvolumeclaims', namespace)

  const options: ComboboxOption[] = useMemo(() => {
    return (
      data
        ?.slice()
        .sort((a, b) => {
          const nameA = a.metadata?.name?.toLowerCase() || ''
          const nameB = b.metadata?.name?.toLowerCase() || ''
          return nameA.localeCompare(nameB)
        })
        .map((pvc: PersistentVolumeClaim) => ({
          value: pvc.metadata!.name!,
          label: pvc.metadata!.name!,
        })) || []
    )
  }, [data])

  return (
    <Combobox
      options={options}
      value={selectedPVC}
      onValueChange={onPVCChange}
      placeholder={isLoading ? 'Loading...' : placeholder}
      searchPlaceholder="Search PVCs..."
      emptyText="No PVCs found."
      triggerClassName={className}
      disabled={isLoading}
    />
  )
}
