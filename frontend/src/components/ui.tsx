import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { type VariantProps, cva } from 'class-variance-authority'
import * as AccordionPrimitive from '@radix-ui/react-accordion'
import * as SwitchPrimitives from '@radix-ui/react-switch'
import * as TabsPrimitive from '@radix-ui/react-tabs'
import { ChevronDown } from 'lucide-react'
import { cn } from '../lib/utils'

// Accordion
const Accordion = AccordionPrimitive.Root

const AccordionItem = ({ className, ...props }: React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Item>) => (
  <AccordionPrimitive.Item
    className={cn('overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-xs data-[state=open]:shadow-md', className)}
    {...props}
  />
)
AccordionItem.displayName = 'AccordionItem'

const AccordionTrigger = ({ className, children, ...props }: React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Trigger>) => (
  <AccordionPrimitive.Header className="flex">
    <AccordionPrimitive.Trigger
      className={cn(
        'flex flex-1 cursor-pointer items-center justify-between gap-3 bg-linear-to-r from-white to-slate-50 px-5 py-4 text-left text-base font-semibold text-slate-900 transition hover:bg-slate-50 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand/30 focus-visible:ring-offset-1',
        className,
      )}
      {...props}
    >
      {children}
      <ChevronDown className="h-4 w-4 shrink-0 text-slate-500 transition-transform duration-200 data-[state=open]:rotate-180" />
    </AccordionPrimitive.Trigger>
  </AccordionPrimitive.Header>
)
AccordionTrigger.displayName = AccordionPrimitive.Trigger.displayName

const AccordionContent = ({ className, ...props }: React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Content>) => (
  <AccordionPrimitive.Content
    className={cn('px-5 pb-5 pt-1 text-sm text-slate-700', className)}
    {...props}
  />
)
AccordionContent.displayName = AccordionPrimitive.Content.displayName

// Badge
type BadgeVariant = 'default' | 'secondary' | 'destructive'

const variantStyles: Record<BadgeVariant, string> = {
  default: 'border-brand/20 bg-brand/10 text-brand-700',
  secondary: 'border-slate-200/70 bg-slate-100 text-slate-700',
  destructive: 'border-rose-200 bg-rose-50 text-rose-700',
}

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant
}

const Badge = ({ className, variant = 'default', ...props }: BadgeProps) => (
  <span
    className={cn(
      'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide',
      variantStyles[variant],
      className,
    )}
    {...props}
  />
)

// Button
const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-semibold transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand/30 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-60',
  {
    variants: {
      variant: {
        default: 'bg-brand text-white shadow-xs hover:bg-brand-600',
        outline: 'border border-slate-200 bg-white text-slate-900 shadow-xs hover:bg-slate-50',
        ghost: 'text-slate-700 hover:bg-slate-100 hover:text-slate-900',
        subtle: 'bg-slate-100 text-slate-900 hover:bg-slate-200',
        secondary: 'bg-slate-900 text-white shadow-xs hover:bg-slate-800',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-8 px-3 text-xs',
        lg: 'h-11 px-6 text-base',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : 'button'
  return <Comp ref={ref} className={cn(buttonVariants({ variant, size, className }))} {...props} />
})
Button.displayName = 'Button'

// Card
const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('panel-card', className)} {...props} />
))
Card.displayName = 'Card'

const CardHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex flex-col space-y-2 border-b border-slate-200/80 bg-white/70 px-6 py-5', className)} {...props} />
)

const CardTitle = ({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
  <h3 className={cn('text-xl font-semibold tracking-tight text-slate-950', className)} {...props} />
)

const CardDescription = ({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) => (
  <p className={cn('text-sm text-slate-600', className)} {...props} />
)

const CardContent = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('px-6 py-6', className)} {...props} />
)

const CardFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('border-t border-slate-200/80 px-6 py-4', className)} {...props} />
)

// Input
const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, type, ...props }, ref) => {
  return (
    <input
      type={type}
      className={cn(
        'flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-900 shadow-inner shadow-transparent transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand/30 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-60',
        className,
      )}
      ref={ref}
      {...props}
    />
  )
})
Input.displayName = 'Input'

// Label
const Label = React.forwardRef<HTMLLabelElement, React.LabelHTMLAttributes<HTMLLabelElement>>(({ className, ...props }, ref) => (
  <label ref={ref} className={cn('text-sm font-medium text-slate-700', className)} {...props} />
))
Label.displayName = 'Label'

// Switch
const Switch = React.forwardRef<React.ElementRef<typeof SwitchPrimitives.Root>, React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>>(
  ({ className, ...props }, ref) => (
    <SwitchPrimitives.Root
      ref={ref}
      className={cn(
        'peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-transparent bg-slate-300 transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand/30 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-60 data-[state=checked]:bg-brand',
        className,
      )}
      {...props}
    >
      <SwitchPrimitives.Thumb
        className="pointer-events-none block h-4 w-4 rounded-full bg-white shadow-sm transition-transform data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0"
      />
    </SwitchPrimitives.Root>
  ),
)
Switch.displayName = SwitchPrimitives.Root.displayName

// Tabs
const Tabs = TabsPrimitive.Root

const TabsList = ({ className, ...props }: React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>) => (
  <TabsPrimitive.List
    className={cn('inline-flex h-10 items-center justify-center rounded-lg bg-slate-100 p-1 text-slate-600', className)}
    {...props}
  />
)
TabsList.displayName = TabsPrimitive.List.displayName

const TabsTrigger = ({ className, ...props }: React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>) => (
  <TabsPrimitive.Trigger
    className={cn(
      'inline-flex min-w-[120px] items-center justify-center whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand/30 focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-xs',
      className,
    )}
    {...props}
  />
)
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName

const TabsContent = ({ className, ...props }: React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>) => (
  <TabsPrimitive.Content className={cn('mt-6 focus-visible:outline-hidden', className)} {...props} />
)
TabsContent.displayName = TabsPrimitive.Content.displayName

export {
  Accordion, AccordionItem, AccordionTrigger, AccordionContent,
  Badge,
  Button, buttonVariants,
  Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter,
  Input,
  Label,
  Switch,
  Tabs, TabsList, TabsTrigger, TabsContent
}