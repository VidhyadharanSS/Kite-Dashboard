import { useCallback, useMemo, useState } from 'react'
import { createColumnHelper } from '@tanstack/react-table'
import { Pod } from 'kubernetes-types/core/v1'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import { PodWithMetrics } from '@/types/api'
import { getPodStatus } from '@/lib/k8s'
import { formatDate, getAge } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { MetricCell } from '@/components/metrics-cell'
import { PodStatusIcon } from '@/components/pod-status-icon'
import { DescribeDialog } from '@/components/describe-dialog'
import { QuickYamlDialog } from '@/components/quick-yaml-dialog'
import { ResourceTable } from '@/components/resource-table'
import { NodeLabelSelector } from '@/components/selector/node-label-selector'

export function PodListPage() {
  const { t } = useTranslation()
  const [nodeNameFilter, setNodeNameFilter] = useState<string[] | null>(null)

  // Define column helper outside of any hooks
  const columnHelper = createColumnHelper<PodWithMetrics>()


  // Define columns for the pod table
  const columns = useMemo(
    () => [
      columnHelper.accessor('metadata.name', {
        header: t('common.name'),
        cell: ({ row }) => (
          <div className="font-medium text-blue-500 hover:underline">
            <Link
              to={`/pods/${row.original.metadata?.namespace || ''}/${row.original.metadata?.name || ''}`}
            >
              {row.original.metadata!.name}
            </Link>
          </div>
        ),
      }),
      columnHelper.accessor((row) => row.status?.containerStatuses, {
        id: 'containers',
        header: t('pods.ready'),
        cell: ({ row }) => {
          const status = getPodStatus(row.original)
          return (
            <div>
              {status.readyContainers} / {status.totalContainers}
            </div>
          )
        },
      }),
      columnHelper.accessor((row) => getPodStatus(row).reason, {
        id: 'status',
        header: t('common.status'),
        enableColumnFilter: true,
        cell: ({ row }) => {
          const status = getPodStatus(row.original).reason
          return (
            <Badge variant="outline" className="text-muted-foreground px-1.5 shrink-0">
              <PodStatusIcon status={status} />
              {status}
            </Badge>
          )
        },
      }),
      columnHelper.accessor((row) => row.status, {
        id: 'restarts',
        header: t('pods.restarts'),
        cell: ({ row }) => {
          const status = getPodStatus(row.original)
          return (
            <span className="text-muted-foreground text-sm">
              {status.restartString}
            </span>
          )
        },
      }),
      columnHelper.accessor((row) => row.metrics?.cpuUsage || 0, {
        id: 'cpu',
        header: 'CPU',
        cell: ({ row }) => (
          <MetricCell metrics={row.original.metrics} type="cpu" />
        ),
      }),
      columnHelper.accessor((row) => row.metrics?.memoryUsage || 0, {
        id: 'memory',
        header: 'Memory',
        cell: ({ row }) => (
          <MetricCell metrics={row.original.metrics} type="memory" />
        ),
      }),
      columnHelper.accessor((row) => row.status?.podIP, {
        id: 'podIP',
        header: 'IP',
        cell: ({ getValue }) => {
          const ip = getValue() || '-'
          return (
            <span className="text-muted-foreground text-sm font-mono">
              {ip}
            </span>
          )
        },
      }),
      columnHelper.accessor((row) => row.spec?.nodeName, {
        id: 'nodeName',
        header: t('pods.node'),
        enableColumnFilter: true,
        cell: ({ row }) => {
          if (row.original.spec?.nodeName) {
            return (
              <div className="font-medium text-blue-500 hover:underline">
                <Link to={`/nodes/${row.original.spec?.nodeName}`}>
                  {row.original.spec?.nodeName}
                </Link>
              </div>
            )
          }
          return '-'
        },
      }),
      columnHelper.accessor((row) => row.metadata?.creationTimestamp, {
        id: 'creationTimestamp',
        header: t('common.created'),
        cell: ({ getValue }) => {
          const dateStr = formatDate(getValue() || '')
          return (
            <Tooltip>
              <TooltipTrigger>
                <span className="text-muted-foreground text-sm">
                  {getAge(getValue() || '')}
                </span>
              </TooltipTrigger>
              <TooltipContent>{dateStr}</TooltipContent>
            </Tooltip>
          )
        },
      }),
      columnHelper.display({
        id: 'actions',
        header: t('common.actions'),
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-1">
            <QuickYamlDialog
              resourceType="pods"
              namespace={row.original.metadata?.namespace}
              name={row.original.metadata?.name || ''}
              triggerVariant="ghost"
              triggerSize="icon"
            />
            <DescribeDialog
              resourceType="pods"
              namespace={row.original.metadata?.namespace}
              name={row.original.metadata?.name || ''}
            />
          </div>
        )
      }),
    ],
    [columnHelper, t]
  )

  // Custom filter for pod search & node label filter
  const podSearchFilter = useCallback(
    (pod: Pod, query: string) => {
      // Apply node label filter first if present
      if (nodeNameFilter && !nodeNameFilter.includes(pod.spec?.nodeName || '')) {
        return false
      }

      return (
        pod.metadata?.name?.toLowerCase().includes(query) ||
        (pod.spec?.nodeName?.toLowerCase() || '').includes(query) ||
        (pod.status?.podIP?.toLowerCase() || '').includes(query)
      )
    },
    [nodeNameFilter]
  )

  const extraToolbars = [
    <NodeLabelSelector onNodeNamesChange={setNodeNameFilter} />,
  ]

  return (
    <ResourceTable<Pod>
      resourceName="Pods"
      columns={columns}
      clusterScope={false}
      searchQueryFilter={podSearchFilter}
      enableLabelFilter={true}
      extraToolbars={extraToolbars}
    />
  )
}
