/**
 * ImageUpdateDialog — One-click container image tag update.
 *
 * Triggered from ContainerTable via an "Update Image" button.
 * Shows the current image, validates the new tag, previews the diff,
 * then applies via a JSON merge patch.
 */
import { useState } from 'react'
import { IconArrowRight, IconCheck, IconLoader, IconX } from '@tabler/icons-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { patchResource } from '@/lib/api'
import { translateError } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface ImageUpdateDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    /** Resource type — deployments, statefulsets, daemonsets */
    resourceType: 'deployments' | 'statefulsets' | 'daemonsets'
    resourceName: string
    namespace: string
    containerName: string
    currentImage: string
    containerIndex: number
    isInitContainer?: boolean
    /** Called after successful update so parent can start rollout monitor */
    onSuccess?: () => void
}

function splitImage(image: string): { registry: string; name: string; tag: string } {
    // e.g. registry.example.com/namespace/image:tag
    const lastColon = image.lastIndexOf(':')
    const lastSlash = image.lastIndexOf('/')
    if (lastColon > lastSlash) {
        return { registry: '', name: image.slice(0, lastColon), tag: image.slice(lastColon + 1) }
    }
    return { registry: '', name: image, tag: 'latest' }
}

export function ImageUpdateDialog({
    open,
    onOpenChange,
    resourceType,
    resourceName,
    namespace,
    containerName,
    currentImage,
    containerIndex,
    isInitContainer = false,
    onSuccess,
}: ImageUpdateDialogProps) {
    const { t } = useTranslation()
    const { name: imageName, tag: currentTag } = splitImage(currentImage)

    const [newTag, setNewTag] = useState(currentTag)
    const [isSaving, setIsSaving] = useState(false)

    const newImage = newTag ? `${imageName}:${newTag}` : imageName
    const isChanged = newImage !== currentImage
    const isValidTag = /^[a-zA-Z0-9._\-]+$/.test(newTag.trim())

    const handleApply = async () => {
        if (!isChanged || !isValidTag) return
        setIsSaving(true)
        try {
            const containerKey = isInitContainer ? 'initContainers' : 'containers'
            const patch = {
                spec: {
                    template: {
                        spec: {
                            [containerKey]: Array.from({ length: containerIndex + 1 }).map((_, i) =>
                                i === containerIndex
                                    ? { name: containerName, image: newImage }
                                    : undefined
                            ).filter(Boolean),
                        },
                    },
                },
            }
            await patchResource(resourceType, resourceName, namespace, patch)
            toast.success(`Image updated: ${containerName} → ${newImage}`)
            onOpenChange(false)
            onSuccess?.()
        } catch (error) {
            toast.error(translateError(error, t))
        } finally {
            setIsSaving(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        Update Container Image
                        <Badge variant="outline" className="text-xs font-mono">{containerName}</Badge>
                    </DialogTitle>
                    <DialogDescription>
                        Change the image tag for <strong>{containerName}</strong> in <strong>{resourceName}</strong>.
                        This will trigger a rolling update.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-2">
                    {/* Current image display */}
                    <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Current image</Label>
                        <div className="flex items-center gap-2 px-3 py-2 rounded-md border bg-muted/50">
                            <span className="text-xs font-mono text-muted-foreground truncate">{imageName}</span>
                            <Badge variant="secondary" className="text-xs font-mono shrink-0">:{currentTag}</Badge>
                        </div>
                    </div>

                    {/* New tag input */}
                    <div className="space-y-1.5">
                        <Label htmlFor="image-tag" className="text-xs">New tag</Label>
                        <div className="flex items-stretch overflow-hidden rounded-md border shadow-sm focus-within:ring-1 focus-within:ring-primary h-9">
                            <div className="bg-muted/50 px-3 flex items-center border-r select-none max-w-[65%]">
                                <span className="text-xs font-mono text-muted-foreground truncate">
                                    {imageName}:
                                </span>
                            </div>
                            <Input
                                id="image-tag"
                                className="border-0 rounded-none focus-visible:ring-0 shadow-none h-full font-mono text-sm px-3 flex-1"
                                value={newTag}
                                onChange={(e) => setNewTag(e.target.value)}
                                placeholder="tag"
                                onKeyDown={(e) => e.key === 'Enter' && handleApply()}
                                autoFocus
                            />
                        </div>
                        {newTag && !isValidTag && (
                            <p className="text-[10px] text-destructive pl-1">Tag contains invalid characters</p>
                        )}
                    </div>

                    {/* Preview of change */}
                    {isChanged && (
                        <div className="px-3 py-2.5 rounded-md border border-primary/20 bg-primary/5 space-y-1">
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Preview</p>
                            <div className="flex items-center gap-2 text-xs font-mono">
                                <span className="text-destructive/80 line-through truncate">{currentImage}</span>
                                <IconArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                                <span className="text-primary font-semibold truncate">{newImage}</span>
                            </div>
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
                        <IconX className="h-4 w-4 mr-1" />
                        Cancel
                    </Button>
                    <Button
                        onClick={handleApply}
                        disabled={!isChanged || !isValidTag || isSaving}
                    >
                        {isSaving
                            ? <><IconLoader className="h-4 w-4 mr-2 animate-spin" /> Updating…</>
                            : <><IconCheck className="h-4 w-4 mr-1" /> Apply Update</>
                        }
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
