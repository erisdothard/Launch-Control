import type { MetadataRoute } from "next";
import { site } from "@/content/site";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: site.seo.url, lastModified: new Date(), changeFrequency: "monthly", priority: 1 },
    { url: `${site.seo.url}${site.film.share.path}`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.8 },
  ];
}
