# kasunrocz-softwares.github.io

Homepage for all KasunRocz Softwares projects: https://kasunrocz-softwares.github.io/

## Add a new project

Edit **`projects.json`** only. Copy one of the blocks, change the values, and commit:

```json
{
  "id": "MyNewApp",
  "name": "My New App",
  "tagline": "One short line.",
  "description": "Two sentences about what it does.",
  "website": "https://kasunrocz-softwares.github.io/MyNewApp/",
  "repo": "KasunRocz-Softwares/MyNewApp",
  "download": "https://github.com/KasunRocz-Softwares/MyNewApp/releases/latest",
  "downloadLabel": "Download",
  "icon": "https://kasunrocz-softwares.github.io/MyNewApp/icon.png",
  "image": "https://kasunrocz-softwares.github.io/MyNewApp/og.jpg",
  "platforms": ["Windows"],
  "category": "Tools",
  "license": "MIT",
  "accent": "#8b7cf6",
  "listings": [
    { "site": "Product Hunt", "url": "https://www.producthunt.com/products/mynewapp", "badge": "https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=XXXX&theme=dark" },
    { "site": "AlternativeTo", "url": "https://alternativeto.net/software/mynewapp/about/" }
  ]
}
```

Every field except `name` is optional. Leave out `image` and the card shows the first letter instead.

`listings` adds a "Listed on" row to the card. Use it for Product Hunt, AlternativeTo, or any other directory.
`badge` is the badge image the site gives you. Leave it out and a plain text button with the site's name is shown instead.

The latest release version and star count come from GitHub automatically, using `repo`.

If you forget to add a project here, any public repo in the org that has GitHub Pages turned on still
shows up under "Also from the workshop", using the repo's description.

## Files

| File | What it is |
|---|---|
| `index.html` | The page |
| `styles.css` | All styling |
| `app.js` | Reads `projects.json` and draws the cards |
| `projects.json` | The project list |
| `favicon.svg` | Org logo / tab icon |
| `.nojekyll` | Tells GitHub Pages to serve files as-is |

## Run locally

```bash
npx serve .
```

(Opening `index.html` directly from disk won't load `projects.json`; it needs a local server.)
