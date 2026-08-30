import * as React from "react"
import * as TabsPrimitive from "@radix-ui/react-tabs"

import { cn } from "@/lib/utils"

// Les onglets, dans la grammaire du site : des mots en petites capitales sur
// un filet, et sous celui qui est ouvert un trait d'un pixel, menthe. Pas de
// boîte, pas de pastille, pas de fond — un trait.

const Tabs = TabsPrimitive.Root

const TabsList = React.forwardRef(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      "inline-flex h-auto items-end gap-6 rounded-none border-0 border-b border-[#1f2228] bg-transparent p-0 text-[#9298a6]",
      className
    )}
    {...props} />
))
TabsList.displayName = TabsPrimitive.List.displayName

const TabsTrigger = React.forwardRef(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      // Le trait est un pseudo-élément posé sur le filet de la liste : il ne
      // dépend d'aucune bordure, n'hérite d'aucun arrondi, et se déploie de
      // gauche à droite quand l'onglet s'ouvre.
      "relative inline-flex items-center justify-center whitespace-nowrap rounded-none border-0 bg-transparent px-0 pb-2.5 pt-1 text-[11px] uppercase tracking-[0.16em] text-[#9298a6] transition-colors hover:text-[#f2f3f5] focus-visible:outline-none focus-visible:text-[#f2f3f5] disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-transparent data-[state=active]:text-[#f2f3f5] data-[state=active]:shadow-none after:absolute after:left-0 after:right-0 after:-bottom-px after:h-px after:bg-[#96c0b8] after:origin-left after:scale-x-0 after:transition-transform after:duration-300 after:ease-out data-[state=active]:after:scale-x-100",
      className
    )}
    {...props} />
))
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName

const TabsContent = React.forwardRef(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      className
    )}
    {...props} />
))
TabsContent.displayName = TabsPrimitive.Content.displayName

export { Tabs, TabsList, TabsTrigger, TabsContent }
