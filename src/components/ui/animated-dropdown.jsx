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
          "bg-[#0a0c0c] text-[#9aa19e] border border-[#303332]",
          "hover:bg-[#171918] hover:text-[#edeae5]",
          "focus:outline-none",
          "h-8 px-3",
          isOpen && "bg-[#171918] text-[#edeae5]",
          triggerClassName
        )}
      >
        <span className="truncate">{selectedOption?.label || placeholder}</span>
        <ChevronDown className={cn("w-3 h-3 ml-2 flex-shrink-0 transition-transform duration-200", isOpen && "rotate-180")} />
      </button>

      {isOpen && (
        <div className="absolute z-[99999] top-full left-0 mt-1 w-full rounded-lg border border-[#303332] bg-[#0a0c0c] p-1 shadow-2xl">
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
                  ? "text-[#edeae5] bg-[#35a79b]/30 border border-[#35a79b]/50"
                  : "text-[#d3d8d6] hover:bg-[#35a79b]/10 hover:text-[#edeae5]"
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