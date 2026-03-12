import { IconDeviceDesktop, IconTrash, IconKey } from '@tabler/icons-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { deleteSession, useSessions, UserSession } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

export function SessionManagement() {
    const { t } = useTranslation()
    const queryClient = useQueryClient()
    const { data: sessions = [], isLoading } = useSessions()

    const deleteMutation = useMutation({
        mutationFn: (id: number) => deleteSession(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['user-sessions'] })
            toast.success(t('settings.sessions.deleted', 'Session removed'))
        },
        onError: (err: Error) => {
            toast.error(err.message || t('settings.sessions.deleteError', 'Failed to remove session'))
        }
    })

    if (isLoading) return <div className="p-4 text-center">Loading...</div>

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <IconKey className="h-5 w-5" />
                    {t('settings.sessions.title', 'Active Sessions')}
                </CardTitle>
                <CardDescription>
                    {t('settings.sessions.description', 'Currently active sessions for your account.')}
                </CardDescription>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>{t('settings.sessions.device', 'Device / IP')}</TableHead>
                            <TableHead>{t('settings.sessions.lastActivity', 'Last Activity')}</TableHead>
                            <TableHead className="text-right">{t('common.actions', 'Actions')}</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {sessions.map((session: UserSession) => (
                            <TableRow key={session.id}>
                                <TableCell>
                                    <div className="flex items-center gap-2">
                                        <IconDeviceDesktop className="h-4 w-4 text-muted-foreground" />
                                        <div>
                                            <div className="font-medium">{session.ip}</div>
                                            <div className="text-xs text-muted-foreground truncate max-w-[300px]" title={session.userAgent}>
                                                {session.userAgent}
                                            </div>
                                        </div>
                                    </div>
                                </TableCell>
                                <TableCell>
                                    {formatDistanceToNow(new Date(session.lastUsedAt), { addSuffix: true })}
                                </TableCell>
                                <TableCell className="text-right">
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => deleteMutation.mutate(session.id)}
                                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                    >
                                        <IconTrash className="h-4 w-4" />
                                    </Button>
                                </TableCell>
                            </TableRow>
                        ))}
                        {sessions.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={3} className="text-center py-4 text-muted-foreground">
                                    {t('settings.sessions.empty', 'No other active sessions')}
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
    )
}
