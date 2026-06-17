# Little Milestones (React + Vite)

A milestone & memory journal for tracking your kids' growth, side by side.

## Quick start

```bash
npm install
npm run dev
```

Then open the URL it prints (usually [http://localhost:5173](http://localhost:5173)).

## Project structure

```
little-milestones-react/
├── index.html          # Vite entry point (fonts + icon CDN links live here)
├── vite.config.js
├── package.json
└── src/
    ├── main.jsx         # React root mount
    ├── App.jsx           # Every screen as a component + all app state
    ├── App.css           # All visual styling
    └── constants.js      # Kids, milestone types, moods, palettes, sample entries
```

## How it's organized

`App.jsx` holds all the screens as separate components in one file, in this order:
- `KidThumb`, `KidChip`, `KidSelector` — small shared building blocks
- `HomeScreen` / `HomeFeed` / `EntryCard` / `StatCard` — the asymmetric photo-grid home feed
- `JournalScreen` / `JournalEntryRow` — the chronological diary view
- `EntryDetailScreen` — full entry view with photo gallery
- `NewEntryScreen` — the "add a moment" form, including photo/video upload
- `CelebrationOverlay` — the confetti milestone-unlocked screen
- `RecapScreen` — monthly stats + milestone list
- `CompareScreen` — side-by-side sibling comparison by age
- `SearchScreen` — keyword search across all entries
- `RecapReelScreen` — the tap-through story-style reel
- `ProfileScreen` — manage kids + avatar upload
- `NavBar` — the bottom navigation
- `App` (default export) — holds all state and decides which screen to show

All app data (kids, sample entries, milestone types, moods, color palettes) lives
in `src/constants.js` — that's the first place to look when you want to add or
change content.

## Extending it

**Add a new milestone type** → add an entry to `MILESTONE_TYPES` in `constants.js`.

**Add a new kid** → currently the "Add kid" button in Manage Kids just shows an
alert. To wire it up for real, add a form similar to `NewEntryScreen` that
collects a name and birthdate, then calls `setKids(prev => [...prev, newKid])`
in `App.jsx`.

**Persist data across refreshes** → right now all state lives in React's
`useState`, so a page refresh resets everything back to the sample data. To
fix that:
1. Simplest: save `entries` and `kids` to `localStorage` whenever they change
   (a `useEffect` that runs on every update), and read from `localStorage` on
   first load.
2. Better long-term: connect to a real backend (Firebase, Supabase, or your
   own API) so data syncs across devices and survives browser data clearing.

**Add real photo storage** → the photo/video upload currently uses
`URL.createObjectURL()`, which only works for the current browser session and
is lost on refresh. Swapping this for real cloud storage (S3, Cloudinary,
Firebase Storage) is the next step toward a production-ready app.

**Turn this into a phone app** → once the data layer is real, this component
structure ports over cleanly to React Native with a bit of rework (replacing
div/CSS with View/StyleSheet, swapping the icon font for `lucide-react-native`
or similar).

## Tech stack
- [React 18](https://react.dev/)
- [Vite](https://vitejs.dev/)
- Google Fonts — Inter + Source Serif 4
- [Tabler Icons](https://tabler.io/icons) (via CDN)
