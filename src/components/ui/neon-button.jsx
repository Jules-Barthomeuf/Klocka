import React from 'react'
import { cn } from '@/lib/utils'

const buttonVariants = {
    variant: {
        default: "bg-[#96c0b8]/10 hover:bg-[#96c0b8]/5 border-[#96c0b8]/30",
        solid: "bg-[#96c0b8] hover:bg-[#96c0b8]/90 text-[#f2f3f5] border-transparent hover:border-[#f2f3f5]/50 transition-all duration-200",
        ghost: "border-transparent bg-transparent hover:border-[#96c0b8]/60 hover:bg-[#f2f3f5]/10",
    },
    size: {
        default: "px-7 py-1.5",
        sm: "px-4 py-0.5",
        lg: "px-10 py-2.5",
    },
};

const NeonButton = React.forwardRef(
    ({ className, neon = true, size = "default", variant = "default", children, ...props }, ref) => {
        const variantClass = buttonVariants.variant[variant] || buttonVariants.variant.default;
        const sizeClass = buttonVariants.size[size] || buttonVariants.size.default;
        
        return (
            <button
                className={cn(
                    "relative group border text-[#f2f3f5] text-center rounded-full font-medium transition-all duration-200",
                    variantClass,
                    sizeClass,
                    className
                )}
                ref={ref}
                {...props}
            >
                <span className={cn(
                    "absolute h-px opacity-0 group-hover:opacity-100 transition-all duration-500 ease-in-out inset-x-0 inset-y-0 bg-gradient-to-r w-3/4 mx-auto from-transparent via-[#96c0b8] to-transparent hidden",
                    neon && "block"
                )} />
                {children}
                <span className={cn(
                    "absolute group-hover:opacity-30 transition-all duration-500 ease-in-out inset-x-0 h-px -bottom-px bg-gradient-to-r w-3/4 mx-auto from-transparent via-[#96c0b8] to-transparent hidden",
                    neon && "block"
                )} />
            </button>
        );
    }
)

NeonButton.displayName = 'NeonButton';

export { NeonButton };