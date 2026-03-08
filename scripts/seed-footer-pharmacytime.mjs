#!/usr/bin/env node
/**
 * Seed the Pharmacy Time landing-page footer into email_component_library.
 * Uses html_fragment (no MJML). Run after migration 20250316100000_email_component_library_html_fragment.sql.
 *
 * Usage: node scripts/seed-footer-pharmacytime.mjs [CONTROL_PLANE_URL]
 */
import "dotenv/config";

const API = (process.argv[2] ?? process.env.CONTROL_PLANE_URL ?? "http://localhost:3001").replace(
  /\/$/,
  ""
);

const FOOTER_HTML = `<footer id="colophon" class="site-footer">
	<div class="footer-container">
		<div class="footer-main">
			<div class="footer-branding">
				<h3 class="footer-site-title"><a href="{{siteUrl}}"><img src="{{logoUrl}}" alt="{{companyName}}" /></a></h3>
				<p class="footer-tagline">{{tagline}}</p>
				<form class="footer-email-signup" method="post" action="{{emailSignupAction}}">
					<label for="footer-email-input" class="screen-reader-text">Email address</label>
					<input type="email" id="footer-email-input" name="email" class="footer-email-input" placeholder="{{emailPlaceholder}}" required aria-label="Email address">
					<button type="submit" class="footer-email-submit">Submit</button>
				</form>
				<p class="footer-email-disclaimer">{{disclaimerText}} <a href="{{privacyUrl}}">Privacy Policy</a> and provide consent to receive updates from our company.</p>
			</div>
			<div class="footer-column">
				<h4 class="footer-column-title">COMPANY</h4>
				<ul class="footer-links">
					<li><a href="{{howItWorksUrl}}">How it works</a></li>
					<li><a href="{{faqUrl}}">FAQ</a></li>
					<li><a href="{{contactUrl}}">Contact Us</a></li>
				</ul>
			</div>
			<div class="footer-column">
				<h4 class="footer-column-title">LEGAL</h4>
				<ul class="footer-links">
					<li><a href="{{termsUrl}}">Terms & Conditions</a></li>
					<li><a href="{{privacyUrl}}">Privacy Policy</a></li>
					<li><a href="{{hipaaUrl}}">HIPAA Privacy Statement</a></li>
				</ul>
			</div>
		</div>
		<div class="footer-bottom">
			<div class="footer-bottom-content">
				<div class="footer-social">
					<a href="{{instagramUrl}}" class="footer-social-link" target="_blank" rel="noopener noreferrer" aria-label="Follow us on Instagram">
						<svg class="footer-social-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.98-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.98-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" fill="currentColor"/></svg>
					</a>
					<a href="{{tiktokUrl}}" class="footer-social-link" target="_blank" rel="noopener noreferrer" aria-label="Follow us on TikTok">
						<svg class="footer-social-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z" fill="currentColor"/></svg>
					</a>
					<a href="{{twitterUrl}}" class="footer-social-link" target="_blank" rel="noopener noreferrer" aria-label="Follow us on X">
						<svg class="footer-social-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" fill="currentColor"/></svg>
					</a>
					<a href="{{facebookUrl}}" class="footer-social-link" target="_blank" rel="noopener noreferrer" aria-label="Follow us on Facebook">
						<svg class="footer-social-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" fill="currentColor"/></svg>
					</a>
					<a href="{{youtubeUrl}}" class="footer-social-link" target="_blank" rel="noopener noreferrer" aria-label="Follow us on YouTube">
						<svg class="footer-social-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" fill="currentColor"/></svg>
					</a>
				</div>
				<div class="footer-badges">
					<a href="{{legitscriptUrl}}" class="footer-badge footer-badge-legitscript" target="_blank" rel="noopener noreferrer">
						<svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 12l2 2 4-4" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="12" r="10" stroke="#0066cc" stroke-width="1.5"/></svg>
						<span>LegitScript Certified</span>
					</a>
					<div class="footer-badge footer-badge-usa">
						<svg width="24" height="16" viewBox="0 0 24 16" fill="none" aria-hidden="true"><rect x="0" y="0" width="24" height="16" fill="#B22234"/><path d="M0 0h24M0 2h24M0 4h24M0 6h24M0 8h24M0 10h24M0 12h24M0 14h24M0 16h24" stroke="#fff" stroke-width="0.5"/><rect x="0" y="0" width="10" height="7" fill="#3C3B6E"/><circle cx="1.5" cy="1.5" r="0.3" fill="#fff"/><circle cx="3" cy="1.5" r="0.3" fill="#fff"/><circle cx="4.5" cy="1.5" r="0.3" fill="#fff"/><circle cx="6" cy="1.5" r="0.3" fill="#fff"/><circle cx="7.5" cy="1.5" r="0.3" fill="#fff"/><circle cx="1.5" cy="3" r="0.3" fill="#fff"/><circle cx="3" cy="3" r="0.3" fill="#fff"/><circle cx="4.5" cy="3" r="0.3" fill="#fff"/><circle cx="6" cy="3" r="0.3" fill="#fff"/><circle cx="7.5" cy="3" r="0.3" fill="#fff"/><circle cx="1.5" cy="4.5" r="0.3" fill="#fff"/><circle cx="3" cy="4.5" r="0.3" fill="#fff"/><circle cx="4.5" cy="4.5" r="0.3" fill="#fff"/><circle cx="6" cy="4.5" r="0.3" fill="#fff"/><circle cx="7.5" cy="4.5" r="0.3" fill="#fff"/><circle cx="1.5" cy="6" r="0.3" fill="#fff"/><circle cx="3" cy="6" r="0.3" fill="#fff"/><circle cx="4.5" cy="6" r="0.3" fill="#fff"/><circle cx="6" cy="6" r="0.3" fill="#fff"/><circle cx="7.5" cy="6" r="0.3" fill="#fff"/></svg>
						<div class="footer-badge-text"><span>Compounded</span><span>in the U.S.A.</span></div>
					</div>
				</div>
			</div>
			<div class="footer-copyright">
				<p>&copy; {{year}} {{companyName}}. All rights reserved.</p>
			</div>
		</div>
	</div>
</footer>`;

const FOOTER_CSS = `<style>
.site-footer { --footer-container-max: 72rem; --footer-padding: 32px; --footer-font-size: 16px; --color-primary: #0066cc; }
.site-footer { background-color: #1a1a1a; color: #fff; padding: 4rem 0 2rem; margin-top: 0; }
.footer-container { max-width: var(--footer-container-max); margin: 0 auto; padding: 0 var(--footer-padding); }
.footer-main { display: grid; grid-template-columns: 2fr 1fr 1fr 1fr; gap: 3rem; margin-bottom: 3rem; padding-bottom: 3rem; border-bottom: 1px solid rgba(255, 255, 255, 0.1); }
.footer-branding { display: flex; flex-direction: column; gap: 1rem; }
.footer-site-title { font-size: 1.5rem; font-weight: 600; margin: 0; color: #fff; }
.footer-site-title a { color: inherit; text-decoration: none; }
.footer-site-title .logo-pharmacy { color: #fff; }
.footer-site-title .logo-time { color: #2b65c5; font-weight: 300; }
.footer-site-title img { height: 1.5em; width: auto; vertical-align: middle; }
.footer-tagline { font-size: var(--footer-font-size); color: rgba(255, 255, 255, 0.9); margin: 0; }
.footer-email-signup { display: flex; gap: 0.5rem; margin-top: 0.5rem; }
.footer-email-input { flex: 1; padding: 0.75rem 1rem; border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 0.5rem; background-color: rgba(255, 255, 255, 0.1); color: #fff; font-size: var(--footer-font-size); }
.footer-email-input::placeholder { color: rgba(255, 255, 255, 0.5); }
.footer-email-input:focus { outline: none; border-color: var(--color-primary); background-color: rgba(255, 255, 255, 0.15); }
.footer-email-submit { padding: 0.75rem 1.5rem; background-color: #fff; color: #000; border: none; border-radius: 0.5rem; font-weight: 600; font-size: var(--footer-font-size); cursor: pointer; transition: background-color 0.2s ease; }
.footer-email-submit:hover { background-color: rgba(255, 255, 255, 0.9); }
.footer-email-disclaimer { font-size: 0.75rem; color: rgba(255, 255, 255, 0.6); line-height: 1.5; margin: 0.5rem 0 0; }
.footer-email-disclaimer a { color: rgba(255, 255, 255, 0.8); text-decoration: underline; }
.footer-email-disclaimer a:hover { color: #fff; }
.footer-column { display: flex; flex-direction: column; gap: 1rem; }
.footer-column-title { font-size: 0.875rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #fff; margin: 0 0 0.5rem; }
.footer-links { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.75rem; }
.footer-links li { margin: 0; }
.footer-links a { color: rgba(255, 255, 255, 0.7); text-decoration: none; font-size: var(--footer-font-size); transition: color 0.2s ease; }
.footer-links a:hover { color: #fff; }
.footer-bottom { display: flex; flex-direction: column; gap: 1.5rem; }
.footer-bottom-content { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1.5rem; }
.footer-social { display: flex; gap: 1rem; align-items: center; }
.footer-social-link { color: rgba(255, 255, 255, 0.7); transition: color 0.2s ease; display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; }
.footer-social-link:hover { color: #fff; }
.footer-social-link svg, .footer-social-icon { width: 24px; height: 24px; fill: currentColor; }
.footer-badges { display: flex; gap: 1.5rem; align-items: center; flex-wrap: wrap; }
.footer-badge { display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem 1rem; background-color: rgba(255, 255, 255, 0.05); border-radius: 0.5rem; border: 1px solid rgba(255, 255, 255, 0.1); min-height: 56px; box-sizing: border-box; }
.footer-badge-legitscript { background-color: rgba(0, 102, 204, 0.1); border-color: rgba(0, 102, 204, 0.3); }
.footer-badge-legitscript svg { width: 24px; height: 24px; flex-shrink: 0; }
.footer-badge-legitscript span { font-size: 0.875rem; font-weight: 600; color: #fff; white-space: nowrap; line-height: 1.2; }
.footer-badge-usa { background-color: rgba(255, 255, 255, 0.05); }
.footer-badge-usa svg { width: 32px; height: 20px; flex-shrink: 0; }
.footer-badge-text { display: flex; flex-direction: column; gap: 0.125rem; font-size: 0.75rem; color: rgba(255, 255, 255, 0.8); line-height: 1.2; }
.footer-badge-text span:first-child { font-weight: 600; }
.footer-copyright { text-align: center; padding-top: 1.5rem; border-top: 1px solid rgba(255, 255, 255, 0.1); }
.footer-copyright p { font-size: 0.875rem; color: rgba(255, 255, 255, 0.6); margin: 0; }
.screen-reader-text { position: absolute; left: -9999px; width: 1px; height: 1px; overflow: hidden; }
@media (max-width: 768px) {
	.footer-main { grid-template-columns: 1fr; gap: 2rem; margin-bottom: 2rem; padding-bottom: 2rem; }
	.footer-bottom-content { flex-direction: column; align-items: flex-start; gap: 1.5rem; }
	.footer-social { order: 1; }
	.footer-badges { order: 2; flex-direction: column; align-items: flex-start; width: 100%; }
	.footer-badge { width: 100%; justify-content: flex-start; }
	.footer-copyright { order: 3; text-align: left; }
}
</style>`;

const PAYLOAD = {
  component_type: "footer_pharmacytime",
  name: "Pharmacy Time Footer",
  description:
    "Pharmacy Time site footer: logo, tagline, email signup, company and legal links, social icons (Instagram, TikTok, X, Facebook, YouTube), LegitScript and USA badges, and copyright.",
  mjml_fragment: null,
  html_fragment: FOOTER_CSS + "\n" + FOOTER_HTML,
  use_context: "landing_page",
  position: 999,
  placeholder_docs: [
    "year",
    "companyName",
    "tagline",
    "siteUrl",
    "logoUrl",
    "logoPharmacyText",
    "logoTimeText",
    "emailPlaceholder",
    "emailSignupAction",
    "disclaimerText",
    "privacyUrl",
    "howItWorksUrl",
    "faqUrl",
    "contactUrl",
    "termsUrl",
    "hipaaUrl",
    "instagramUrl",
    "tiktokUrl",
    "twitterUrl",
    "facebookUrl",
    "youtubeUrl",
    "legitscriptUrl",
  ],
};

async function main() {
  const listRes = await fetch(`${API}/v1/email_component_library?limit=500`);
  if (!listRes.ok) {
    console.error("Failed to list components:", await listRes.text());
    process.exit(1);
  }
  const { items = [] } = await listRes.json();
  const existing = items.find((c) => c.component_type === "footer_pharmacytime");
  if (existing) {
    const patchRes = await fetch(`${API}/v1/email_component_library/${existing.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: PAYLOAD.name,
        description: PAYLOAD.description,
        mjml_fragment: null,
        html_fragment: PAYLOAD.html_fragment,
        use_context: PAYLOAD.use_context,
        position: PAYLOAD.position,
        placeholder_docs: PAYLOAD.placeholder_docs,
      }),
    });
    if (!patchRes.ok) {
      console.error("Failed to update footer component:", await patchRes.text());
      process.exit(1);
    }
    console.log("Updated Pharmacy Time footer component:", existing.id);
    return;
  }
  const res = await fetch(`${API}/v1/email_component_library`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(PAYLOAD),
  });
  if (!res.ok) {
    console.error("Failed to create footer component:", await res.text());
    process.exit(1);
  }
  const row = await res.json();
  console.log("Created Pharmacy Time footer component:", row.id);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
