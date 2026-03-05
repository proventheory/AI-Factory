"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Input,
  Select,
  PageFrame,
  Stack,
  PageHeader,
  CardSection,
} from "@/components/ui";
import { useCreateBrandProfile } from "@/hooks/use-api";

export default function NewBrandPage() {
  const router = useRouter();
  const create = useCreateBrandProfile();

  const [name, setName] = useState("");
  const [archetype, setArchetype] = useState("");
  const [industry, setIndustry] = useState("");
  const [tagline, setTagline] = useState("");
  const [mission, setMission] = useState("");
  const [voiceDesc, setVoiceDesc] = useState("");
  const [readingLevel, setReadingLevel] = useState("grade_9");
  const [formality, setFormality] = useState("neutral");
  const [density, setDensity] = useState("default");
  const [styleDesc, setStyleDesc] = useState("");
  const [copyVoice, setCopyVoice] = useState("");
  const [bannedWords, setBannedWords] = useState("");
  const [primaryColor, setPrimaryColor] = useState("#3b82f6");
  const [secondaryColor, setSecondaryColor] = useState("#64748b");
  const [logoUrl, setLogoUrl] = useState("");
  const [fontHeadings, setFontHeadings] = useState("Inter");
  const [fontBody, setFontBody] = useState("Inter");
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    setError("");
    try {
      const result = await create.mutateAsync({
        name: name.trim(),
        identity: {
          archetype: archetype || undefined,
          industry: industry || undefined,
          tagline: tagline || undefined,
          mission: mission || undefined,
        },
        tone: {
          voice_descriptors: voiceDesc
            ? voiceDesc.split(",").map((s) => s.trim()).filter(Boolean)
            : undefined,
          reading_level: readingLevel,
          formality,
        },
        visual_style: {
          density,
          style_description: styleDesc || undefined,
        },
        copy_style: {
          voice: copyVoice || undefined,
          banned_words: bannedWords
            ? bannedWords.split(",").map((s) => s.trim()).filter(Boolean)
            : undefined,
        },
        design_tokens: {
          color: { brand: { "500": primaryColor, "600": secondaryColor } },
          colors: { brand: { "500": primaryColor, "600": secondaryColor } },
          ...(fontHeadings || fontBody
            ? {
                typography: {
                  font_headings: fontHeadings,
                  font_body: fontBody,
                  fonts: { heading: fontHeadings, body: fontBody },
                },
              }
            : {}),
          ...(logoUrl ? { logo_url: logoUrl, logo: { url: logoUrl } } : {}),
        },
      });
      router.push(`/brands/${result.id}`);
    } catch (err: any) {
      setError(err.message ?? "Failed to create brand");
    }
  };

  const labelCls = "mb-1 block text-body-small font-medium text-text-primary";

  return (
    <PageFrame>
      <form onSubmit={handleSubmit}>
        <Stack>
          <PageHeader
            title="New Brand Profile"
            actions={
              <div className="flex gap-2">
                <Button type="button" variant="secondary" onClick={() => router.back()}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" disabled={create.isPending}>
                  {create.isPending ? "Creating\u2026" : "Create Brand"}
                </Button>
              </div>
            }
          />
          {error && (
            <div className="rounded-lg border border-state-dangerMuted bg-state-dangerMuted/30 px-4 py-3 text-body-small text-state-danger">
              {error}
            </div>
          )}

          <CardSection title="Basic Info">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className={labelCls}>
                  Name <span className="text-state-danger">*</span>
                </label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Pharmacy Time"
                />
              </div>
              <div>
                <label className={labelCls}>Logo URL</label>
                <Input
                  value={logoUrl}
                  onChange={(e) => setLogoUrl(e.target.value)}
                  placeholder="https://… or /logo.svg"
                />
              </div>
              <div>
                <label className={labelCls}>Primary Color</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={primaryColor}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    className="h-9 w-9 cursor-pointer rounded border"
                  />
                  <Input
                    value={primaryColor}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                  />
                </div>
              </div>
              <div>
                <label className={labelCls}>Secondary Color</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={secondaryColor}
                    onChange={(e) => setSecondaryColor(e.target.value)}
                    className="h-9 w-9 cursor-pointer rounded border"
                  />
                  <Input
                    value={secondaryColor}
                    onChange={(e) => setSecondaryColor(e.target.value)}
                  />
                </div>
              </div>
              <div>
                <label className={labelCls}>Font (Headings)</label>
                <Input
                  value={fontHeadings}
                  onChange={(e) => setFontHeadings(e.target.value)}
                  placeholder="e.g. Inter, Georgia"
                />
              </div>
              <div>
                <label className={labelCls}>Font (Body)</label>
                <Input
                  value={fontBody}
                  onChange={(e) => setFontBody(e.target.value)}
                  placeholder="e.g. Inter, system-ui"
                />
              </div>
            </div>
          </CardSection>

          <CardSection title="Identity">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className={labelCls}>Archetype</label>
                <Input
                  value={archetype}
                  onChange={(e) => setArchetype(e.target.value)}
                  placeholder="e.g. trusted caretaker"
                />
              </div>
              <div>
                <label className={labelCls}>Industry</label>
                <Input
                  value={industry}
                  onChange={(e) => setIndustry(e.target.value)}
                  placeholder="e.g. telehealth"
                />
              </div>
              <div className="md:col-span-2">
                <label className={labelCls}>Tagline</label>
                <Input
                  value={tagline}
                  onChange={(e) => setTagline(e.target.value)}
                  placeholder="Short tagline"
                />
              </div>
              <div className="md:col-span-2">
                <label className={labelCls}>Mission</label>
                <textarea
                  className="block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  rows={2}
                  value={mission}
                  onChange={(e) => setMission(e.target.value)}
                  placeholder="Brand mission statement"
                />
              </div>
            </div>
          </CardSection>

          <CardSection title="Tone & Voice">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className={labelCls}>Voice Descriptors (comma-separated)</label>
                <Input
                  value={voiceDesc}
                  onChange={(e) => setVoiceDesc(e.target.value)}
                  placeholder="clinical, friendly, efficient"
                />
              </div>
              <div>
                <label className={labelCls}>Reading Level</label>
                <Select
                  value={readingLevel}
                  onChange={(e) => setReadingLevel(e.target.value)}
                >
                  <option value="grade_5">Grade 5</option>
                  <option value="grade_7">Grade 7</option>
                  <option value="grade_9">Grade 9</option>
                  <option value="grade_12">Grade 12</option>
                  <option value="professional">Professional</option>
                </Select>
              </div>
              <div>
                <label className={labelCls}>Formality</label>
                <Select
                  value={formality}
                  onChange={(e) => setFormality(e.target.value)}
                >
                  <option value="casual">Casual</option>
                  <option value="neutral">Neutral</option>
                  <option value="formal">Formal</option>
                </Select>
              </div>
            </div>
          </CardSection>

          <CardSection title="Visual Style">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className={labelCls}>Density</label>
                <Select
                  value={density}
                  onChange={(e) => setDensity(e.target.value)}
                >
                  <option value="spacious">Spacious</option>
                  <option value="default">Default</option>
                  <option value="compact">Compact</option>
                </Select>
              </div>
              <div>
                <label className={labelCls}>Style Description</label>
                <Input
                  value={styleDesc}
                  onChange={(e) => setStyleDesc(e.target.value)}
                  placeholder="e.g. minimal medical"
                />
              </div>
            </div>
          </CardSection>

          <CardSection title="Copy Style">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className={labelCls}>Voice</label>
                <textarea
                  className="block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  rows={2}
                  value={copyVoice}
                  onChange={(e) => setCopyVoice(e.target.value)}
                  placeholder="e.g. professional but human"
                />
              </div>
              <div className="md:col-span-2">
                <label className={labelCls}>Banned Words (comma-separated)</label>
                <Input
                  value={bannedWords}
                  onChange={(e) => setBannedWords(e.target.value)}
                  placeholder="slang, jargon"
                />
              </div>
            </div>
          </CardSection>
        </Stack>
      </form>
    </PageFrame>
  );
}
