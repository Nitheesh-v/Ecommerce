"use client";

import { Select } from "@/components/admin/ui/select";
import type { AdminCategory } from "@/types/category";

interface CategoryOption {
  id: string;
  name: string;
  depth: number;
}

/**
 * Flattens the tree into indented options so a plain `<select>` can express
 * hierarchy without a custom listbox.
 */
export function flattenCategories(
  categories: AdminCategory[],
  excludedIds?: Set<string>,
): CategoryOption[] {
  const childrenOf = new Map<string | null, AdminCategory[]>();

  for (const category of categories) {
    const key = category.parentId ?? null;
    childrenOf.set(key, [...(childrenOf.get(key) ?? []), category]);
  }

  for (const list of childrenOf.values()) {
    list.sort(
      (a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name),
    );
  }

  const options: CategoryOption[] = [];
  const seen = new Set<string>();

  const walk = (parentId: string | null, depth: number) => {
    for (const category of childrenOf.get(parentId) ?? []) {
      // The visited set makes a corrupt cycle terminate instead of recursing.
      if (seen.has(category.id)) {
        continue;
      }

      seen.add(category.id);

      if (!excludedIds?.has(category.id)) {
        options.push({ id: category.id, name: category.name, depth });
      }

      walk(category.id, depth + 1);
    }
  };

  walk(null, 0);

  return options;
}

export function CategoryTreeSelect({
  id,
  categories,
  value,
  onChange,
  excludedIds,
  placeholder = "No parent (top-level category)",
  invalid,
  disabled,
}: {
  id?: string;
  categories: AdminCategory[];
  value: string;
  onChange: (value: string) => void;
  excludedIds?: Set<string>;
  placeholder?: string;
  invalid?: boolean;
  disabled?: boolean;
}) {
  return (
    <Select
      id={id}
      value={value}
      invalid={invalid}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">{placeholder}</option>
      {flattenCategories(categories, excludedIds).map((option) => (
        <option key={option.id} value={option.id}>
          {"\u00A0\u00A0".repeat(option.depth)}
          {option.depth > 0 ? "└ " : ""}
          {option.name}
        </option>
      ))}
    </Select>
  );
}
