"use client";

import { useCallback, useMemo } from "react";

import { useToast } from "@/components/Toast";
import { canEditSection, useAuth } from "@/lib/auth";
import type {
  InventoryEdit,
  InventoryEditInput,
  InventoryKind,
} from "@/lib/rules/inventoryEdits";
import { store } from "@/lib/store";
import { useStoreData } from "@/lib/storeHooks";

/**
 * Loads one inventory's corrections and hands the page the two writes it needs.
 *
 * Both registers belong to the National Source Inventory section, so that
 * section and admins may correct them; everyone else gets the merged view
 * read-only. The gate here is a courtesy that keeps the buttons off the page —
 * the enforcement is the Firestore rule, which is what actually refuses a write
 * from an officer in another section.
 */
export function useInventoryEditing(inventory: InventoryKind) {
  const { user } = useAuth();
  const toast = useToast();
  const { data, loading, error, reload } = useStoreData(
    (s) => s.listInventoryEdits(),
    [],
  );

  const edits = useMemo<InventoryEdit[]>(
    () => (data ?? []).filter((e) => e.inventory === inventory),
    [data, inventory],
  );

  const canEdit = canEditSection(user, "National Source Inventory");

  const save = useCallback(
    async (input: InventoryEditInput) => {
      if (!user) throw new Error("Sign in to correct the register.");
      const s = await store();
      await s.saveInventoryEdit(input, {
        uid: user.uid,
        name: user.displayName,
        section: user.section,
      });
      reload();
      toast.push(
        input.added
          ? `${input.key} added to the register.`
          : input.removed
            ? `${input.key} removed — it can be restored.`
            : `${input.key} updated.`,
        "success",
      );
    },
    [user, reload, toast],
  );

  const revert = useCallback(
    async (key: string) => {
      const s = await store();
      await s.revertInventoryEdit(inventory, key);
      reload();
      toast.push(`${key} reverted to what the register says.`, "success");
    },
    [inventory, reload, toast],
  );

  return { edits, canEdit, save, revert, loading, error, reload };
}
