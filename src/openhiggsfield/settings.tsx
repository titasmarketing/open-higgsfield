"use client";

import { useEffect, useState } from "react";

import { listMarketingPresets } from "@/generation/actions";
import type { ModelEntry } from "@/generation/catalog";
import type { MarketingPreset } from "@/generation/platform";
import { useSettings } from "@/generation/stores/settings";

import {
  ratioBox,
  settingLabel,
  settingPillLabel,
  settingValueLabel,
} from "./data";
import { AudioIcon, ClockIcon, FormatIcon, GemIcon } from "./icons";
import { Field, OptionList, Slider } from "./ui";

/* One drawn mark per setting the catalog is known to declare. Anything new
   arrives as its value alone rather than under a borrowed glyph — a wrong icon
   reads as a wrong control. */
function glyphFor(key: string, value: unknown) {
  if (key === "aspectRatio") {
    /* The mark is the ratio: the pill draws the frame it is about to make, in a
       fixed optical box so 21:9 and 1:1 leave their labels on the same rail. */
    const box = typeof value === "string" ? ratioBox(value) : null;
    return (
      <span className="ohf-ctl-ratio">
        <span
          className={`ohf-ctl-ratio-box${box ? "" : " ohf-ctl-ratio-box--auto"}`}
          style={box ?? undefined}
        />
      </span>
    );
  }
  if (key === "resolution") return <GemIcon size={13} />;
  if (key === "duration") return <ClockIcon size={13} />;
  if (key === "outputFormat") return <FormatIcon size={13} />;
  if (key === "generateAudio" || key === "sound" || key === "keepOriginalSound") {
    return <AudioIcon size={13} />;
  }
  return null;
}

/** One catalog setting, standing on the composer's control rail. Booleans are
    the control themselves; everything else opens its values in a popover. */
export function SettingPill({
  model,
  settingKey,
  values,
  open,
  onOpen,
}: {
  model: ModelEntry;
  settingKey: string;
  values: Record<string, unknown>;
  open: boolean;
  onOpen: (trigger: HTMLElement) => void;
}) {
  const settings = useSettings();
  const field = model.settings[settingKey];
  if (!field) return null;

  const label = settingLabel(settingKey);
  const value = values[settingKey];
  const glyph = glyphFor(settingKey, value);

  if (field.type === "text" || field.type === "preset") {
    const raw = settings.byModel[model.id] ?? {};
    const text = typeof value === "string" ? value.trim() : "";
    const shown =
      field.type === "preset"
        ? text
          ? String(raw.presetName ?? "Preset")
          : "No preset"
        : text || label;
    return (
      <button
        type="button"
        className="ohf-ctl ohf-tip"
        data-tip={label}
        data-empty={!text}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`${label} — ${text ? shown : "empty"}`}
        onClick={(event) => onOpen(event.currentTarget)}
      >
        <span className="ohf-ctl-value ohf-ctl-value--clip">{shown}</span>
      </button>
    );
  }

  if (field.type === "boolean") {
    const on = value === true;
    return (
      <button
        type="button"
        className="ohf-ctl ohf-ctl--flag"
        aria-pressed={on}
        aria-label={`${label} — ${on ? "on" : "off"}`}
        onClick={() => settings.set(model.id, { [settingKey]: !on })}
      >
        {glyph && (
          <span className="ohf-ctl-glyph" aria-hidden>
            {glyph}
          </span>
        )}
        <span className="ohf-ctl-value">{settingPillLabel(settingKey)}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      className="ohf-ctl ohf-tip"
      data-tip={label}
      aria-expanded={open}
      aria-haspopup="dialog"
      aria-label={`${label} — ${settingValueLabel(settingKey, value)}`}
      onClick={(event) => onOpen(event.currentTarget)}
    >
      {glyph && (
        <span className="ohf-ctl-glyph" aria-hidden>
          {glyph}
        </span>
      )}
      <span className="ohf-ctl-value">{settingValueLabel(settingKey, value)}</span>
    </button>
  );
}

/** The values behind one pill — a list of the enum's values, or the slider of
    a range, scoped to the single setting the visitor reached for. */
export function SettingPopover({
  model,
  settingKey,
  values,
}: {
  model: ModelEntry;
  settingKey: string;
  values: Record<string, unknown>;
}) {
  const settings = useSettings();
  const field = model.settings[settingKey];
  if (!field || field.type === "boolean") return null;

  const label = settingLabel(settingKey);

  if (field.type === "text") {
    const value = typeof values[settingKey] === "string" ? (values[settingKey] as string) : "";
    return (
      <div className="ohf-popover ohf-popover--setting" role="dialog" aria-label={label}>
        <Field label={label} value={`${value.length}/${field.maxLength}`}>
          <textarea
            className="ohf-input ohf-input--area"
            value={value}
            maxLength={field.maxLength}
            placeholder={field.placeholder}
            rows={3}
            autoFocus
            onChange={(event) => settings.set(model.id, { [settingKey]: event.target.value })}
          />
        </Field>
      </div>
    );
  }

  if (field.type === "preset") {
    const value = typeof values[settingKey] === "string" ? (values[settingKey] as string) : "";
    return <PresetPopover modelId={model.id} settingKey={settingKey} label={label} value={value} />;
  }

  if (field.type === "enum") {
    const value = typeof values[settingKey] === "string" ? (values[settingKey] as string) : field.default;
    return (
      <div
        className="ohf-popover ohf-popover--setting ohf-popover--list"
        role="dialog"
        aria-label={label}
      >
        <Field label={label}>
          <OptionList
            options={field.values.map((option) => ({
              value: option,
              label: settingValueLabel(settingKey, option),
            }))}
            value={value}
            ratio={settingKey === "aspectRatio"}
            onChange={(next) => settings.set(model.id, { [settingKey]: next })}
          />
        </Field>
      </div>
    );
  }

  const value = typeof values[settingKey] === "number" ? (values[settingKey] as number) : field.default;
  return (
    <div className="ohf-popover ohf-popover--setting ohf-scroll" role="dialog" aria-label={label}>
      <Field label={label} value={settingValueLabel(settingKey, value)}>
        <Slider
          min={field.min}
          max={field.max}
          step={field.step ?? 1}
          value={value}
          label={label}
          onChange={(next) => settings.set(model.id, { [settingKey]: next })}
        />
      </Field>
    </div>
  );
}

/* The preset catalog is managed by Higgsfield and changes over time, so it is
   fetched live (once per page load) instead of being written into the catalog. */
let presetCache: Promise<MarketingPreset[]> | null = null;

function loadPresets(): Promise<MarketingPreset[]> {
  presetCache ??= listMarketingPresets().catch((caught: unknown) => {
    presetCache = null;
    throw caught;
  });
  return presetCache;
}

function PresetPopover({
  modelId,
  settingKey,
  label,
  value,
}: {
  modelId: string;
  settingKey: string;
  label: string;
  value: string;
}) {
  const settings = useSettings();
  const [presets, setPresets] = useState<MarketingPreset[] | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    loadPresets().then(
      (items) => live && setPresets(items),
      (caught: unknown) =>
        live && setFailed(caught instanceof Error ? caught.message : "Could not load presets"),
    );
    return () => {
      live = false;
    };
  }, []);

  return (
    <div
      className="ohf-popover ohf-popover--setting ohf-popover--list ohf-popover--presets"
      role="dialog"
      aria-label={label}
    >
      <Field label={label}>
        {failed ? (
          <p className="ohf-preset-note">
            Não deu para carregar os presets. Confira a chave da Higgsfield e tente de novo.
          </p>
        ) : !presets ? (
          <p className="ohf-preset-note">Carregando presets…</p>
        ) : (
          <OptionList
            options={[
              { value: "", label: "No preset" },
              ...presets.map((preset) => ({ value: preset.id, label: preset.name })),
            ]}
            value={value}
            onChange={(next) =>
              settings.set(modelId, {
                [settingKey]: next,
                presetName: presets.find((preset) => preset.id === next)?.name ?? "",
              })
            }
          />
        )}
        <p className="ohf-preset-note">
          Com preset: anexe a foto do produto (e, opcional, uma foto de modelo).
        </p>
      </Field>
    </div>
  );
}