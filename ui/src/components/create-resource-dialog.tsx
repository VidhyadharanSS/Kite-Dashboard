import { useState, useEffect } from 'react'
import { Loader2, Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { applyResource } from '@/lib/api'
import { getTemplateByName, resourceTemplates } from '@/lib/templates'
import { translateError } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { SimpleYamlEditor } from '@/components/simple-yaml-editor'

export function CreateResourceDialog() {
    const [open, setOpen] = useState(false)
    const [yaml, setYaml] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const [selectedTemplate, setSelectedTemplate] = useState<string>('')
    const { t } = useTranslation()

    // Toggle dialog on Cmd+J or Ctrl+J
    useEffect(() => {
        const down = (e: KeyboardEvent) => {
            if (e.key === 'j' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                setOpen((open) => !open)
            }
        }
        document.addEventListener('keydown', down)
        return () => document.removeEventListener('keydown', down)
    }, [])

    const handleTemplateSelect = (templateName: string) => {
        if (templateName === 'empty') {
            setYaml('')
            setSelectedTemplate('')
            return
        }

        const template = getTemplateByName(templateName)
        if (template) {
            setYaml(template.yaml)
            setSelectedTemplate(templateName)
        }
    }

    // Frontend Validation Logic
    const validateTemplateRules = (
        content: string,
        templateName: string
    ): boolean => {
        const template = getTemplateByName(templateName)

        if (!template?.validationRules) return true

        for (const rule of template.validationRules) {
            if (!rule.pattern.test(content)) {
                toast.warning(rule.message)
                return false
            }
        }
        return true
    }

    const handleSubmit = async () => {
        if (!yaml.trim()) {
            toast.error('Please enter YAML content')
            return
        }

        if (selectedTemplate && !validateTemplateRules(yaml, selectedTemplate)) {
            return
        }

        setIsLoading(true)
        try {
            const result = await applyResource(yaml)
            toast.success(
                `Resource ${result.kind}/${result.name} created successfully`
            )
            setYaml('')
            setOpen(false)
        } catch (error) {
            console.error('Error creating resource:', error)
            toast.error(translateError(error, t))
        } finally {
            setIsLoading(false)
        }
    }

    const handleCancel = () => {
        setYaml('')
        setSelectedTemplate('')
        setOpen(false)
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button
                    variant="outline"
                    className="relative h-9 shrink-0 w-full justify-start gap-2 rounded-[0.5rem] bg-background text-sm font-normal text-muted-foreground shadow-none sm:pr-12 md:w-auto md:px-4"
                >
                    <Plus className="h-4 w-4" />
                    <span className="hidden lg:inline-flex">Create Workload Resource ......</span>
                    <span className="inline-flex lg:hidden">Create</span>
                    <kbd className="pointer-events-none absolute right-1.5 top-1.5 hidden h-6 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100 sm:flex">
                        <span className="text-xs">⌘</span>J
                    </kbd>
                </Button>
            </DialogTrigger>
            <DialogContent className="!max-w-4xl max-h-[80vh] flex flex-col sm:!max-w-4xl">
                <DialogHeader>
                    <DialogTitle>Create Resource</DialogTitle>
                    <DialogDescription>
                        Select a template or paste your configuration.
                        <br />
                        <span className="text-xs font-medium text-amber-600">
                            Security Policy Enforced: Pod Security Contexts (User 1000,
                            NonRoot) and Resource Quotas are mandatory.
                        </span>
                    </DialogDescription>
                </DialogHeader>

                <div className="flex-1 space-y-4 overflow-y-auto py-2">
                    <div className="space-y-2">
                        <Label htmlFor="template">Template</Label>
                        <Select
                            value={selectedTemplate}
                            onValueChange={handleTemplateSelect}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder="Select a template..." />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="empty">
                                    Empty (Start from scratch)
                                </SelectItem>
                                {resourceTemplates.map((template) => (
                                    <SelectItem key={template.name} value={template.name}>
                                        {template.name} - {template.description}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="yaml">Configuration (YAML/JSON)</Label>
                        <SimpleYamlEditor
                            value={yaml}
                            onChange={(value) => setYaml(value || '')}
                            disabled={isLoading}
                            height="400px"
                        />
                    </div>
                </div>

                <DialogFooter>
                    <Button
                        variant="outline"
                        onClick={handleCancel}
                        disabled={isLoading}
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={handleSubmit}
                        disabled={isLoading || !yaml.trim()}
                    >
                        {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Apply
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}