"use client";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Highlight from "@tiptap/extension-highlight";
import LinkExtension from "@tiptap/extension-link";
import { cn } from "@/lib/utils";
import type { JSONContent } from "@tiptap/react";

export function ReadOnlyViewer({ content, className }: { content: JSONContent | string; className?: string }) {
  const isJson = typeof content === "object";

  const editor = useEditor({
    extensions: [StarterKit, TaskList, TaskItem, Highlight, LinkExtension.configure({ openOnClick: true })],
    content: isJson ? content : `<p>${content}</p>`,
    editable: false,
    editorProps: {
      attributes: {
        class: "prose prose-sm max-w-none",
      },
    },
  });

  if (!editor) return null;

  return (
    <div className={cn("rounded-md", className)}>
      <EditorContent editor={editor} />
    </div>
  );
}
