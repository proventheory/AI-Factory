"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Button,
  Input,
  Select,
  PageFrame,
  Stack,
  PageHeader,
  CardSection,
  LoadingSkeleton,
} from "@/components/ui";
import { TokenTreeView } from "@/components/TokenTreeView";
import { useBrandProfile, useUpdateBrandProfile } from "@/hooks/use-api";
import {
  buildDesignTokens,
  readDesignTokensFromBrand,
  type SocialLink,
  type ContactItem,
} from "../../token-helpers";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import { copyCampaignImageToCdn } from "@/lib/api";

export default function EditBrandPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: brand, isLoading, error: loadError } = useBrandProfile(id);
  const update = useUpdateBrandProfile();

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
  const [contactEmail, setContactEmail] = useState("");
  const [location, setLocation] = useState("");
  const [sitemapUrl, setSitemapUrl] = useState("");
  const [sitemapType, setSitemapType] = useState("ecommerce");
  const [socialMedia, setSocialMedia] = useState<SocialLink[]>([]);
  const [contactInfo, setContactInfo] = useState<ContactItem[]>([]);
  const [assetUrls, setAssetUrls] = useState<string[]>([]);
  const [assetUrlsText, setAssetUrlsText] = useState("");
  const [assetUploading, setAssetUploading] = useState(false);
  const assetFileInputRef = useRef<HTMLInputElement>(null);
  const [ctaText, setCtaText] = useState("");
  const [ctaLink, setCtaLink] = useState("");
  const [submitError, setSubmitError] = useState("");

  useEffect(() => {
    if (!brand) return;
    const identity = (brand.identity ?? {}) as Record<string, any>;
    const tone = (brand.tone ?? {}) as Record<string, any>;
    const vs = (brand.visual_style ?? {}) as Record<string, any>;
    const cs = (brand.copy_style ?? {}) as Record<string, any>;
    const dt = (brand.design_tokens ?? {}) as Record<string, unknown>;

    setName(brand.name ?? "");
    setArchetype(identity.archetype ?? "");
    setIndustry(identity.industry ?? "");
    setTagline(identity.tagline ?? "");
    setMission(identity.mission ?? "");
    setWebsite(identity.website ?? "");
    setContactEmail(identity.contact_email ?? "");
    setLocation(identity.location ?? "");
    setVoiceDesc((tone.voice_descriptors ?? []).join(", "));
    setReadingLevel(tone.reading_level ?? "grade_9");
    setFormality(tone.formality ?? "neutral");
    setDensity(vs.density ?? "default");
    setStyleDesc(vs.style_description ?? "");
    setCopyVoice(cs.voice ?? "");
    setBannedWords((cs.banned_words ?? []).join(", "));

    const tokens = readDesignTokensFromBrand(dt);
    setPrimaryColor(tokens.primaryColor);
    setSecondaryColor(tokens.secondaryColor);
    setLogoUrl(tokens.logoUrl);
    setWordmarkBold(tokens.wordmarkBold);
    setWordmarkLight(tokens.wordmarkLight);
    setFontHeadings(tokens.fontHeadings);
    setFontBody(tokens.fontBody);
    setSitemapUrl(tokens.sitemapUrl);
    setSitemapType(tokens.sitemapType);
    setSocialMedia(tokens.socialMedia);
    setContactInfo(tokens.contactInfo);
    setAssetUrls(tokens.assetUrls);
    setAssetUrlsText(tokens.assetUrls.join("\n"));
    const t = tokens as unknown as Record<string, unknown>;
    setCtaText(typeof t.ctaText === "string" ? t.ctaText : "");
    setCtaLink(typeof t.ctaLink === "string" ? t.ctaLink : "");
  }, [brand]);

  const handleAssetUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length || !id) return;
    const supabase = createSupabaseBrowserClient();
    if (!supabase) {
      setSubmitError("Upload is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to enable asset uploads.");
      return;
    }
    setAssetUploading(true);
    setSubmitError("");
    const added: string[] = [];
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const ext = file.name.split(".").pop() || "bin";
        const path = `brands/${id}/assets/${crypto.randomUUID()}.${ext}`;
        const { error } = await supabase.storage.from("upload").upload(path, file, { upsert: false });
        if (error) throw new Error(error.message);
        const { data } = supabase.storage.from("upload").getPublicUrl(path);
        added.push(data.publicUrl);
      }
      const next = [...assetUrls, ...added];
      setAssetUrls(next);
      setAssetUrlsText(next.join("\n"));
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setAssetUploading(false);
      e.target.value = "";
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setSubmitError("Name is required");
      return;
    }
    setSubmitError("");
    try {
      let resolvedLogoUrl = logoUrl.trim();
      if (resolvedLogoUrl && !/supabase\.co\/storage\/v1\/object\/public\/upload\//.test(resolvedLogoUrl)) {
        try {
          const { cdn_url } = await copyCampaignImageToCdn(resolvedLogoUrl);
          resolvedLogoUrl = cdn_url;
        } catch (logoErr) {
          setSubmitError(logoErr instanceof Error ? logoErr.message : "Failed to copy logo to CDN");
          return;
        }
      }
      await update.mutateAsync({
        id,
        name: name.trim(),
        identity: {
          archetype: archetype || undefined,
          industry: industry || undefined,
          tagline: tagline || undefined,
          mission: mission || undefined,
          website: website.trim() || undefined,
          contact_email: contactEmail.trim() || undefined,
          location: location.trim() || undefined,
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
          logoUrl: resolvedLogoUrl || logoUrl,
          wordmarkBold,
          wordmarkLight,
          sitemapUrl,
          sitemapType,
          socialMedia,
          contactInfo,
          assetUrls: assetUrlsText.split("\n").map((u) => u.trim()).filter(Boolean),
          ctaText,
          ctaLink,
        }),
      });
      router.push(`/brands/${id}`);
    } catch (err: any) {
      setSubmitError(err.message ?? "Failed to update brand");
    }
  };

  if (loadError) {
    return (
      <PageFrame>
        <Stack>
          <PageHeader title="Edit Brand" />
          <div className="rounded-lg border border-state-dangerMuted bg-state-dangerMuted/30 px-4 py-3 text-body-small text-state-danger">
            Error: {(loadError as Error).message}
          </div>
        </Stack>
      </PageFrame>
    );
  }

  if (isLoading || !brand) {
    return (
      <PageFrame>
        <Stack>
          <PageHeader title="Edit Brand" />
          <CardSection>
            <div className="space-y-3">
              <LoadingSkeleton className="h-10 w-full" />
              <LoadingSkeleton className="h-10 w-full" />
              <LoadingSkeleton className="h-10 w-3/4" />
            </div>
          </CardSection>
        </Stack>
      </PageFrame>
    );
  }

  const labelCls = "mb-1 block text-body-small font-medium text-text-primary";

  return (
    <PageFrame>
      <form onSubmit={handleSubmit}>
        <Stack>
          <PageHeader
            title={`Edit — ${brand.name}`}
            actions={
              <div className="flex gap-2">
                <Button type="button" variant="secondary" onClick={() => router.back()}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" disabled={update.isPending}>
                  {update.isPending ? "Saving\u2026" : "Save Changes"}
                </Button>
              </div>
            }
          />
          {submitError && (
            <div className="rounded-lg border border-state-dangerMuted bg-state-dangerMuted/30 px-4 py-3 text-body-small text-state-danger">
              {submitError}
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

          <CardSection title="Brand Identity">
            <p className="text-body-small text-text-secondary mb-4">
              Core identity, sitemap & links, social, contact, and assets. Used by email wizard, decks, reports, and initiatives.
            </p>

            <div className="space-y-6">
              <div>
                <h4 className="text-body font-medium text-text-primary mb-3">Identity</h4>
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
                    <label className={labelCls}>Contact email</label>
                    <Input
                      type="email"
                      value={contactEmail}
                      onChange={(e) => setContactEmail(e.target.value)}
                      placeholder="brand@example.com"
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Location</label>
                    <Input
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      placeholder="e.g. San Francisco, CA"
                    />
                  </div>
                </div>
              </div>

              <div>
                <h4 className="text-body font-medium text-text-primary mb-3">Sitemap & links</h4>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className={labelCls}>Brand sitemap type</label>
                    <Select
                      value={sitemapType}
                      onChange={(e) => setSitemapType(e.target.value)}
                    >
                      <option value="drupal">Drupal</option>
                      <option value="ecommerce">WooCommerce / ecommerce</option>
                      <option value="bigcommerce">BigCommerce</option>
                      <option value="shopify">Shopify</option>
                      <option value="shopify_json">Shopify (JSON)</option>
                    </Select>
                  </div>
                  <div className="md:col-span-2">
                    <label className={labelCls}>Brand sitemap URL</label>
                    <Input
                      type="url"
                      value={sitemapUrl}
                      onChange={(e) => setSitemapUrl(e.target.value)}
                      placeholder="https://example.com/sitemap_products.xml"
                    />
                  </div>
                  <div>
                    <label className={labelCls}>CTA button text</label>
                    <Input
                      value={ctaText}
                      onChange={(e) => setCtaText(e.target.value)}
                      placeholder="e.g. Shop now"
                    />
                  </div>
                  <div>
                    <label className={labelCls}>CTA link</label>
                    <Input
                      type="url"
                      value={ctaLink}
                      onChange={(e) => setCtaLink(e.target.value)}
                      placeholder="https://..."
                    />
                  </div>
                </div>
              </div>

              <div>
                <h4 className="text-body font-medium text-text-primary mb-3">Social</h4>
                {socialMedia.map((s, i) => (
                  <div key={i} className="flex gap-2 mb-2">
                    <Input
                      placeholder="Name (e.g. Facebook)"
                      value={s.name}
                      onChange={(e) => {
                        const next = [...socialMedia];
                        next[i] = { ...next[i], name: e.target.value };
                        setSocialMedia(next);
                      }}
                      className="flex-1"
                    />
                    <Input
                      placeholder="URL"
                      value={s.url}
                      onChange={(e) => {
                        const next = [...socialMedia];
                        next[i] = { ...next[i], url: e.target.value };
                        setSocialMedia(next);
                      }}
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setSocialMedia(socialMedia.filter((_, j) => j !== i))}
                    >
                      Remove
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setSocialMedia([...socialMedia, { name: "", url: "" }])}
                >
                  Add social link
                </Button>
              </div>

              <div>
                <h4 className="text-body font-medium text-text-primary mb-3">Contact</h4>
                {contactInfo.map((c, i) => (
                  <div key={i} className="flex gap-2 mb-2">
                    <Input
                      placeholder="Type (e.g. email, phone)"
                      value={c.type}
                      onChange={(e) => {
                        const next = [...contactInfo];
                        next[i] = { ...next[i], type: e.target.value };
                        setContactInfo(next);
                      }}
                      className="flex-1"
                    />
                    <Input
                      placeholder="Value"
                      value={c.value}
                      onChange={(e) => {
                        const next = [...contactInfo];
                        next[i] = { ...next[i], value: e.target.value };
                        setContactInfo(next);
                      }}
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setContactInfo(contactInfo.filter((_, j) => j !== i))}
                    >
                      Remove
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setContactInfo([...contactInfo, { type: "", value: "" }])}
                >
                  Add contact
                </Button>
              </div>

              <div>
                <h4 className="text-body font-medium text-text-primary mb-3">Asset URLs</h4>
                <p className="text-body-small text-text-secondary mb-2">
                  Add image or asset URLs (one per line) or upload files. Used by initiatives and email.
                </p>
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <input
                    ref={assetFileInputRef}
                    type="file"
                    accept="image/*,.png,.jpg,.jpeg,.gif,.webp,.svg"
                    multiple
                    className="hidden"
                    onChange={handleAssetUpload}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={assetUploading || !createSupabaseBrowserClient()}
                    onClick={() => assetFileInputRef.current?.click()}
                  >
                    {assetUploading ? "Uploading…" : "Upload files"}
                  </Button>
                  {!createSupabaseBrowserClient() && (
                    <span className="text-body-small text-text-secondary">Configure Supabase to enable uploads.</span>
                  )}
                </div>
                <textarea
                  className="block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 font-mono text-body-small"
                  rows={4}
                  value={assetUrlsText}
                  onChange={(e) => {
                    setAssetUrlsText(e.target.value);
                    setAssetUrls(e.target.value.split("\n").map((u) => u.trim()).filter(Boolean));
                  }}
                  placeholder="https://example.com/hero.jpg&#10;https://example.com/logo.png"
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

          <CardSection title="Design tokens (read-only)">
            <TokenTreeView tokens={(brand.design_tokens ?? {}) as Record<string, unknown>} />
          </CardSection>
        </Stack>
      </form>
    </PageFrame>
  );
}
