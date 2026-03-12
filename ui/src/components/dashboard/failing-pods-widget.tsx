import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { IconAlertTriangle, IconLoader2 } from '@tabler/icons-react'
import { useTranslation } from 'react-i18next'
import { useResources } from '@/lib/api'
import { usePermissions } from '@/hooks/use-permissions'
import type { Pod } from 'kubernetes-types/core/v1'
import { Badge } from '@/components/ui/badge'
import { useNavigate } from 'react-router-dom'
import { formatDistanceToNow } from 'date-fns'
import { getPodStatus } from '@/lib/k8s'
import { PodStatusIcon } from '@/components/pod-status-icon'

export function FailingPodsWidget() {
    const { t } = useTranslation()
    const navigate = useNavigate()
    const { canAccess } = usePermissions()

    const canListPods = canAccess('pods', 'list')
    const { data: pods, isLoading } = useResources('pods', undefined, {
        refreshInterval: 15000,
        disable: !canListPods
    })

    const failingPods = pods
        ? (pods as Pod[]).filter(pod => {
            const status = getPodStatus(pod)
            // Filter out normal or progressing states
            const isNormal = [
                'Running',
                'Completed',
                'Succeeded',
                'ContainerCreating',
                'PodInitializing'
            ].includes(status.reason)
            return !isNormal;
        }).sort((a, b) => {
            const timeA = a.metadata?.creationTimestamp || ''
            const timeB = b.metadata?.creationTimestamp || ''
            return new Date(timeB).getTime() - new Date(timeA).getTime()
        }).slice(0, 5) // Only show top 5 most recent
        : []

    return (
        <Card className="border-red-500/20 bg-red-50/10 mb-4 @5xl/main:mb-0">
            <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-red-600 dark:text-red-400">
                    <IconAlertTriangle className="h-5 w-5" />
                    {t('dashboard.failingPods', 'Unhealthy Pods')}
                </CardTitle>
            </CardHeader>
            <CardContent>
                {!canListPods ? (
                    <div className="text-sm text-muted-foreground text-center py-4">
                        Requires permission to list pods
                    </div>
                ) : isLoading ? (
                    <div className="flex items-center justify-center py-6">
                        <IconLoader2 className="h-5 w-5 animate-spin" />
                    </div>
                ) : failingPods.length === 0 ? (
                    <div className="text-sm text-muted-foreground text-center py-4">
                        No failing pods detected
                    </div>
                ) : (
                    <div className="space-y-3">
                        {failingPods.map((pod) => {
                            const status = getPodStatus(pod)
                            return (
                                <button
                                    key={pod.metadata?.uid}
                                    onClick={() =>
                                        navigate(
                                            `/pods/${pod.metadata?.namespace}/${pod.metadata?.name}`
                                        )
                                    }
                                    className="w-full flex flex-col md:flex-row md:items-center justify-between p-2 rounded-md hover:bg-muted transition-colors text-left border border-transparent hover:border-red-200 dark:hover:border-red-900 gap-2"
                                >
                                    <div className="flex-1 min-w-0">
                                        <div className="font-medium truncate flex items-center gap-2">
                                            <PodStatusIcon status={status.reason} className="w-4 h-4 shrink-0" />
                                            <span className="truncate">{pod.metadata?.name}</span>
                                        </div>
                                        <div className="text-xs text-muted-foreground ml-6">
                                            {pod.metadata?.namespace}
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-between md:justify-end shrink-0 gap-2 pl-6 md:pl-0">
                                        <Badge variant="destructive" className="text-xs">
                                            {status.reason}
                                        </Badge>
                                        <span className="text-xs text-muted-foreground w-20 text-right">
                                            {pod.metadata?.creationTimestamp &&
                                                formatDistanceToNow(
                                                    new Date(pod.metadata.creationTimestamp),
                                                    { addSuffix: true }
                                                ).replace('about ', '')}
                                        </span>
                                    </div>
                                </button>
                            )
                        })}
                    </div>
                )}
            </CardContent>
        </Card>
    )
}
