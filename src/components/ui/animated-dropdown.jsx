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
          "bg-gray-900 text-gray-400 border border-gray-700",
          "hover:bg-gray-800 hover:text-gray-200",
          "focus:outline-none",
          "h-8 px-3",
          isOpen && "bg-gray-800 text-gray-200",
          triggerClassName
        )}
      >
        <span className="truncate">{selectedOption?.label || placeholder}</span>
        <ChevronDown className={cn("w-3 h-3 ml-2 flex-shrink-0 transition-transform duration-200", isOpen && "rotate-180")} />
      </button>

      {isOpen && (
        <div className="absolute z-[99999] top-full left-0 mt-1 w-full rounded-lg border border-gray-700 bg-gray-900 p-1 shadow-2xl">
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
                  ? "text-white bg-[#33d6c0]/30 border border-[#33d6c0]/50"
                  : "text-gray-300 hover:bg-[#33d6c0]/10 hover:text-white"
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