"use client";

import { useForm } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";

/** Port of validated_inputs/ValidatedInput.vue (vee-validate+yup → react-hook-form). */
export function ValidatedInput({
  name,
  type = "text",
  className = "",
  placeholder,
  validation,
  defaultValue = "",
}: {
  name: string;
  type?: string;
  className?: string;
  placeholder?: string;
  validation?: any;
  defaultValue?: any;
}) {
  const schema = yup.object({
    [name]: validation || yup.mixed(),
  });
  const {
    register,
    formState: { errors },
  } = useForm({
    resolver: yupResolver(schema) as any,
    defaultValues: { [name]: defaultValue },
  });

  return (
    <div className="w-full">
      <input
        type={type}
        placeholder={placeholder}
        className={`w-full rounded-lg border border-dark-200 bg-white px-4 py-2.5 text-sm text-dark-800 placeholder-dark-300 focus:border-primary-400 focus:outline-none ${className}`}
        {...register(name)}
      />
      {errors[name] && (
        <p className="mt-1 text-xs text-danger-500">
          {(errors[name] as any)?.message as string}
        </p>
      )}
    </div>
  );
}
