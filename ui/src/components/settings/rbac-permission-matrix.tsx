import { useMemo } from 'react'
import { Check, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Role } from '@/types/api'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'

const COMMON_RESOURCES = [
    'pods',
    'deployments',
    'statefulsets',
    'daemonsets',
    'services',
    'configmaps',
    'secrets',
    'nodes',
    'namespaces',
    'persistentvolumes',
    'persistentvolumeclaims',
    'events',
]

const VERBS = ['get', 'list', 'watch', 'create', 'update', 'patch', 'delete']

interface RBACPermissionMatrixProps {
    role: Role
}

export function RBACPermissionMatrix({ role }: RBACPermissionMatrixProps) {
    const { t } = useTranslation()

    const hasPermission = (res: string, verb: string) => {
        // Check if role has '*' or the specific resource
        const resFound =
            role.resources.includes('*') ||
            role.resources.some((r) => r.toLowerCase() === res.toLowerCase())
        if (!resFound) return false

        // Check if role has '*' or the specific verb
        const verbFound =
            role.verbs.includes('*') ||
            role.verbs.some((v) => v.toLowerCase() === verb.toLowerCase())
        return verbFound
    }

    const sortedResources = useMemo(() => {
        // Add any custom resources from the role that are not in COMMON_RESOURCES
        const extras = role.resources.filter(
            (r) => r !== '*' && !COMMON_RESOURCES.includes(r.toLowerCase())
        )
        return [...COMMON_RESOURCES, ...extras]
    }, [role.resources])

    return (
        <div className="border rounded-md">
            <Table>
                <TableHeader>
                    <TableRow className="bg-muted/50">
                        <TableHead className="w-[200px] font-bold">
                            {t('rbac.matrix.resource', 'Resource')}
                        </TableHead>
                        {VERBS.map((v) => (
                            <TableHead key={v} className="text-center font-bold capitalize">
                                {v}
                            </TableHead>
                        ))}
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {sortedResources.map((res) => (
                        <TableRow key={res} className="hover:bg-muted/30">
                            <TableCell className="font-medium underline decoration-muted-foreground/30 underline-offset-4">
                                {res}
                            </TableCell>
                            {VERBS.map((v) => {
                                const allowed = hasPermission(res, v)
                                return (
                                    <TableCell key={v} className="text-center p-2">
                                        <div className="flex justify-center">
                                            {allowed ? (
                                                <div className="h-6 w-6 rounded-full bg-green-500/10 flex items-center justify-center">
                                                    <Check className="h-4 w-4 text-green-600" />
                                                </div>
                                            ) : (
                                                <div className="h-6 w-6 rounded-full bg-muted/20 flex items-center justify-center">
                                                    <X className="h-3 w-3 text-muted-foreground/40" />
                                                </div>
                                            )}
                                        </div>
                                    </TableCell>
                                )
                            })}
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    )
}
