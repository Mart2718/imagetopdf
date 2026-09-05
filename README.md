# Canvas-Ready Image to PDF Maker

A browser-based tool that lets students combine photos of their work, annotate and reorder pages, and download one PDF ready to upload to Canvas.

## Features

- Add up to 20 JPG, PNG, WebP, HEIC, or HEIF images
- Draw, highlight, erase, add movable text, crop, and rotate
- Reorder pages and preview the finished document
- Export one letter-size PDF
- Process images locally in the browser; student work is not uploaded to a server
- Responsive layout for phones, tablets, and computers

## Run locally

No build step is required. Start any static file server from the project directory:

```bash
python3 -m http.server 8080 --directory dist
```

Then open `http://localhost:8080`.

Opening `dist/index.html` directly also works in most browsers, but a local server better matches production hosting.

## Deploy to Netlify

### From GitHub

1. Create a new GitHub repository.
2. Upload all files and folders from this project.
3. In Netlify, choose **Add new site → Import an existing project**.
4. Connect GitHub and select the repository.
5. Netlify will read `netlify.toml`; no build command is needed and the publish directory is `dist`.
6. Choose **Deploy site**.

### Manual drag-and-drop

Drag the `dist` folder into Netlify Drop. For ongoing updates, connecting the GitHub repository is easier.

## Project structure

```text
dist/
  index.html
  styles.css
  app.js
netlify.toml
README.md
```

## Browser dependencies

The site loads jsPDF and heic2any from jsDelivr. The app itself has no package-manager dependencies or server-side code. An internet connection is needed when the browser first loads those libraries.

## Privacy

Selected images and annotations remain in the browser. The app does not send student images to an application server.
