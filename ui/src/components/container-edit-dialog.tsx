import { useEffect, useState } from 'react'
import { DialogDescription } from '@radix-ui/react-dialog'
import { Container } from 'kubernetes-types/core/v1'

// Corrected Import: './editors' assumes 'editors' is a folder inside 'src/components/'
import { ResourceEditor } from './editors'

// Corrected Imports: './ui/...' assumes 'ui' is a folder inside 'src/components/'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs'

interface ContainerEditDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  container: Container
  onSave: (updatedContainer: Container) => void
}

export function ContainerEditDialog({
  open,
  onOpenChange,
  container,
  onSave,
}: ContainerEditDialogProps) {
  const [editedContainer, setEditedContainer] = useState<Container>(container)

  useEffect(() => {
    setEditedContainer({ ...container })
  }, [container])

  const handleSave = () => {
    onSave(editedContainer)
    onOpenChange(false)
  }

  const handleUpdate = (updates: Partial<Container>) => {
    setEditedContainer((prev) => ({ ...prev, ...updates }))
  }

  // Helper to handle command/args array editing via string input
  const handleStringArrayUpdate = (
    field: 'command' | 'args',
    value: string
  ) => {
    // Basic splitting by space for simple editing, or keeping as is if empty
    // Ideally this parses shell commands, but for simple UI we split by space
    const arrayValue = value ? value.match(/(?:[^\s"]+|"[^"]*")+/g) || [] : []
    // Remove quotes if present from regex matching
    const cleanArray = arrayValue.map((s) => s.replace(/^"|"$/g, ''))

    handleUpdate({ [field]: cleanArray })
  }

  const getArrayAsString = (arr?: string[]) => {
    if (!arr) return ''
    // Join with spaces, wrapping in quotes if contains space
    return arr.map(s => s.includes(' ') ? `"${s}"` : s).join(' ')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-4xl max-h-[90vh] overflow-y-auto sm:!max-w-4xl">
        <DialogHeader>
          <DialogTitle>Edit Container: {container.name}</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Restricted Mode: Only Command, Args, and Resources are editable.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="general" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="resources">Resources</TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="space-y-6 py-4">
            <div className="space-y-4 border p-4 rounded-lg">
              <div className="grid w-full items-center gap-1.5">
                <Label htmlFor="image-name">Image (Read Only)</Label>
                <Input
                  id="image-name"
                  value={editedContainer.image || ''}
                  disabled
                  className="bg-muted"
                />
              </div>

              <div className="grid w-full items-center gap-1.5">
                <Label htmlFor="command">Command</Label>
                <Input
                  id="command"
                  placeholder='e.g. /bin/sh -c'
                  value={getArrayAsString(editedContainer.command)}
                  onChange={(e) => handleStringArrayUpdate('command', e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Space-separated arguments. Strings with spaces must be quoted.
                </p>
              </div>

              <div className="grid w-full items-center gap-1.5">
                <Label htmlFor="args">Args</Label>
                <Input
                  id="args"
                  placeholder='e.g. echo "hello world"'
                  value={getArrayAsString(editedContainer.args)}
                  onChange={(e) => handleStringArrayUpdate('args', e.target.value)}
                />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="resources" className="space-y-6">
            <ResourceEditor
              container={editedContainer}
              onUpdate={handleUpdate}
            />
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Save Changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}