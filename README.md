# site

Apex landing page for [schnsrw.live](https://schnsrw.live). Pure static
HTML + CSS, no build step. Auto-deploys to GitHub Pages on every push
to `main` (`.github/workflows/pages.yml`).

## Layout

| File           | Purpose                                              |
|----------------|------------------------------------------------------|
| `index.html`   | Landing page (Inter font, dark-mode-aware)           |
| `style.css`    | Styles                                               |
| `favicon.svg`  | Favicon                                              |
| `CNAME`        | Tells GitHub Pages which custom domain to serve      |
| `.github/workflows/pages.yml` | Deploy workflow                       |

## Activate the deploy

1. **Settings → Pages**: source = "GitHub Actions" (not "Deploy from a
   branch").
2. **Settings → Pages → Custom domain**: `schnsrw.live`, tick "Enforce
   HTTPS" once the cert is issued.
3. **DNS** at your registrar — apex A records to GitHub's IPs:

   ```
   A    @    185.199.108.153
   A    @    185.199.109.153
   A    @    185.199.110.153
   A    @    185.199.111.153
   ```

## Local preview

```sh
python3 -m http.server 4000
# open http://localhost:4000
```

## Related

The sheet app linked from the home page lives at
[github.com/schnsrw/sheets](https://github.com/schnsrw/sheets) and
deploys to `sheet.schnsrw.live` from its own Pages site.