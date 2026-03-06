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
import { prefillBrandFromUrl } from "@/lib/api";
import { buildDesignTokens } from "../token-helpers";

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
  const [wordmarkBold, setWordmarkBold] = useState("");
  const [wordmarkLight, setWordmarkLight] = useState("");
  const [fontHeadings, setFontHeadings] = useState("Inter");
  const [fontBody, setFontBody] = useState("Inter");
  const [website, setWebsite] = useState("");
  const [sitemapUrl, setSitemapUrl] = useState("");
  const [sitemapType, setSitemapType] = useState("ecommerce");
  const [prefillUrl, setPrefillUrl] = useState("");
  const [prefillLoading, setPrefillLoading] = useState(false);
  const [prefillError, setPrefillError] = useState<string | null>(null);
  const [error, setError] = useState("");

  const handlePrefillFromUrl = async () => {
    if (!prefillUrl.trim()) return;
    setPrefillError(null);
    setPrefillLoading(true);
    try {
      const data = await prefillBrandFromUrl(prefillUrl);
      setName(data.name || name);
      setWebsite(data.website || "");
      setLogoUrl(data.logo_url || "");
      if (data.primary_color) setPrimaryColor(data.primary_color);
      if (data.secondary_color) setSecondaryColor(data.secondary_color);
      if (data.font_headings) setFontHeadings(data.font_headings);
      if (data.font_body) setFontBody(data.font_body);
      setSitemapUrl(data.sitemap_url || "");
      setSitemapType(data.sitemap_type || "ecommerce");
      if (data.meta_description && !mission) setMission(data.meta_description);
      if (data.tagline) setTagline(data.tagline);
      if (data.industry) setIndustry(data.industry);
    } catch (err: unknown) {
      setPrefillError(err instanceof Error ? err.message : "Failed to fetch brand data");
    } finally {
      setPrefillLoading(false);
    }
  };

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
          website: website.trim() || undefined,
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
        design_tokens: buildDesignTokens({
          primaryColor,
          secondaryColor,
          fontHeadings,
          fontBody,
          logoUrl,
          wordmarkBold,
          wordmarkLight,
          sitemapUrl,
          sitemapType,
        }),
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

          <CardSection title="Prefill from URL">
            <p className="mb-3 text-body-small text-text-secondary">
              Enter the brand&apos;s website URL (e.g. stickygreenflower.com). We&apos;ll fetch the live site and extract colors, fonts, logo, and sitemap so the form is filled with real data—not placeholders.
            </p>
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-[200px] flex-1">
                <label className={labelCls}>Website URL</label>
                <Input
                  type="url"
                  placeholder="https://stickygreenflower.com"
                  value={prefillUrl}
                  onChange={(e) => setPrefillUrl(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handlePrefillFromUrl())}
                />
              </div>
              <Button
                type="button"
                variant="primary"
                disabled={prefillLoading || !prefillUrl.trim()}
                onClick={handlePrefillFromUrl}
              >
                {prefillLoading ? "Fetching…" : "Prefill from URL"}
              </Button>
            </div>
            {prefillError && (
              <div className="mt-2 rounded border border-state-dangerMuted bg-state-dangerMuted/20 px-3 py-2 text-body-small text-state-danger">
                {prefillError}
              </div>
            )}
          </CardSection>

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
                <label className={labelCls}>Website</label>
                <Input
                  type="url"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  placeholder="https://example.com"
                />
              </div>
              <div>
                <label className={labelCls}>Sitemap URL</label>
                <Input
                  type="url"
                  value={sitemapUrl}
                  onChange={(e) => setSitemapUrl(e.target.value)}
                  placeholder="https://example.com/sitemap.xml"
                />
              </div>
              <div>
                <label className={labelCls}>Sitemap type</label>
                <Select value={sitemapType} onChange={(e) => setSitemapType(e.target.value)}>
                  <option value="drupal">Drupal</option>
                  <option value="ecommerce">ecommerce / WooCommerce</option>
                  <option value="bigcommerce">BigCommerce</option>
                  <option value="shopify">Shopify</option>
                  <option value="shopify_json">Shopify (JSON)</option>
                </Select>
              </div>
              <div>
                <label className={labelCls}>Wordmark (bold part)</label>
                <Input
                  value={wordmarkBold}
                  onChange={(e) => setWordmarkBold(e.target.value)}
                  placeholder="e.g. Pharmacy"
                />
              </div>
              <div>
                <label className={labelCls}>Wordmark (light part)</label>
                <Input
                  value={wordmarkLight}
                  onChange={(e) => setWordmarkLight(e.target.value)}
                  placeholder="e.g. time"
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
