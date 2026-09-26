import { Check, Copy } from "lucide-react"
import { useRef, useState } from "react"
import { Button } from "@/components/ui/button"

export function CodeBlock({
  text,
  copyText,
  label = "Copy",
}: {
  text: string
  copyText?: string
  label?: string
}) {
  const [state, setState] = useState<"idle" | "copied" | "selected">("idle")
  const pre = useRef<HTMLPreElement>(null)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(copyText ?? text)
      setState("copied")
    } catch {
      const sel = window.getSelection()
      if (pre.current && sel) {
        const r = document.createRange()
        r.selectNodeContents(pre.current)
        sel.removeAllRanges()
        sel.addRange(r)
      }
      setState("selected")
    }
    setTimeout(() => setState("idle"), 1800)
  }
  return (
    <div className="relative">
      <Button variant="outline" size="sm" className="absolute top-2 right-2" onClick={copy}>
        {state === "copied" ? <Check /> : <Copy />}
        {state === "copied" ? "Copied" : state === "selected" ? "Selected: press Ctrl+C" : label}
      </Button>
      <pre
        ref={pre}
        className="bg-muted max-h-96 overflow-auto rounded-lg border p-4 pr-28 font-mono text-[12.5px] leading-relaxed"
      >
        <code>{text}</code>
      </pre>
    </div>
  )
}
