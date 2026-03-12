import { useMemo } from 'react'
import {
  IconCircleCheck,
  IconAlertTriangle,
  IconCircleX,
  IconLoader,
} from '@tabler/icons-react'
import { useTranslation } from 'react-i18next'

import { OverviewData } from '@/types/api'
import { Badge } from '@/components/ui/badge'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

interface ClusterHealthBadgeProps {
  overview?: OverviewData
  isLoading?: boolean
}

type HealthStatus = 'healthy' | 'degraded' | 'critical' | 'unknown'

export function ClusterHealthBadge({
  overview,
  isLoading,
}: ClusterHealthBadgeProps) {
  const { t } = useTranslation()

  const { status, issues } = useMemo((): {
    status: HealthStatus
    issues: string[]
  } => {
    if (!overview) return { status: 'unknown', issues: [] }

    const issues: string[] = []

    // Check node health
    const nodeHealthRatio = overview.readyNodes / Math.max(overview.totalNodes, 1)
    if (nodeHealthRatio < 0.5) {
      issues.push(
        `${overview.readyNodes}/${overview.totalNodes} nodes ready (critical)`
      )
    } else if (nodeHealthRatio < 1) {
      issues.push(
        `${overview.readyNodes}/${overview.totalNodes} nodes ready`
      )
    }

    // Check pod health
    const podHealthRatio =
      overview.runningPods / Math.max(overview.totalPods, 1)
    if (podHealthRatio < 0.5) {
      issues.push(
        `${overview.runningPods}/${overview.totalPods} pods running (critical)`
      )
    } else if (podHealthRatio < 0.8) {
      issues.push(
        `${overview.runningPods}/${overview.totalPods} pods running`
      )
    }

    // Check CPU pressure
    if (overview.resource?.cpu?.allocatable > 0) {
      const cpuUsageRatio =
        overview.resource.cpu.requested / overview.resource.cpu.allocatable
      if (cpuUsageRatio > 0.9) {
        issues.push(`CPU requests at ${Math.round(cpuUsageRatio * 100)}%`)
      }
    }

    // Check Memory pressure
    if (overview.resource?.memory?.allocatable > 0) {
      const memUsageRatio =
        overview.resource.memory.requested /
        overview.resource.memory.allocatable
      if (memUsageRatio > 0.9) {
        issues.push(`Memory requests at ${Math.round(memUsageRatio * 100)}%`)
      }
    }

    let status: HealthStatus = 'healthy'
    if (issues.some((i) => i.includes('critical'))) {
      status = 'critical'
    } else if (issues.length > 0) {
      status = 'degraded'
    }

    return { status, issues }
  }, [overview])

  if (isLoading) {
    return (
      <Badge variant="outline" className="gap-1">
        <IconLoader className="size-3 animate-spin" />
        <span className="text-xs">Checking...</span>
      </Badge>
    )
  }

  const config: Record<
    HealthStatus,
    {
      icon: React.ReactNode
      label: string
      className: string
    }
  > = {
    healthy: {
      icon: <IconCircleCheck className="size-3.5" />,
      label: t('clusterHealth.healthy', 'Healthy'),
      className:
        'bg-green-100 text-green-800 border-green-300 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800',
    },
    degraded: {
      icon: <IconAlertTriangle className="size-3.5" />,
      label: t('clusterHealth.degraded', 'Degraded'),
      className:
        'bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-800',
    },
    critical: {
      icon: <IconCircleX className="size-3.5" />,
      label: t('clusterHealth.critical', 'Critical'),
      className:
        'bg-red-100 text-red-800 border-red-300 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800',
    },
    unknown: {
      icon: <IconLoader className="size-3.5" />,
      label: t('clusterHealth.unknown', 'Unknown'),
      className: '',
    },
  }

  const { icon, label, className } = config[status]

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className={`gap-1 cursor-default ${className}`}>
            {icon}
            <span className="text-xs font-medium">{label}</span>
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs">
          {issues.length > 0 ? (
            <div className="space-y-1">
              <p className="font-medium text-sm">Cluster Issues:</p>
              <ul className="text-xs space-y-0.5">
                {issues.map((issue, i) => (
                  <li key={i}>• {issue}</li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-xs">All systems operational</p>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
