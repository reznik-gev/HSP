/**
 * One field of the Properties panel (docs/0045). Typing doesn't change the plan; Enter or
 * leaving the field applies the value as one undo step, Escape puts the old value back, and a
 * value that can't be used is marked and explained. "Mixed" means the selected elements differ.
 */
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { Input, Select } from "@/components/ui/field";
import type { Field } from "@/editor/core/properties";
import {
  type DisplayUnit,
  formatAngle,
  formatLengthValue,
  parseAngle,
  parseLength,
} from "@/editor/core/units";
import { cn } from "@/lib/utils";

export function PropertyField({
  field,
  value,
  unit,
  onCommit,
}: {
  field: Field;
  /** The current value, or "mixed" when the selected elements differ. */
  value: number | string | null;
  unit: DisplayUnit;
  /** Applies the parsed value; returns false if it isn't allowed. */
  onCommit: (value: number | string) => boolean;
}) {
  const { t } = useTranslation();
  const id = `prop-${field.key}`;
  const label = t(`editor.props.${field.key}`);
  const mixed = value === "mixed";

  if (field.kind === "choice") {
    return (
      <Row id={id} label={label}>
        <Select
          id={id}
          value={mixed || value === null ? "" : String(value)}
          onChange={(e) => {
            onCommit(e.target.value);
            e.target.blur(); // hand the keyboard back to the editor
          }}
        >
          {mixed && <option value="">{t("editor.props.mixed")}</option>}
          {field.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label ?? t(`editor.props.${field.key}Options.${o.value}`)}
            </option>
          ))}
        </Select>
      </Row>
    );
  }
  if (field.kind === "area") {
    const m2 = typeof value === "number" ? value / 1_000_000 : null;
    return (
      <Row id={id} label={label}>
        <output id={id} className="block py-1.5 text-sm" dir="ltr">
          {m2 === null ? "–" : `${m2.toFixed(2)} m²`}
        </output>
      </Row>
    );
  }
  const shown =
    mixed || value === null
      ? ""
      : field.kind === "length"
        ? formatLengthValue(value as number, unit)
        : field.kind === "angle"
          ? formatAngle(value as number).replace("°", "")
          : String(value);
  return (
    <TextInput
      key={`${shown}|${unit}`}
      id={id}
      label={label}
      initial={shown}
      placeholder={mixed ? t("editor.props.mixed") : undefined}
      suffix={field.kind === "length" ? unit : field.kind === "angle" ? "°" : undefined}
      numeric={field.kind !== "text"}
      parse={(text) =>
        field.kind === "length"
          ? parseLength(text, unit)
          : field.kind === "angle"
            ? parseAngle(text)
            : text
      }
      invalidText={t(
        field.kind === "length"
          ? "editor.props.invalidLength"
          : field.kind === "angle"
            ? "editor.props.invalidAngle"
            : "editor.props.invalid",
      )}
      onCommit={onCommit}
    />
  );
}

function TextInput({
  id,
  label,
  initial,
  placeholder,
  suffix,
  numeric,
  parse,
  invalidText,
  onCommit,
}: {
  id: string;
  label: string;
  initial: string;
  placeholder?: string;
  suffix?: string;
  numeric: boolean;
  parse: (text: string) => number | string | null;
  invalidText: string;
  onCommit: (value: number | string) => boolean;
}) {
  const [text, setText] = useState(initial);
  const [invalid, setInvalid] = useState(false);
  // Escape leaves the field without applying what was typed.
  const cancelled = useRef(false);
  const commit = () => {
    if (cancelled.current) {
      cancelled.current = false;
      return;
    }
    if (text === initial) return setInvalid(false);
    const parsed = parse(text);
    const ok = parsed !== null && onCommit(parsed);
    setInvalid(!ok);
  };
  return (
    <Row id={id} label={label} error={invalid ? invalidText : undefined}>
      <div className="relative">
        <Input
          id={id}
          value={text}
          placeholder={placeholder}
          dir={numeric ? "ltr" : undefined}
          inputMode={numeric ? "decimal" : undefined}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? `${id}-error` : undefined}
          className={cn(suffix && "pe-10", numeric && "text-end")}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            // Both leave the field; leaving it applies the value once (onBlur).
            if (e.key === "Enter") {
              e.currentTarget.blur();
            } else if (e.key === "Escape") {
              cancelled.current = true;
              setText(initial);
              setInvalid(false);
              e.currentTarget.blur();
            }
          }}
        />
        {suffix && (
          <span className="pointer-events-none absolute inset-y-0 end-3 flex items-center text-xs text-muted-foreground">
            {suffix}
          </span>
        )}
      </div>
    </Row>
  );
}

function Row({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </label>
      {children}
      {error && (
        <p id={`${id}-error`} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
