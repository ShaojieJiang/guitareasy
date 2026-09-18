// These files are copied from ../../../src/assets/scores by
// `npm run sync-seed-scores` (wired into predev/prebuild/predeploy) and are
// not committed — `src/seed/` is gitignored.
import canonInD from './seed/Canon in D.atex'
import gameOfThrones from './seed/Game of Thrones Theme.atex'
import spanishRomance from './seed/Spanish Romance.atex'

export type SeedScore = { id: string; name: string; tex: string }

export const seedScores: SeedScore[] = [
  { id: 'seed-canon-in-d', name: 'Canon in D.atex', tex: canonInD },
  { id: 'seed-game-of-thrones-theme', name: 'Game of Thrones Theme.atex', tex: gameOfThrones },
  { id: 'seed-spanish-romance', name: 'Spanish Romance.atex', tex: spanishRomance },
]
