"use client";

import type { Profile } from "@/lib/api";

export default function ProfilePicker({ profiles, value, onChange }: {
  profiles: Record<string, Profile>;
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-stone-500">Profile</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="rounded border border-stone-300 bg-white px-2 py-1">
        {Object.values(profiles).map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    </label>
  );
}
