import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox";
import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type TriStateValue = boolean | undefined;

type TriStateCheckboxProps = {
    label: string;
    value: TriStateValue;
    onChange: (next: TriStateValue) => void;
    className?: string;
};

function getNextValue(value: TriStateValue): TriStateValue {
    if (value === undefined) return true;
    if (value === true) return false;
    return undefined;
}

function StateIcon({ value }: { value: TriStateValue }) {
    if (value === true) {
        return <Check className="size-3.5 text-primary-foreground" />;
    }
    if (value === false) {
        return <X className="size-3.5 text-destructive" />;
    }
    return null;
}

export function TriStateCheckbox({ label, value, onChange, className }: TriStateCheckboxProps) {
    return (
        <label
            className={cn(
                "inline-flex items-center gap-2 text-xs text-foreground hover:text-foreground/80",
                className,
            )}
        >
            <CheckboxPrimitive.Root
                checked={value === true}
                onCheckedChange={() => onChange(getNextValue(value))}
                data-slot="checkbox"
                className={cn(
                    "relative inline-flex size-4 shrink-0 items-center justify-center rounded-none border border-input outline-none transition-colors focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50",
                    value === true && "border-primary bg-primary",
                    value === false && "border-destructive bg-destructive/10",
                    value === undefined && "bg-background",
                )}
            >
                <StateIcon value={value} />
            </CheckboxPrimitive.Root>
            <span>{label}</span>
        </label>
    );
}
