/**
 * List GA4 properties for an OAuth-authenticated user (Analytics Admin API accountSummaries).
 */

import { OAuth2Client } from "google-auth-library";
import { google } from "googleapis";

export interface Ga4PropertyOption {
  propertyId: string;
  displayName: string;
  accountDisplayName?: string;
}

/**
 * Call Analytics Admin API accountSummaries.list with the given access token.
 * Returns a flat list of GA4 properties the user can access.
 */
export async function listGa4Properties(accessToken: string): Promise<Ga4PropertyOption[]> {
  const auth = new OAuth2Client();
  auth.setCredentials({ access_token: accessToken });
  const analyticsadmin = google.analyticsadmin({ version: "v1beta", auth });
  const { data } = await analyticsadmin.accountSummaries.list({ pageSize: 200 });
  const out: Ga4PropertyOption[] = [];
  for (const account of data.accountSummaries ?? []) {
    const accountName = account.displayName ?? "";
    for (const prop of account.propertySummaries ?? []) {
      // PropertySummary uses "property" (resource name "properties/123"), not "name"
      const resource = (prop as { property?: string; name?: string }).property ?? (prop as { property?: string; name?: string }).name;
      if (resource?.startsWith("properties/")) {
        const propertyId = resource.replace("properties/", "");
        out.push({
          propertyId,
          displayName: (prop as { displayName?: string }).displayName ?? propertyId,
          accountDisplayName: accountName,
        });
      }
    }
  }
  return out;
}
