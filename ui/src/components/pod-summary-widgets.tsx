import { useMemo } from 'react'
import { Activity, AlertCircle, CheckCircle2, Cpu, Database } from 'lucide-react'

import { PodWithMetrics } from '@/types/api'
import { Card } from '@/components/ui/card'
import { formatCPU, formatMemory } from '@/lib/utils'

interface PodSummaryWidgetsProps {
    pods: PodWithMetrics[]
}

export function PodSummaryWidgets({ pods }: PodSummaryWidgetsProps) {
    const stats = useMemo(() => {
        let running = 0
        let pending = 0
        let failed = 0
        let others = 0
        let totalCPU = 0
        let totalMemory = 0

        pods.forEach((pod) => {
            const phase = pod.status?.phase

            if (phase === 'Running') running++
            else if (phase === 'Pending') pending++
            else if (phase === 'Failed') failed++
            else others++

            totalCPU += pod.metrics?.cpuUsage || 0
            totalMemory += pod.metrics?.memoryUsage || 0
        })

        return {
            running,
            pending,
            failed,
            others,
            totalCPU,
            totalMemory,
            total: pods.length
        }
    }, [pods])

    if (pods.length === 0) return null

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-4 animate-in fade-in slide-in-from-top-2 duration-300">
            <Card className="p-3 flex items-center justify-between border-none bg-muted/30 shadow-sm hover:bg-muted/40 transition-colors">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-green-500/10 rounded-full text-green-500">
                        <CheckCircle2 className="h-5 w-5" />
                    </div>
                    <div>
                        <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Running</p>
                        <h3 className="text-xl font-bold leading-none mt-1">{stats.running}</h3>
                    </div>
                </div>
                <div className="text-right">
                    <p className="text-[10px] text-muted-foreground uppercase">{stats.total} total</p>
                </div>
            </Card>

            <Card className="p-3 flex items-center justify-between border-none bg-muted/30 shadow-sm hover:bg-muted/40 transition-colors">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-yellow-500/10 rounded-full text-yellow-500">
                        <Activity className="h-5 w-5" />
                    </div>
                    <div>
                        <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Pending</p>
                        <h3 className="text-xl font-bold leading-none mt-1">{stats.pending}</h3>
                    </div>
                </div>
                <div className="text-right text-red-500 font-medium">
                    {stats.failed > 0 && (
                        <div className="flex items-center gap-1">
                            <AlertCircle className="h-3 w-3" />
                            <span className="text-xs font-bold">{stats.failed}</span>
                        </div>
                    )}
                </div>
            </Card>

            <Card className="p-3 flex items-center gap-3 border-none bg-muted/30 shadow-sm hover:bg-muted/40 transition-colors">
                <div className="p-2 bg-blue-500/10 rounded-full text-blue-500">
                    <Cpu className="h-5 w-5" />
                </div>
                <div>
                    <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Total CPU</p>
                    <h3 className="text-xl font-bold leading-none mt-1">{formatCPU(stats.totalCPU)}</h3>
                </div>
            </Card>

            <Card className="p-3 flex items-center gap-3 border-none bg-muted/30 shadow-sm hover:bg-muted/40 transition-colors">
                <div className="p-2 bg-purple-500/10 rounded-full text-purple-500">
                    <Database className="h-5 w-5" />
                </div>
                <div>
                    <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Total RAM</p>
                    <h3 className="text-xl font-bold leading-none mt-1">{formatMemory(stats.totalMemory)}</h3>
                </div>
            </Card>
        </div>
    )
}
