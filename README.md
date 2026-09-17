# GuitarEasy

ChatGPT converts the notations, GuitarEasy plays it, you practise! Your favourite song is ready in minutes.

[![Watch the GuitarEasy demo](https://img.youtube.com/vi/mETwwCJCaDs/maxresdefault.jpg)](https://www.youtube.com/watch?v=mETwwCJCaDs)

## Features

- Render alphaTex notation in the browser with [alphaTab](https://www.alphatab.net/).
- Play and pause scores with the built-in MIDI player and animated cursor.
- Load `.atex`, `.tex`, or `.txt` files by browsing or dragging and dropping.
- Keep uploaded scores in the browser's local storage for later sessions.
- Start with bundled example scores, including *Canon in D*, *Game of Thrones Theme*, and *Spanish Romance*.
- Choose system, light, or dark colour mode and collapse the file-controls panel.
- Use the Space key to play or pause the active score.

## Requirements

- Node.js 20.19 or newer (or Node.js 22.12 or newer)
- npm

## Getting started

```bash
npm install
npm run dev
```

Then open the local URL printed by Vite. By default, the development server uses port `65432`.

## Available scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the Vite development server. |
| `npm run build` | Type-check the project and create a production build in `dist/`. |
| `npm run preview` | Preview the production build locally. |

## Using GuitarEasy

1. Choose a bundled score from the score library, or upload an alphaTex file.
2. Read the rendered notation in the preview panel.
3. Use the play button or press Space to start and pause MIDI playback.
4. Use the stop button to return playback to the beginning.

Uploaded scores and display preferences are stored only in the current browser's local storage. They are not included in the repository or uploaded by the app.

## Project structure

```text
src/
  main.ts              Application UI, score library, and alphaTab integration
  style.css            Application styles and responsive layout
  assets/scores/       Bundled alphaTex example scores
public/
  font/                Bravura music font assets used by alphaTab
  soundfont/           SoundFont used for MIDI playback
index.html             Application shell and document metadata
vite.config.ts         Vite and alphaTab plugin configuration
```

## Production build

Build the static site with:

```bash
npm run build
```

Deploy the generated `dist/` directory to any static web host. The repository includes hosting metadata for GuitarEasy's static deployment configuration.

## License

GuitarEasy is released under the [MIT License](LICENSE). Third-party assets in `public/font/` and `public/soundfont/` retain their respective licensing and attribution requirements.
