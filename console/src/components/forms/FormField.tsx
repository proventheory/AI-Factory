"use client";
import { type ReactNode } from "react";
import { useFormContext, Controller, type FieldValues, type Path } from "react-hook-form";
import { cn } from "@/lib/utils";

export function FormItem({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("space-y-1.5", className)}>{children}</div>;
}

export function FormLabel({ children, required, htmlFor, className }: { children: ReactNode; required?: boolean; htmlFor?: string; className?: string }) {
  return (
    <label htmlFor={htmlFor} className={cn("block text-sm font-medium text-foreground", className)}>
      {children}
      {required && <span className="ml-0.5 text-destructive">*</span>}
    </label>
  );
}

export function FormDescription({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("text-xs text-muted-foreground", className)}>{children}</p>;
}

export function FormMessage({ message, className }: { message?: string; className?: string }) {
  if (!message) return null;
  return <p className={cn("text-xs text-destructive", className)} role="alert">{message}</p>;
}

export function FormInput<T extends FieldValues>({ name, label, placeholder, description, required, disabled, type = "text", className }: {
  name: Path<T>;
  label: string;
  placeholder?: string;
  description?: string;
  required?: boolean;
  disabled?: boolean;
  type?: string;
  className?: string;
}) {
  const { register, formState: { errors } } = useFormContext<T>();
  const error = errors[name];
  return (
    <FormItem className={className}>
      <FormLabel required={required} htmlFor={name}>{label}</FormLabel>
      <input
        id={name}
        type={type}
        placeholder={placeholder}
        disabled={disabled}
        {...register(name)}
        className={cn(
          "flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
          error ? "border-destructive" : "border-input"
        )}
        aria-describedby={error ? `${name}-error` : undefined}
        aria-invalid={!!error}
      />
      {description && <FormDescription>{description}</FormDescription>}
      <FormMessage message={error?.message as string} />
    </FormItem>
  );
}

export function FormTextarea<T extends FieldValues>({ name, label, placeholder, description, required, disabled, rows = 3, className }: {
  name: Path<T>;
  label: string;
  placeholder?: string;
  description?: string;
  required?: boolean;
  disabled?: boolean;
  rows?: number;
  className?: string;
}) {
  const { register, formState: { errors } } = useFormContext<T>();
  const error = errors[name];
  return (
    <FormItem className={className}>
      <FormLabel required={required} htmlFor={name}>{label}</FormLabel>
      <textarea
        id={name}
        placeholder={placeholder}
        disabled={disabled}
        rows={rows}
        {...register(name)}
        className={cn(
          "flex min-h-[60px] w-full rounded-md border bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
          error ? "border-destructive" : "border-input"
        )}
        aria-describedby={error ? `${name}-error` : undefined}
        aria-invalid={!!error}
      />
      {description && <FormDescription>{description}</FormDescription>}
      <FormMessage message={error?.message as string} />
    </FormItem>
  );
}

export function FormSelect<T extends FieldValues>({ name, label, options, placeholder, description, required, disabled, className }: {
  name: Path<T>;
  label: string;
  options: { value: string; label: string }[];
  placeholder?: string;
  description?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  const { register, formState: { errors } } = useFormContext<T>();
  const error = errors[name];
  return (
    <FormItem className={className}>
      <FormLabel required={required} htmlFor={name}>{label}</FormLabel>
      <select
        id={name}
        disabled={disabled}
        {...register(name)}
        className={cn(
          "flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
          error ? "border-destructive" : "border-input"
        )}
        aria-describedby={error ? `${name}-error` : undefined}
        aria-invalid={!!error}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {description && <FormDescription>{description}</FormDescription>}
      <FormMessage message={error?.message as string} />
    </FormItem>
  );
}

export function FormCheckbox<T extends FieldValues>({ name, label, description, disabled, className }: {
  name: Path<T>;
  label: string;
  description?: string;
  disabled?: boolean;
  className?: string;
}) {
  const { register, formState: { errors } } = useFormContext<T>();
  const error = errors[name];
  return (
    <FormItem className={cn("flex items-start gap-2", className)}>
      <input
        type="checkbox"
        id={name}
        disabled={disabled}
        {...register(name)}
        className="mt-1 h-4 w-4 rounded border-input text-primary focus:ring-ring"
      />
      <div>
        <FormLabel htmlFor={name}>{label}</FormLabel>
        {description && <FormDescription>{description}</FormDescription>}
        <FormMessage message={error?.message as string} />
      </div>
    </FormItem>
  );
}

export function FormSwitch<T extends FieldValues>({ name, label, description, disabled, className }: {
  name: Path<T>;
  label: string;
  description?: string;
  disabled?: boolean;
  className?: string;
}) {
  const { control, formState: { errors } } = useFormContext<T>();
  const error = errors[name];
  return (
    <Controller
      name={name}
      control={control}
      render={({ field }) => (
        <FormItem className={cn("flex items-center justify-between gap-2", className)}>
          <div>
            <FormLabel htmlFor={name}>{label}</FormLabel>
            {description && <FormDescription>{description}</FormDescription>}
            <FormMessage message={error?.message as string} />
          </div>
          <button
            type="button"
            role="switch"
            id={name}
            disabled={disabled}
            aria-checked={!!field.value}
            onClick={() => field.onChange(!field.value)}
            className={cn(
              "inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
              field.value ? "bg-primary" : "bg-input"
            )}
          >
            <span className={cn("pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform", field.value ? "translate-x-4" : "translate-x-0")} />
          </button>
        </FormItem>
      )}
    />
  );
}

export function FormActions({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex items-center gap-2 pt-2", className)}>{children}</div>;
}
