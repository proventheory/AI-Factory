"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
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
  validateDesignTokens,
  mergeDesignTokensExtended,
  type SocialLink,
  type ContactItem,
  type DesignTokensExtended,
  type DesignTokensInput,
} from "../../token-helpers";

/** Linear gradient for container backgrounds (matches token-helpers.GradientEntry). */
type GradientEntry = { name: string; type: "linear"; stops: string[] };
import { createSupabaseBrowserClient } from "@/lib/supabase";
import * as api from "@/lib/api";

const FOOTER_LINK_KEYS: { key: string; label: string; group: "popular" | "company" | "legal" }[] = [
  { key: "popularWeightManagementUrl", label: "Featured link 1", group: "popular" },
  { key: "popularHormoneReplacementUrl", label: "Featured link 2", group: "popular" },
  { key: "popularIvTherapyUrl", label: "Featured link 3", group: "popular" },
  { key: "popularSexualWellnessUrl", label: "Featured link 4", group: "popular" },
  { key: "popularThyroidUrl", label: "Featured link 5", group: "popular" },
  { key: "popularGlp1Url", label: "Featured link 6", group: "popular" },
  { key: "popularOzempicUrl", label: "Featured link 7", group: "popular" },
  { key: "popularWegovyUrl", label: "Featured link 8", group: "popular" },
  { key: "popularSermorelinUrl", label: "Featured link 9", group: "popular" },
  { key: "popularNadUrl", label: "Featured link 10", group: "popular" },
  { key: "howItWorksUrl", label: "How it works", group: "company" },
  { key: "faqUrl", label: "FAQ", group: "company" },
  { key: "contactUrl", label: "Contact Us", group: "company" },
  { key: "supportUrl", label: "Support", group: "company" },
  { key: "termsUrl", label: "Terms & Conditions", group: "legal" },
  { key: "privacyUrl", label: "Privacy Policy", group: "legal" },
  { key: "hipaaUrl", label: "Other legal / compliance", group: "legal" },
];

const CONTROL_PLANE_API = process.env.NEXT_PUBLIC_CONTROL_PLANE_API ?? "http://localhost:3001";

export default function EditBrandPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: brand, isLoading, error: loadError } = useBrandProfile(id);
  const update = useUpdateBrandProfile();
  const [googleConnected, setGoogleConnected] = useState<boolean | null>(null);
  const [googleDisconnectBusy, setGoogleDisconnectBusy] = useState(false);
  const [googleConnectError, setGoogleConnectError] = useState<string | null>(null);
  const [klaviyoConnected, setKlaviyoConnected] = useState<boolean | null>(null);
  const [klaviyoDisconnectBusy, setKlaviyoDisconnectBusy] = useState(false);
  const [klaviyoConnectError, setKlaviyoConnectError] = useState<string | null>(null);
  const [klaviyoApiKey, setKlaviyoApiKey] = useState("");
  const [klaviyoDefaultListId, setKlaviyoDefaultListId] = useState("");
  const [klaviyoConnectBusy, setKlaviyoConnectBusy] = useState(false);
  const [shopifyConnected, setShopifyConnected] = useState<boolean | null>(null);
  const [shopifyShopDomain, setShopifyShopDomain] = useState<string | null>(null);
  const [shopifyDisconnectBusy, setShopifyDisconnectBusy] = useState(false);
  const [shopifyConnectError, setShopifyConnectError] = useState<string | null>(null);
  const [shopifyConnectBusy, setShopifyConnectBusy] = useState(false);
  const [shopifyShopDomainInput, setShopifyShopDomainInput] = useState("");
  const [shopifyClientId, setShopifyClientId] = useState("");
  const [shopifyClientSecret, setShopifyClientSecret] = useState("");

  const fetchGoogleConnected = useCallback(() => {
    if (!id) return;
    api.getBrandGoogleConnected(id).then((r) => setGoogleConnected(r.connected)).catch(() => setGoogleConnected(false));
  }, [id]);

  const fetchKlaviyoConnected = useCallback(() => {
    if (!id) return;
    api.getBrandKlaviyoConnected(id).then((r) => setKlaviyoConnected(r.connected)).catch(() => setKlaviyoConnected(false));
  }, [id]);

  const fetchShopifyConnected = useCallback(() => {
    if (!id) return;
    api.getBrandShopifyConnected(id).then((r) => {
      setShopifyConnected(r.connected);
      setShopifyShopDomain(r.shop_domain ?? null);
    }).catch(() => setShopifyConnected(false));
  }, [id]);

  useEffect(() => {
    fetchGoogleConnected();
  }, [fetchGoogleConnected]);

  useEffect(() => {
    fetchKlaviyoConnected();
  }, [fetchKlaviyoConnected]);

  useEffect(() => {
    fetchShopifyConnected();
  }, [fetchShopifyConnected]);

  useEffect(() => {
    const connected = searchParams.get("google_connected");
    const err = searchParams.get("error");
    if (connected === "1" || err) {
      setGoogleConnected(connected === "1");
      setGoogleConnectError(err ? decodeURIComponent(err) : null);
      router.replace(`/brands/${id}/edit`, { scroll: false });
    }
  }, [id, router, searchParams]);

  /** Direct link so browser navigates to API → API 302 to Google. Avoids fetch-then-redirect being blocked. */
  const connectGoogleHref =
    typeof window !== "undefined" && id
      ? `${CONTROL_PLANE_API}/v1/seo/google/auth?brand_id=${encodeURIComponent(id)}&redirect_uri=${encodeURIComponent(`${window.location.origin}/brands/${id}/edit`)}&redirect=1`
      : "#";

  async function handleDisconnectGoogle() {
    if (!id) return;
    setGoogleDisconnectBusy(true);
    try {
      await api.deleteBrandGoogleCredentials(id);
      setGoogleConnected(false);
    } finally {
      setGoogleDisconnectBusy(false);
    }
  }

  async function handleConnectKlaviyo(e?: React.FormEvent) {
    e?.preventDefault();
    if (!id || !klaviyoApiKey.trim()) return;
    setKlaviyoConnectBusy(true);
    setKlaviyoConnectError(null);
    try {
      await api.putBrandKlaviyoCredentials(id, {
        api_key: klaviyoApiKey.trim(),
        default_list_id: klaviyoDefaultListId.trim() || undefined,
      });
      setKlaviyoConnected(true);
      setKlaviyoApiKey("");
      setKlaviyoDefaultListId("");
    } catch (err) {
      setKlaviyoConnectError(err instanceof Error ? err.message : "Failed to connect");
    } finally {
      setKlaviyoConnectBusy(false);
    }
  }

  async function handleDisconnectKlaviyo() {
    if (!id) return;
    setKlaviyoDisconnectBusy(true);
    try {
      await api.deleteBrandKlaviyoCredentials(id);
      setKlaviyoConnected(false);
    } finally {
      setKlaviyoDisconnectBusy(false);
    }
  }

  async function handleConnectShopify(e?: React.FormEvent) {
    e?.preventDefault();
    if (!id || !shopifyShopDomainInput.trim() || !shopifyClientId.trim() || !shopifyClientSecret.trim()) return;
    setShopifyConnectBusy(true);
    setShopifyConnectError(null);
    try {
      await api.putBrandShopifyCredentials(id, {
        shop_domain: shopifyShopDomainInput.trim(),
        client_id: shopifyClientId.trim(),
        client_secret: shopifyClientSecret.trim(),
      });
      setShopifyConnected(true);
      setShopifyShopDomain(shopifyShopDomainInput.trim());
      setShopifyShopDomainInput("");
      setShopifyClientId("");
      setShopifyClientSecret("");
    } catch (err) {
      setShopifyConnectError(err instanceof Error ? err.message : "Failed to connect");
    } finally {
      setShopifyConnectBusy(false);
    }
  }

  async function handleDisconnectShopify() {
    if (!id) return;
    setShopifyDisconnectBusy(true);
    try {
      await api.deleteBrandShopifyCredentials(id);
      setShopifyConnected(false);
      setShopifyShopDomain(null);
    } finally {
      setShopifyDisconnectBusy(false);
    }
  }

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
  const [logoUrlWhite, setLogoUrlWhite] = useState("");
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
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoWhiteUploading, setLogoWhiteUploading] = useState(false);
  const logoFileInputRef = useRef<HTMLInputElement>(null);
  const logoWhiteFileInputRef = useRef<HTMLInputElement>(null);
  const [ctaText, setCtaText] = useState("");
  const [ctaLink, setCtaLink] = useState("");
  const [footerUrls, setFooterUrls] = useState<Record<string, string>>({});
  const [headingHighlightColor, setHeadingHighlightColor] = useState("");
  const [gradients, setGradients] = useState<GradientEntry[]>([]);
  const [submitError, setSubmitError] = useState("");
  const [brandScale, setBrandScale] = useState<Record<string, string>>({});
  const [headingScale, setHeadingScale] = useState<Record<string, { size: string; weight: number }>>({});
  const [bodySize, setBodySize] = useState("");
  const [captionSize, setCaptionSize] = useState("");
  const [fontWeights, setFontWeights] = useState<Record<string, number>>({ normal: 400, medium: 500, semibold: 600, bold: 700 });

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
    const tokens = readDesignTokensFromBrand(dt);
    const emailFromContact = tokens.contactInfo.find((c) => (c.type ?? "").toLowerCase() === "email");
    setContactEmail(identity.contact_email ?? emailFromContact?.value ?? "");
    setLocation(identity.location ?? "");
    setVoiceDesc((tone.voice_descriptors ?? []).join(", "));
    setReadingLevel(tone.reading_level ?? "grade_9");
    setFormality(tone.formality ?? "neutral");
    setDensity(vs.density ?? "default");
    setStyleDesc(vs.style_description ?? "");
    setCopyVoice(cs.voice ?? "");
    setBannedWords((cs.banned_words ?? []).join(", "));

    setPrimaryColor(tokens.primaryColor);
    setSecondaryColor(tokens.secondaryColor);
    setLogoUrl(tokens.logoUrl);
    setLogoUrlWhite(tokens.logoUrlWhite);
    setWordmarkBold(tokens.wordmarkBold);
    setWordmarkLight(tokens.wordmarkLight);
    setFontHeadings(tokens.fontHeadings);
    setFontBody(tokens.fontBody);
    setSitemapUrl(tokens.sitemapUrl);
    setSitemapType(tokens.sitemapType);
    setSocialMedia(tokens.socialMedia);
    setContactInfo(tokens.contactInfo.filter((c) => (c.type ?? "").toLowerCase() !== "email"));
    setAssetUrls(tokens.assetUrls);
    setAssetUrlsText(tokens.assetUrls.join("\n"));
    const t = tokens as unknown as Record<string, unknown>;
    setCtaText(typeof t.ctaText === "string" ? t.ctaText : "");
    setFooterUrls(typeof tokens.footerUrls === "object" && tokens.footerUrls !== null ? { ...tokens.footerUrls } : {});
    const tokensExt = tokens as unknown as { headingHighlightColor?: string; gradients?: unknown[] };
    setHeadingHighlightColor(typeof tokensExt.headingHighlightColor === "string" ? tokensExt.headingHighlightColor : "");
    const g = tokensExt.gradients;
    setGradients(Array.isArray(g) ? g.filter((e): e is GradientEntry => e != null && typeof e === "object" && (e as GradientEntry).type === "linear" && Array.isArray((e as GradientEntry).stops)) : []);
    setCtaLink(typeof t.ctaLink === "string" ? t.ctaLink : "");

    const colors = (dt.colors ?? dt.color) as Record<string, Record<string, string>> | undefined;
    const existingBrand = colors?.brand ?? {};
    setBrandScale(existingBrand as Record<string, string>);
    const typo = dt.typography as Record<string, unknown> | undefined;
    const heading = (typo?.heading ?? {}) as Record<string, { size?: string; weight?: number }>;
    const headMap: Record<string, { size: string; weight: number }> = {};
    for (const [k, v] of Object.entries(heading)) {
      if (v && (typeof v.size === "string" || typeof v.weight === "number"))
        headMap[k] = { size: v.size ?? "1rem", weight: typeof v.weight === "number" ? v.weight : 700 };
    }
    setHeadingScale(headMap);
    const body = typo?.body as { default?: { size?: string } } | undefined;
    setBodySize(body?.default?.size ?? "");
    const caption = typo?.caption as { size?: string } | undefined;
    setCaptionSize(caption?.size ?? "");
    const fw = (typo?.fontWeight ?? {}) as Record<string, number>;
    setFontWeights(Object.keys(fw).length ? fw : { normal: 400, medium: 500, semibold: 600, bold: 700 });
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

  const uploadLogoToStorage = async (
    file: File,
    setUploading: (v: boolean) => void,
    setUrl: (v: string) => void,
    prefix: string,
  ) => {
    if (!id) return;
    const supabase = createSupabaseBrowserClient();
    if (!supabase) {
      setSubmitError("Upload is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to enable logo uploads.");
      return;
    }
    setUploading(true);
    setSubmitError("");
    try {
      const ext = file.name.split(".").pop() || "bin";
      const path = `brands/${id}/assets/${prefix}-${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("upload").upload(path, file, { upsert: false });
      if (error) throw new Error(error.message);
      const { data } = supabase.storage.from("upload").getPublicUrl(path);
      setUrl(data.publicUrl);
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : "Logo upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await uploadLogoToStorage(file, setLogoUploading, setLogoUrl, "logo");
    e.target.value = "";
  };

  const handleLogoWhiteUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await uploadLogoToStorage(file, setLogoWhiteUploading, setLogoUrlWhite, "logo-white");
    e.target.value = "";
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
          const { cdn_url } = await api.copyCampaignImageToCdn(resolvedLogoUrl);
          resolvedLogoUrl = cdn_url;
        } catch (logoErr) {
          setSubmitError(logoErr instanceof Error ? logoErr.message : "Failed to copy logo to CDN");
          return;
        }
      }
      let resolvedLogoUrlWhite = logoUrlWhite.trim();
      if (resolvedLogoUrlWhite && !/supabase\.co\/storage\/v1\/object\/public\/upload\//.test(resolvedLogoUrlWhite)) {
        try {
          const { cdn_url } = await api.copyCampaignImageToCdn(resolvedLogoUrlWhite);
          resolvedLogoUrlWhite = cdn_url;
        } catch (logoErr) {
          setSubmitError(logoErr instanceof Error ? logoErr.message : "Failed to copy white logo to CDN");
          return;
        }
      }
      const designInput: Partial<DesignTokensInput> = {
        primaryColor,
        secondaryColor,
        fontHeadings,
        fontBody,
        logoUrl: resolvedLogoUrl || logoUrl,
        logoUrlWhite: resolvedLogoUrlWhite || logoUrlWhite,
        wordmarkBold,
        wordmarkLight,
        sitemapUrl,
        sitemapType,
        socialMedia,
        contactInfo: contactInfo.filter((c) => (c.type ?? "").toLowerCase() !== "email"),
        assetUrls: assetUrls.length ? assetUrls : assetUrlsText.split("\n").map((u) => u.trim()).filter(Boolean),
        ctaText,
        ctaLink,
        footerUrls: Object.keys(footerUrls).length ? footerUrls : undefined,
        headingHighlightColor: headingHighlightColor.trim() || undefined,
      };
      if (gradients.length > 0) Object.assign(designInput, { gradients });
      const baseTokens = buildDesignTokens(designInput);
      const extended: DesignTokensExtended = {};
      const scaleFiltered = Object.fromEntries(Object.entries(brandScale).filter(([, v]) => v && v.trim()));
      if (Object.keys(scaleFiltered).length > 0) extended.brandScale = scaleFiltered;
      const typoExt: DesignTokensExtended["typography"] = {};
      if (Object.keys(headingScale).length > 0) typoExt.heading = headingScale;
      if (bodySize.trim()) typoExt.body = { default: { size: bodySize.trim(), weight: 400 } };
      if (captionSize.trim()) typoExt.caption = { size: captionSize.trim(), weight: 400 };
      if (Object.keys(fontWeights).length > 0) typoExt.fontWeight = fontWeights;
      if (Object.keys(typoExt).length > 0) extended.typography = typoExt;
      const mergedTokens = mergeDesignTokensExtended(
        baseTokens,
        Object.keys(extended).length > 0 ? extended : null
      );
      const validation = validateDesignTokens(mergedTokens);
      if (!validation.valid) {
        setSubmitError(`Token validation: ${validation.errors.join(". ")}`);
        return;
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
        design_tokens: mergedTokens,
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
      <form onSubmit={handleSubmit} className="w-full max-w-full min-w-0 pr-14 sm:pr-0">
        <Stack className="min-w-0">
          <PageHeader
            title={`Edit — ${brand.name}`}
            actions={
              <div className="flex flex-wrap items-center gap-2">
                {googleConnected === true ? (
                  <>
                    <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-emerald-100 text-emerald-800 text-sm font-medium">Google connected</span>
                    <Button type="button" variant="secondary" size="sm" onClick={handleDisconnectGoogle} disabled={googleDisconnectBusy}>
                      {googleDisconnectBusy ? "Disconnecting…" : "Disconnect Google"}
                    </Button>
                  </>
                ) : (
                  <a href={connectGoogleHref} className="inline-flex items-center justify-center rounded-md border border-border bg-bg px-3 py-1.5 text-sm font-medium text-fg hover:bg-fg-muted/10" title="Connect Search Console & GA4 for this brand">
                    Connect Google
                  </a>
                )}
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

          <CardSection title="Google (GSC / GA4)">
            <p className="text-body-small text-text-secondary mb-3">
              Connect the Google account that has access to Search Console and GA4 for this brand. SEO initiatives that use this brand will use this connection.
            </p>
            {googleConnectError && (
              <div className="mb-3 rounded-lg border border-state-dangerMuted bg-state-dangerMuted/30 px-3 py-2 text-body-small text-state-danger">
                {googleConnectError}
              </div>
            )}
            {googleConnected === true ? (
              <div className="flex items-center gap-3 flex-wrap">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-100 text-emerald-800 text-sm">Google connected</span>
                <Button type="button" variant="secondary" onClick={handleDisconnectGoogle} disabled={googleDisconnectBusy}>
                  {googleDisconnectBusy ? "Disconnecting…" : "Disconnect"}
                </Button>
              </div>
            ) : (
              <a href={connectGoogleHref} className="inline-flex items-center justify-center rounded-md bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600">
                Connect Google
              </a>
            )}
          </CardSection>

          <CardSection title="Klaviyo">
            <p className="text-body-small text-text-secondary mb-3">
              Connect Klaviyo for this brand to push email templates and campaigns from the Email Design Generator. After connecting, use <strong>Orchestration → Klaviyo</strong> to push campaigns and create flows.
            </p>
            {klaviyoConnectError && (
              <div className="mb-3 rounded-lg border border-state-dangerMuted bg-state-dangerMuted/30 px-3 py-2 text-body-small text-state-danger">
                {klaviyoConnectError}
              </div>
            )}
            {klaviyoConnected === true ? (
              <div className="flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-100 text-emerald-800 text-sm font-medium">Klaviyo connected</span>
                <Button type="button" variant="secondary" onClick={handleDisconnectKlaviyo} disabled={klaviyoDisconnectBusy}>
                  {klaviyoDisconnectBusy ? "Disconnecting…" : "Disconnect Klaviyo"}
                </Button>
                <Link href="/klaviyo" className="text-body-small text-brand-600 hover:underline">Go to Klaviyo page →</Link>
              </div>
            ) : (
              <div className="space-y-4 max-w-md">
                <div>
                  <label className={labelCls}>Private API key <span className="text-state-danger">*</span></label>
                  <p className="text-body-small text-text-muted mb-1">Get your key from Klaviyo → Settings → API Keys (create a Private key with Campaigns and Templates scope).</p>
                  <Input
                    type="password"
                    value={klaviyoApiKey}
                    onChange={(e) => setKlaviyoApiKey(e.target.value)}
                    placeholder="pk_…"
                    autoComplete="off"
                  />
                </div>
                <div>
                  <label className={labelCls}>Default list ID (optional)</label>
                  <Input
                    value={klaviyoDefaultListId}
                    onChange={(e) => setKlaviyoDefaultListId(e.target.value)}
                    placeholder="Used as default audience when scheduling campaigns"
                  />
                </div>
                <Button type="button" variant="primary" disabled={klaviyoConnectBusy || !klaviyoApiKey.trim()} onClick={handleConnectKlaviyo}>
                  {klaviyoConnectBusy ? "Connecting…" : "Connect Klaviyo"}
                </Button>
              </div>
            )}
          </CardSection>

          <CardSection title="Shopify">
            <p className="text-body-small text-text-secondary mb-3">
              Connect Shopify for this brand (Dev Dashboard app: Client ID + Secret). Used by SEO Migration Wizard, MCP, and other tools. AI Factory exchanges credentials for short-lived Admin API tokens; the secret is stored encrypted and tokenized at the brand level.
            </p>
            {shopifyConnectError && (
              <div className="mb-3 rounded-lg border border-state-dangerMuted bg-state-dangerMuted/30 px-3 py-2 text-body-small text-state-danger">
                {shopifyConnectError}
              </div>
            )}
            {shopifyConnected === true ? (
              <div className="flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-100 text-emerald-800 text-sm font-medium">
                  Shopify connected {shopifyShopDomain ? `(${shopifyShopDomain})` : ""}
                </span>
                <Button type="button" variant="secondary" onClick={handleDisconnectShopify} disabled={shopifyDisconnectBusy}>
                  {shopifyDisconnectBusy ? "Disconnecting…" : "Disconnect Shopify"}
                </Button>
                <Link href="/seo-migration" className="text-body-small text-brand-600 hover:underline">SEO Migration Wizard →</Link>
              </div>
            ) : (
              <div className="space-y-4 max-w-md">
                <div>
                  <label className={labelCls}>Shop domain <span className="text-state-danger">*</span></label>
                  <p className="text-body-small text-text-muted mb-1">Your store’s .myshopify.com domain (e.g. your-store.myshopify.com).</p>
                  <Input
                    value={shopifyShopDomainInput}
                    onChange={(e) => setShopifyShopDomainInput(e.target.value)}
                    placeholder="your-store.myshopify.com"
                    autoComplete="off"
                  />
                </div>
                <div>
                  <label className={labelCls}>Client ID <span className="text-state-danger">*</span></label>
                  <p className="text-body-small text-text-muted mb-1">From Shopify Dev Dashboard → Settings.</p>
                  <Input
                    value={shopifyClientId}
                    onChange={(e) => setShopifyClientId(e.target.value)}
                    placeholder="Client ID"
                    autoComplete="off"
                  />
                </div>
                <div>
                  <label className={labelCls}>Client Secret <span className="text-state-danger">*</span></label>
                  <p className="text-body-small text-text-muted mb-1">Store securely. Rotate if ever exposed. Never commit to repos.</p>
                  <Input
                    type="password"
                    value={shopifyClientSecret}
                    onChange={(e) => setShopifyClientSecret(e.target.value)}
                    placeholder="Client Secret"
                    autoComplete="new-password"
                  />
                </div>
                <Button type="button" variant="primary" disabled={shopifyConnectBusy || !shopifyShopDomainInput.trim() || !shopifyClientId.trim() || !shopifyClientSecret.trim()} onClick={handleConnectShopify}>
                  {shopifyConnectBusy ? "Connecting…" : "Connect Shopify"}
                </Button>
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
                <div className="flex flex-wrap gap-2">
                  <Input
                    value={logoUrl}
                    onChange={(e) => setLogoUrl(e.target.value)}
                    placeholder="https://… or upload below"
                    className="min-w-0 flex-1 w-full sm:min-w-[200px]"
                  />
                  <input
                    ref={logoFileInputRef}
                    type="file"
                    accept="image/*,.png,.jpg,.jpeg,.gif,.webp,.svg"
                    className="hidden"
                    onChange={handleLogoUpload}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    className="shrink-0"
                    disabled={logoUploading || !createSupabaseBrowserClient()}
                    onClick={() => logoFileInputRef.current?.click()}
                  >
                    {logoUploading ? "Uploading…" : "Upload"}
                  </Button>
                </div>
              </div>
              <div>
                <label className={labelCls}>Logo URL (white)</label>
                <div className="flex flex-wrap gap-2">
                  <Input
                    value={logoUrlWhite}
                    onChange={(e) => setLogoUrlWhite(e.target.value)}
                    placeholder="https://… or upload below (for dark backgrounds)"
                    className="min-w-0 flex-1 w-full sm:min-w-[200px]"
                  />
                  <input
                    ref={logoWhiteFileInputRef}
                    type="file"
                    accept="image/*,.png,.jpg,.jpeg,.gif,.webp,.svg"
                    className="hidden"
                    onChange={handleLogoWhiteUpload}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    className="shrink-0"
                    disabled={logoWhiteUploading || !createSupabaseBrowserClient()}
                    onClick={() => logoWhiteFileInputRef.current?.click()}
                  >
                    {logoWhiteUploading ? "Uploading…" : "Upload"}
                  </Button>
                </div>
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
                <label className={labelCls}>Title highlight color (H1/H2)</label>
                <p className="text-body-small text-text-secondary mb-1">Design touch: color applied to part of a title (e.g. #c2b6f8). Not for links. When you don’t use color, titles often use bold on a keyword instead since H1/H2 are not bold weight.</p>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={headingHighlightColor || "#c2b6f8"}
                    onChange={(e) => setHeadingHighlightColor(e.target.value)}
                    className="h-9 w-9 cursor-pointer rounded border"
                  />
                  <Input
                    value={headingHighlightColor}
                    onChange={(e) => setHeadingHighlightColor(e.target.value)}
                    placeholder="#c2b6f8"
                  />
                </div>
              </div>
              <div>
                <h4 className="text-body font-medium text-text-primary mb-2 mt-4">Gradients (container backgrounds)</h4>
                <p className="text-body-small text-text-secondary mb-3">Linear gradients used for hero/container backgrounds. Exposed as gradient_0, gradient_1, gradientContainer1, gradientContainer2, gradient_&lt;name&gt;.</p>
                {gradients.map((grad, gi) => (
                  <div key={gi} className="mb-4 p-4 rounded-lg border border-border bg-card/50">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <span className="rounded border border-border h-8 w-16 shrink-0" style={{ background: grad.stops.length >= 2 ? `linear-gradient(135deg, ${grad.stops.join(", ")})` : "#ccc" }} />
                      <Input
                        placeholder="Name (e.g. Linear 2)"
                        value={grad.name}
                        onChange={(e) => {
                          const next = [...gradients];
                          next[gi] = { ...next[gi], name: e.target.value };
                          setGradients(next);
                        }}
                        className="max-w-[200px]"
                      />
                      <span className="text-body-small text-text-secondary">Linear gradient</span>
                      <Button type="button" variant="secondary" className="shrink-0 ml-auto" onClick={() => setGradients(gradients.filter((_, j) => j !== gi))}>Remove</Button>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 mt-2">
                      {grad.stops.map((stop, si) => (
                        <div key={si} className="flex items-center gap-1">
                          <input
                            type="color"
                            value={/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(stop) ? stop : "#000000"}
                            onChange={(e) => {
                              const next = [...gradients];
                              const stops = [...next[gi].stops];
                              stops[si] = e.target.value;
                              next[gi] = { ...next[gi], stops };
                              setGradients(next);
                            }}
                            className="h-8 w-8 cursor-pointer rounded border border-border"
                          />
                          <Input
                            value={stop}
                            onChange={(e) => {
                              const next = [...gradients];
                              const stops = [...next[gi].stops];
                              stops[si] = e.target.value;
                              next[gi] = { ...next[gi], stops };
                              setGradients(next);
                            }}
                            placeholder="#hex"
                            className="w-24 font-mono text-body-small"
                          />
                          {grad.stops.length > 2 && (
                            <Button type="button" variant="secondary" className="shrink-0 h-8 w-8 p-0" onClick={() => setGradients(gradients.map((g, j) => j !== gi ? g : { ...g, stops: g.stops.filter((_, s) => s !== si) }))}>−</Button>
                          )}
                        </div>
                      ))}
                      <Button type="button" variant="secondary" size="sm" onClick={() => setGradients(gradients.map((g, j) => j !== gi ? g : { ...g, stops: [...g.stops, "#6b7280"] }))}>Add stop</Button>
                    </div>
                  </div>
                ))}
                <Button type="button" variant="secondary" onClick={() => setGradients([...gradients, { name: "Linear " + (gradients.length + 1), type: "linear", stops: ["#2F2A3C", "#3B3350"] }])}>
                  Add gradient
                </Button>
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
                    <label className={labelCls}>Product sitemap type</label>
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
                    <label className={labelCls}>Product sitemap URL</label>
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
                <h4 className="text-body font-medium text-text-primary mb-3">Footer & page links</h4>
                <p className="text-body-small text-text-secondary mb-3">
                  Featured category links, company, and legal URLs. Used in footers and other assets that resolve placeholders from this brand.
                </p>
                {(["popular", "company", "legal"] as const).map((group) => {
                  const groupLabels = { popular: "Featured / category links", company: "Company", legal: "Legal" };
                  const items = FOOTER_LINK_KEYS.filter((f) => f.group === group);
                  return (
                    <div key={group} className="mb-6">
                      <h5 className="text-body-small font-medium text-text-secondary mb-2">{groupLabels[group]}</h5>
                      <div className="grid gap-3 md:grid-cols-2">
                        {items.map(({ key, label }) => (
                          <div key={key}>
                            <label className={labelCls}>{label}</label>
                            <Input
                              type="url"
                              value={footerUrls[key] ?? ""}
                              onChange={(e) => setFooterUrls((prev) => ({ ...prev, [key]: e.target.value }))}
                              placeholder="https://..."
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div>
                <h4 className="text-body font-medium text-text-primary mb-3">Social</h4>
                {socialMedia.map((s, i) => (
                  <div key={i} className="flex flex-col sm:flex-row sm:items-center gap-2 mb-3 p-3 rounded-lg border border-border bg-card/50">
                    <Input
                      placeholder="Name (e.g. Facebook)"
                      value={s.name}
                      onChange={(e) => {
                        const next = [...socialMedia];
                        next[i] = { ...next[i], name: e.target.value };
                        setSocialMedia(next);
                      }}
                      className="min-w-0 flex-1 w-full"
                    />
                    <Input
                      placeholder="URL"
                      type="url"
                      value={s.url}
                      onChange={(e) => {
                        const next = [...socialMedia];
                        next[i] = { ...next[i], url: e.target.value };
                        setSocialMedia(next);
                      }}
                      className="min-w-0 flex-1 w-full"
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      className="shrink-0 self-start sm:self-center"
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
                <h4 className="text-body font-medium text-text-primary mb-3">Other contact (phone, address, etc.)</h4>
                <p className="text-body-small text-text-secondary mb-2">Contact email is set in Identity above (single source for templates). Add only phone, address, or other non-email contact methods here.</p>
                {contactInfo.map((c, i) => (
                  <div key={i} className="flex flex-col sm:flex-row sm:items-center gap-2 mb-3 p-3 rounded-lg border border-border bg-card/50">
                    <Input
                      placeholder="Type (e.g. phone, address)"
                      value={c.type}
                      onChange={(e) => {
                        const next = [...contactInfo];
                        next[i] = { ...next[i], type: e.target.value };
                        setContactInfo(next);
                      }}
                      className="min-w-0 flex-1 w-full"
                    />
                    <Input
                      placeholder="Value"
                      value={c.value}
                      onChange={(e) => {
                        const next = [...contactInfo];
                        next[i] = { ...next[i], value: e.target.value };
                        setContactInfo(next);
                      }}
                      className="min-w-0 flex-1 w-full"
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      className="shrink-0 self-start sm:self-center"
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
                <div className="flex flex-wrap items-center gap-2 mb-3">
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
                {assetUrls.length > 0 ? (
                  <ul className="space-y-3 mb-3">
                    {assetUrls.map((url, i) => (
                      <li key={i} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 rounded-md border border-slate-200 bg-slate-50/50 p-3">
                        <div className="flex items-center gap-3 sm:flex-row min-w-0">
                          <div className="flex-shrink-0 w-14 h-14 rounded border border-slate-200 bg-white overflow-hidden flex items-center justify-center">
                            {/\.(png|jpg|jpeg|gif|webp|svg)(\?|$)/i.test(url) ? (
                              <>
                                <img
                                  src={url}
                                  alt=""
                                  loading="lazy"
                                  className="max-w-full max-h-full object-contain"
                                  onError={(e) => {
                                    e.currentTarget.style.display = "none";
                                    const fallback = e.currentTarget.nextElementSibling as HTMLElement | null;
                                    if (fallback) fallback.hidden = false;
                                  }}
                                />
                                <span className="text-body-small text-fg-muted" hidden>
                                  —
                                </span>
                              </>
                            ) : (
                              <span className="text-body-small text-fg-muted">—</span>
                            )}
                          </div>
                          <a href={url} target="_blank" rel="noopener noreferrer" className="text-body-small text-brand-600 hover:underline break-all min-w-0 flex-1">
                            {url}
                          </a>
                        </div>
                        <Button
                          type="button"
                          variant="secondary"
                          className="shrink-0 self-start sm:self-center"
                          onClick={() => {
                            const next = assetUrls.filter((_, j) => j !== i);
                            setAssetUrls(next);
                            setAssetUrlsText(next.join("\n"));
                          }}
                        >
                          Remove
                        </Button>
                      </li>
                    ))}
                  </ul>
                ) : null}
                <textarea
                  className="block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 font-mono text-body-small"
                  rows={3}
                  value={assetUrlsText}
                  onChange={(e) => {
                    const text = e.target.value;
                    setAssetUrlsText(text);
                    const lines = text.split("\n").map((u) => u.trim()).filter(Boolean);
                    setAssetUrls(lines);
                  }}
                  placeholder="Paste URLs (one per line): https://example.com/hero.jpg"
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

          <CardSection title="Design tokens (advanced)">
            <p className="text-body-small text-text-secondary mb-4">
              Optional palette scale (50–900) and typography scale. Validated on save (hex colors, allowed weights 300–700). Primary/secondary above are always saved.
            </p>
            <div className="space-y-6">
              <div>
                <h4 className="text-body font-medium text-text-primary mb-2">Palette scale</h4>
                <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
                  {["50", "100", "200", "300", "400", "500", "600", "700", "800", "900"].map((key) => (
                    <div key={key} className="flex items-center gap-2">
                      <span className="text-body-small text-fg-muted w-8">{key}</span>
                      <input
                        type="color"
                        value={brandScale[key] && /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(brandScale[key]) ? brandScale[key] : "#000000"}
                        onChange={(e) => setBrandScale((s) => ({ ...s, [key]: e.target.value }))}
                        className="h-8 w-12 cursor-pointer rounded border"
                      />
                      <Input
                        placeholder="#hex"
                        value={brandScale[key] ?? ""}
                        onChange={(e) => setBrandScale((s) => ({ ...s, [key]: e.target.value }))}
                        className="font-mono text-body-small min-w-0 flex-1"
                      />
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h4 className="text-body font-medium text-text-primary mb-2">Heading scale (size / weight)</h4>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {(["h1", "h2", "h3", "h4", "h5", "h6"] as const).map((h) => (
                    <div key={h} className="flex items-center gap-2">
                      <span className="text-body-small text-fg-muted w-8">{h}</span>
                      <Input
                        placeholder="e.g. 2rem"
                        value={headingScale[h]?.size ?? ""}
                        onChange={(e) =>
                          setHeadingScale((s) => ({
                            ...s,
                            [h]: { ...(s[h] ?? { size: "1rem", weight: 700 }), size: e.target.value },
                          }))
                        }
                        className="min-w-0 flex-1"
                      />
                      <select
                        className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-body-small"
                        value={headingScale[h]?.weight ?? 700}
                        onChange={(e) =>
                          setHeadingScale((s) => ({
                            ...s,
                            [h]: { ...(s[h] ?? { size: "1rem", weight: 700 }), weight: Number(e.target.value) },
                          }))
                        }
                      >
                        {[300, 400, 500, 600, 700].map((w) => (
                          <option key={w} value={w}>{w}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className={labelCls}>Body default size</label>
                  <Input
                    placeholder="e.g. 1rem"
                    value={bodySize}
                    onChange={(e) => setBodySize(e.target.value)}
                  />
                </div>
                <div>
                  <label className={labelCls}>Caption size</label>
                  <Input
                    placeholder="e.g. 0.875rem"
                    value={captionSize}
                    onChange={(e) => setCaptionSize(e.target.value)}
                  />
                </div>
              </div>
              <div>
                <h4 className="text-body font-medium text-text-primary mb-2">Font weights</h4>
                <div className="flex flex-wrap gap-4">
                  {["normal", "medium", "semibold", "bold"].map((name) => (
                    <div key={name} className="flex items-center gap-2">
                      <span className="text-body-small text-fg-muted w-20">{name}</span>
                      <select
                        className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-body-small"
                        value={fontWeights[name] ?? 400}
                        onChange={(e) =>
                          setFontWeights((s) => ({ ...s, [name]: Number(e.target.value) }))
                        }
                      >
                        {[300, 400, 500, 600, 700].map((w) => (
                          <option key={w} value={w}>{w}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
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
