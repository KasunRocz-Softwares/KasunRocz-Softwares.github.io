# kasunrocz-softwares.github.io

Homepage for all KasunRocz Softwares projects: https://qulaxy.com/

## Add a new project

Edit **`projects.json`** only. Copy one of the blocks, change the values, and commit:

```json
{
  "id": "MyNewApp",
  "name": "My New App",
  "tagline": "One short line.",
  "description": "Two sentences about what it does.",
  "website": "https://qulaxy.com/MyNewApp/",
  "repo": "KasunRocz-Softwares/MyNewApp",
  "download": "https://github.com/KasunRocz-Softwares/MyNewApp/releases/latest",
  "downloadLabel": "Download",
  "icon": "https://qulaxy.com/MyNewApp/icon.png",
  "image": "https://qulaxy.com/MyNewApp/og.jpg",
  "platforms": ["Windows"],
  "category": "Tools",
  "license": "MIT",
  "accent": "#8b7cf6",
  "planet": "crystal",
  "features": ["Short highlight", "Another one"],
  "listings": [
    { "site": "Product Hunt", "url": "https://www.producthunt.com/products/mynewapp", "badge": "https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=XXXX&theme=dark" },
    { "site": "AlternativeTo", "url": "https://alternativeto.net/software/mynewapp/about/" }
  ]
}
```

Every field except `name` is optional. Leave out `icon` and the panel shows the first letter instead.

Each project becomes its own 3D "world" on the homepage: a planet you fly to while scrolling, plus a glass panel with its details.

- `accent` is the planet's and panel's colour.
- `planet` picks the 3D model: `ring`, `waves`, `crystal`, `radar`, `graph` or `pages`. Give each project its own model; leave it out and the models take turns.
- `features` is a short list of highlights shown on the panel. They also appear in the spinning "Constellation" sphere, together with each project's platforms and licence.
- `promises` (optional) are short commitments such as `No accounts` or `Self-hosted`, linked to the project in the constellation. `Open source` is linked automatically when `license` is set.
- Leave out `repo` for a project whose source is private: the panel then shows no Source button, version or stars.

`listings` adds a "Listed on" row to the card. Use it for Product Hunt, AlternativeTo, or any other directory.
`badge` is the badge image the site gives you. Leave it out and a plain text button with the site's name is shown instead.

The latest release version and star count come from GitHub automatically, using `repo`.

If you forget to add a project here, any public repo in the org that has GitHub Pages turned on still
shows up under "Also from the workshop", using the repo's description.

## Add a supporter

The supporters page (https://qulaxy.com/supporters/) lists **Champion** ($25/mo) and **Company Sponsor** ($100/mo)
sponsors, as promised by those GitHub Sponsors tiers. When someone sponsors at one of those tiers, add them to
**`supporters.json`** and commit:

```json
{
  "companies": [
    { "name": "Acme Ltd", "url": "https://acme.example", "logo": "https://acme.example/logo.png", "since": "2026-12" }
  ],
  "champions": [
    { "name": "Jane Doe", "github": "janedoe", "since": "2026-12" }
  ]
}
```

Only `name` is required. `github` links to their profile and uses their GitHub avatar; `url` and `logo`
override those. `since` is `YYYY-MM` or a full date. Remove people when their sponsorship ends.
An empty list shows an invitation to sponsor instead.

## Files

| File | What it is |
|---|---|
| `index.html` | The page |
| `styles.css` | All styling |
| `js/app.js` | Reads `projects.json`, builds the project worlds, and runs the scroll, cursor and click effects |
| `js/scene.js` | The 3D universe (Three.js, loaded from jsDelivr): stars, the studio core, one planet per project, the galaxy |
| `projects.json` | The project list |
| `supporters/index.html`, `supporters.json` | The supporters page and its list of Champions and Company Sponsors |
| `favicon.svg` | Org logo (the "kr." wordmark, letters as paths) — tab icon and nav mark |
| `apple-touch-icon.png`, `logo-512.png`, `logo-1024.png` | PNG copies of the logo: home-screen icon, social preview, GitHub avatar |
| `.nojekyll` | Tells GitHub Pages to serve files as-is |

If WebGL isn't available, the page still works with a plain gradient background.

- **Quality tiers:** `js/app.js` picks `high`, `medium` or `low` from the device (screen, memory, CPU cores, Data Saver). Lower tiers draw fewer particles and pixels; resolution also drops automatically if the first seconds run slow.
- **Motion:** the nav's Motion switch turns animation down or back up and is remembered per visitor. It starts from the system's "reduce motion" setting.
- **Intro:** the full cinematic entrance plays once per browser session; later page loads play a shorter version.

## Run locally

```bash
npx serve .
```

(Opening `index.html` directly from disk won't load `projects.json`; it needs a local server.)
