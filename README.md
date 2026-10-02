# Launch Control

**Business Development & Growth Systems.** Powered by Syntra AI.

> We build the system that finds your next customer.

This repo holds the Launch Control marketing site. It is both our portfolio and our sales tool, and its contact form feeds our own Launch Control CRM.

## Structure

```
index.html                    Home: hero, formula, services, CRM, proof, pricing, contact
case-studies/hyper-racer.html Hyper Racer USA case study (the prototype)
css/styles.css                All styles (design tokens at the top in :root)
js/main.js                    Mobile nav, pricing → form preselect, lead form submission
assets/                       Logos, images, OG images (empty for now)
```

Plain HTML/CSS/JS, no build step. Deploy as-is to Netlify, Vercel, Cloudflare Pages or GitHub Pages.

## Run locally

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

## Next steps / TODO

- [ ] Fill in real Hyper Racer numbers (search for `[XX]`) and the case study `[TODO]` sections
- [ ] Logo + brand assets in `assets/`, favicon, Open Graph image
- [ ] Set `CRM_ENDPOINT` in `js/main.js` to the Launch Control CRM intake endpoint
- [ ] Link "Powered by Syntra AI" to the Syntra site
- [ ] Contact email / phone / calendar booking link
- [ ] Analytics
