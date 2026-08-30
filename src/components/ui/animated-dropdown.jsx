import * as React from "react"
import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"

export function AnimatedDropdown({ 
  options = [], 
  value, 
  onChange, 
  placeholder = "Sélectionner",
  className,
  triggerClassName
}) {
  const [isOpen, setIsOpen] = React.useState(false)
  const containerRef = React.useRef(null)

  React.useEffect(() => {
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  const selectedOption = options.find(opt => opt.value === value)

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <button
        onClick={() => setIsOpen(prev => !prev)}
        className={cn(
          "w-full flex items-center justify-between rounded-md text-sm font-medium",
          "bg-[#000000] text-[#9298a6] border border-[#22262d]",
          "hover:bg-[#0f1114] hover:text-[#f2f3f5]",
          "focus:outline-none",
          "h-8 px-3",
          isOpen && "bg-[#0f1114] text-[#f2f3f5]",
          triggerClassName
        )}
      >
        <span className="truncate">{selectedOption?.label || placeholder}</span>
        <ChevronDown className={cn("w-3 h-3 ml-2 flex-shrink-0 transition-transform duration-200", isOpen && "rotate-180")} />
      </button>

      {isOpen && (
        <div className="absolute z-[99999] top-full left-0 mt-1 w-full rounded-lg border border-[#22262d] bg-[#000000] p-1 shadow-2xl">
          {options.map((option) => (
            <button
              key={option.value}
              onMouseDown={(e) => {
                e.preventDefault()
                onChange(option.value)
                setIsOpen(false)
              }}
              className={cn(
                "flex w-full items-center px-3 py-2 text-xs rounded-md transition-colors duration-150",
                value === option.value
                  ? "text-[#f2f3f5] bg-[#96c0b8]/30 border border-[#96c0b8]/50"
                  : "text-[#c9cdd6] hover:bg-[#96c0b8]/10 hover:text-[#f2f3f5]"
              )}
            >
              <span className="truncate">{option.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}