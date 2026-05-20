import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const textareaVariants = cva(
    'w-full min-w-0 rounded-none border border-input bg-transparent px-2.5 py-2 text-xs transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 dark:bg-input/30 dark:disabled:bg-input/80',
    {
        variants: {
            size: {
                md: 'min-h-40',
                lg: 'min-h-80',
                auto: 'min-h-20',
            },
            resizable: {
                true: 'resize-y',
                false: 'resize-none',
            },
        },
        defaultVariants: {
            size: 'md',
            resizable: true,
        },
    },
);

export type TextareaProps = React.ComponentProps<'textarea'> &
    VariantProps<typeof textareaVariants>;

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
    ({ className, size, resizable, ...props }, ref) => {
        return (
            <textarea
                ref={ref}
                data-slot="textarea"
                className={cn(textareaVariants({ size, resizable }), className)}
                {...props}
            />
        );
    },
);

Textarea.displayName = 'Textarea';

export { Textarea, textareaVariants };
