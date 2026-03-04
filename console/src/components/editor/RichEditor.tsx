"use client";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Highlight from "@tiptap/extension-highlight";
import Typography from "@tiptap/extension-typography";
import CharacterCount from "@tiptap/extension-character-count";
import LinkExtension from "@tiptap/extension-link";
import { cn } from "@/lib/utils";
import { EditorToolbar } from "./EditorToolbar";
import type { JSONContent } from "@tiptap/react";

export type RichEditorProps = {
  content?: JSONContent | string;
  onUpdate?: (json: JSONContent) => void;
  placeholder?: string;
  editable?: boolean;
  maxLength?: number;
  className?: string;
  showToolbar?: boolean;
};

export function RichEditor({ content, onUpdate, placeholder = "Start writing...", editable = true, maxLength, className, showToolbar = true }: RichEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Highlight,
      Typography,
      LinkExtension.configure({ openOnClick: false }),
      ...(maxLength ? [CharacterCount.configure({ limit: maxLength })] : [CharacterCount]),
    ],
    content: content ?? "",
    editable,
    onUpdate: ({ editor: e }) => {
      onUpdate?.(e.getJSON());
    },
    editorProps: {
      attributes: {
        class: "prose prose-sm max-w-none focus:outline-none min-h-[120px] px-3 py-2",
        role: "textbox",
        "aria-label": "Rich text editor",
      },
    },
  });

  if (!editor) return null;

  const charCount = editor.storage.characterCount?.characters() ?? 0;

  return (
    <div className={cn("rounded-md border border-input bg-transparent", className)}>
      {showToolbar && editable && <EditorToolbar editor={editor} />}
      <EditorContent editor={editor} />
      {maxLength && (
        <div className="border-t border-input px-3 py-1 text-xs text-muted-foreground text-right">
          {charCount} / {maxLength}
        </div>
      )}
    </div>
  );
}
