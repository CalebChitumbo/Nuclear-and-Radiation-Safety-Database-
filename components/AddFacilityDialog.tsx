"use client";

import { cloneElement, useId, useState } from "react";

import { Drawer } from "./Drawer";
import { useAuth } from "@/lib/auth";
import { store } from "@/lib/store";
import { useToast } from "./Toast";
import { categoriseFacility } from "@/lib/rules/category";
import { norm } from "@/lib/rules/matching";
import {
  CATEGORIES,
  PROVINCES,
  SECTORS,
  STAGES,
  type Facility,
  type FacilityCategory,
  type Province,
  type Sector,
  type Stage,
} from "@/lib/rules/types";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Receives the created facility (e.g. to link an incoming email to it). */
  onCreated?: (facility: Facility) => void;
  /** Seed the form (used when creating a facility from an incoming RAIS email). */
  initialName?: string;
  initialFacCode?: string;
}

export function AddFacilityDialog({
  open,
  onClose,
  onCreated,
  initialName,
  initialFacCode,
}: Props) {
  const { user } = useAuth();
  const toast = useToast();
  const [name, setName] = useState(initialName ?? "");
  const [district, setDistrict] = useState("");
  const [province, setProvince] = useState<Province>("Lusaka");
  const [practice, setPractice] = useState("");
  const [sector, setSector] = useState<Sector>("Private");
  const [functional, setFunctional] = useState(true);
  // "" = derive from the practice/name at submit time.
  const [category, setCategory] = useState<"" | FacilityCategory>("");
  const [licensed, setLicensed] = useState(false);
  const [stage, setStage] = useState<Stage>("No Application Submitted");
  const [facCode, setFacCode] = useState(initialFacCode ?? "");
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  const submit = async () => {
    if (!user || !name.trim()) return;
    setBusy(true);
    try {
      const s = await store();
      const created = await s.addFacility(
        {
          no: 0,
          name: name.trim(),
          nameLower: norm(name),
          district,
          province,
          practice,
          sector,
          functional,
          category: category || categoriseFacility(practice, name),
          licensed,
          stage: licensed ? "Licensed" : stage,
          facCode,
          auths: [],
        },
        user.uid,
      );
      toast.push(`Facility "${name}" added.`, "success");
      onCreated?.(created);
      onClose();
      // reset
      setName("");
      setDistrict("");
      setPractice("");
      setFacCode("");
      setLicensed(false);
      setStage("No Application Submitted");
    } catch (err) {
      // Without this the rejection was unhandled: the dialog silently stayed
      // open and the officer had no idea the facility was never created.
      toast.push(
        `Could not add the facility: ${err instanceof Error ? err.message : err}`,
        "error",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer
      open
      onClose={onClose}
      title="Add facility"
      footer={
        <div className="flex gap-2">
          <button
            disabled={busy || !name.trim()}
            className="btn btn-primary flex-1 sm:flex-none"
            onClick={submit}
          >
            {busy ? "Saving…" : "Add facility"}
          </button>
          <button className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
        </div>
      }
    >
      <section className="card p-4 sm:p-5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <FormField label="Name" required>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Acme Hospital"
              autoFocus
            />
          </FormField>
          <FormField label="FAC code">
            <input
              className="input"
              value={facCode}
              onChange={(e) => setFacCode(e.target.value)}
              placeholder="FAC/####"
            />
          </FormField>
          <FormField label="District">
            <input
              className="input"
              value={district}
              onChange={(e) => setDistrict(e.target.value)}
            />
          </FormField>
          <FormField label="Province">
            <select
              className="input"
              value={province}
              onChange={(e) => setProvince(e.target.value as Province)}
            >
              {PROVINCES.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </FormField>
          <FormField label="Practice">
            <input
              className="input"
              value={practice}
              onChange={(e) => setPractice(e.target.value)}
              placeholder="e.g. Diagnostic Imaging (X-ray)"
            />
          </FormField>
          <FormField label="Sector">
            <select
              className="input"
              value={sector}
              onChange={(e) => setSector(e.target.value as Sector)}
            >
              {SECTORS.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </FormField>
          <FormField label="Category">
            <select
              className="input"
              value={category}
              onChange={(e) =>
                setCategory(e.target.value as "" | FacilityCategory)
              }
            >
              <option value="">
                Auto — {categoriseFacility(practice, name)}
              </option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </FormField>
        </div>
        <div className="flex items-center gap-5 flex-wrap">
          <label className="flex items-center gap-2 text-sm font-bold py-1">
            <input
              type="checkbox"
              className="w-4 h-4"
              checked={functional}
              onChange={(e) => setFunctional(e.target.checked)}
            />
            Functional
          </label>
          <label className="flex items-center gap-2 text-sm font-bold py-1">
            <input
              type="checkbox"
              className="w-4 h-4"
              checked={licensed}
              onChange={(e) => setLicensed(e.target.checked)}
            />
            Licensed
          </label>
        </div>
        {!licensed ? (
          <div>
            <span className="field-label">Stage</span>
            <select
              className="input"
              aria-label="Stage"
              value={stage}
              onChange={(e) => setStage(e.target.value as Stage)}
            >
              {STAGES.filter((s) => s !== "Licensed").map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
        ) : null}
        <p className="text-xs text-gunmetal/55">
          Tip: to add a facility together with its licence, use the{" "}
          <strong>Bulk Approval</strong> page — that will create both the
          facility and the dated licence event, applying R2/R5.
        </p>
      </section>
    </Drawer>
  );
}

function FormField({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactElement<{ id?: string }>;
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="caps text-[10px] text-gunmetal/60">
        {label}
        {required ? " *" : ""}
      </label>
      <div className="mt-1">
        {/* Associate the single form control with its label for screen readers. */}
        {cloneElement(children, { id })}
      </div>
    </div>
  );
}
