import * as alphaTab from '@coderline/alphatab'
import './style.css'

type ScoreRecord = {
  id: string
  name: string
  tex: string
}

const bundledScoreSources = import.meta.glob('./assets/scores/*.atex', {
  eager: true,
  import: 'default',
  query: '?raw',
}) as Record<string, string>

function getFileName(path: string) {
  return path.split('/').pop() ?? 'Untitled.atex'
}

const bundledScores: ScoreRecord[] = Object.entries(bundledScoreSources)
  .map(([path, tex]) => ({
    id: `bundled:${path}`,
    name: getFileName(path),
    tex,
  }))
  .sort((left, right) => left.name.localeCompare(right.name))
const defaultScore = bundledScores[0]!
const bundledScoreIds = new Set(bundledScores.map((score) => score.id))
const scoreLibraryStorageKey = 'guitareasy-score-library'

function normalizeScoreName(name: string) {
  return name.replace(/\.alphatex$/i, '.atex') || 'Untitled.atex'
}

function createScoreId() {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `score-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function restoreScoreLibrary() {
  try {
    const saved = JSON.parse(localStorage.getItem(scoreLibraryStorageKey) ?? '[]')
    if (!Array.isArray(saved)) return []
    return saved.filter((score): score is ScoreRecord => (
      typeof score?.id === 'string' && !bundledScoreIds.has(score.id) &&
      typeof score?.name === 'string' && typeof score?.tex === 'string' && score.tex.trim().length > 0
    )).map((score) => ({ ...score, name: normalizeScoreName(score.name) }))
  } catch {
    return []
  }
}

const scoreLibrary: ScoreRecord[] = [...bundledScores, ...restoreScoreLibrary()]

type ThemePreference = 'system' | 'light' | 'dark'

type Locale = 'en' | 'nl' | 'de' | 'fr' | 'es' | 'pt' | 'zh' | 'ja' | 'ko'

const localeOptions: Array<{ value: Locale; label: string }> = [
  { value: 'en', label: 'English' },
  { value: 'nl', label: 'Nederlands' },
  { value: 'de', label: 'Deutsch' },
  { value: 'fr', label: 'Français' },
  { value: 'es', label: 'Español' },
  { value: 'pt', label: 'Português (Brasil)' },
  { value: 'zh', label: '简体中文' },
  { value: 'ja', label: '日本語' },
  { value: 'ko', label: '한국어' },
]

const englishMessages = {
  brandName: 'GuitarEasy',
  appTitle: 'alphaTex player',
  appDescription: 'A streamlined alphaTex guitar tablature reader and MIDI player.',
  appKicker: 'ALPHATEX PLAYER',
  localWorkspace: 'local workspace',
  homeLink: 'GuitarEasy home',
  githubLink: 'View GuitarEasy on GitHub',
  language: 'Language',
  colourMode: 'Colour mode',
  system: 'System',
  light: 'Light',
  dark: 'Dark',
  useSystemColourMode: 'Use system colour mode',
  useLightColourMode: 'Use light colour mode',
  useDarkColourMode: 'Use dark colour mode',
  pageKicker: 'notation workspace / 01',
  pageTitle: 'GuitarEasy: Practising Guitar Made Easy',
  introCopy: 'Drop in an alphaTex file, see the notation, and hear every note through the built-in MIDI player.',
  space: 'SPACE',
  playPause: 'play / pause',
  keyboardShortcut: 'Keyboard shortcut',
  sourceFile: 'source file',
  bringScore: 'Add a score',
  privacyNote: 'alphaTex is parsed in your browser. Nothing leaves this workspace.',
  dropFile: 'Drop an alphaTex file here',
  or: 'or',
  browseFiles: 'choose a file',
  formats: '.atex · .tex · .txt',
  scoreLibrary: 'score library',
  scoreCount: '{count} score',
  scoreCountPlural: '{count} scores',
  local: 'LOCAL',
  notationPreview: 'notation preview',
  yourScore: 'Your score',
  controls: 'Controls',
  showControls: 'Show controls',
  collapseFileControls: 'Collapse file controls',
  readyToRender: 'ready',
  uploadToStart: 'Upload a score to start reading.',
  midiPlayerControls: 'MIDI player controls',
  alphaTexScore: 'alphaTex score',
  playScore: 'Play score',
  pauseScore: 'Pause score',
  stopPlayback: 'Stop playback',
  builtInScore: 'built-in score',
  uploadedScore: 'uploaded score',
  loadScoreNamed: 'Load {name}',
  removeScoreNamed: 'Remove {name}',
  renderingScore: 'rendering score',
  couldNotRender: 'could not render',
  playingNow: 'playing now',
  loadingSoundfont: 'loading SoundFont',
  emptyFile: 'That file is empty. Choose an alphaTex file with notation inside.',
  fileCouldNotOpen: 'The file could not be opened. Please try another file.',
  fileCouldNotRead: 'This file could not be read as alphaTex. Check the syntax and try again.',
  alphaTabCouldNotRender: 'alphaTab could not render this score.',
  footerRenderer: 'alphaTab renderer',
  footerMidi: 'browser MIDI synthesis',
} as const

type MessageKey = keyof typeof englishMessages

const translations: Record<Locale, Partial<Record<MessageKey, string>>> = {
  en: {},
  nl: {
    brandName: 'GuitarEasy', appTitle: 'alphaTex-speler', appDescription: 'Een overzichtelijke alphaTex-lezer voor gitaartabulatuur met ingebouwde MIDI-speler.',
    appKicker: 'ALPHATEX-SPELER', localWorkspace: 'lokale werkruimte', homeLink: 'Startpagina van GuitarEasy', language: 'Taal', colourMode: 'Kleurthema', system: 'Systeem', light: 'Licht', dark: 'Donker',
    useSystemColourMode: 'Systeeminstelling voor kleuren gebruiken', useLightColourMode: 'Licht kleurthema gebruiken', useDarkColourMode: 'Donker kleurthema gebruiken',
    pageKicker: 'notatiewerkplek / 01', pageTitle: 'Speel je tabulatuur.', introCopy: 'Voeg een alphaTex-bestand toe, bekijk de notatie en beluister elke noot met de ingebouwde MIDI-speler.', space: 'SPATIE', playPause: 'afspelen / pauzeren', keyboardShortcut: 'Sneltoets',
    sourceFile: 'bronbestand', bringScore: 'Partituur toevoegen', privacyNote: 'alphaTex wordt in je browser verwerkt. Er wordt niets buiten deze werkruimte verstuurd.', dropFile: 'Sleep hier een alphaTex-bestand heen', or: 'of', browseFiles: 'kies een bestand',
    scoreLibrary: 'partituurbibliotheek', scoreCount: '{count} partituur', scoreCountPlural: '{count} partituren', local: 'LOKAAL', notationPreview: 'notatievoorbeeld', yourScore: 'Je partituur', controls: 'Bediening', showControls: 'Bediening tonen', collapseFileControls: 'Bestandsbediening verbergen',
    readyToRender: 'gereed', uploadToStart: 'Upload een partituur om te beginnen.', midiPlayerControls: 'Bediening van de MIDI-speler', alphaTexScore: 'alphaTex-partituur', playScore: 'Partituur afspelen', pauseScore: 'Afspelen pauzeren', stopPlayback: 'Afspelen stoppen',
    builtInScore: 'meegeleverde partituur', uploadedScore: 'geüploade partituur', loadScoreNamed: '{name} laden', removeScoreNamed: '{name} verwijderen', renderingScore: 'partituur wordt gerenderd', couldNotRender: 'renderen mislukt', playingNow: 'wordt nu afgespeeld', loadingSoundfont: 'SoundFont wordt geladen',
    emptyFile: 'Dit bestand is leeg. Kies een alphaTex-bestand met notatie.', fileCouldNotOpen: 'Het bestand kon niet worden geopend. Probeer een ander bestand.', fileCouldNotRead: 'Dit bestand kon niet als alphaTex worden gelezen. Controleer de syntaxis en probeer het opnieuw.', alphaTabCouldNotRender: 'alphaTab kon deze partituur niet renderen.', footerRenderer: 'alphaTab-renderer', footerMidi: 'MIDI-synthese in de browser',
  },
  de: {
    brandName: 'GuitarEasy', appTitle: 'alphaTex-Player', appDescription: 'Ein übersichtlicher alphaTex-Reader für Gitarrentabulaturen mit integriertem MIDI-Player.',
    appKicker: 'ALPHATEX-PLAYER', localWorkspace: 'lokaler Arbeitsbereich', homeLink: 'GuitarEasy-Startseite', language: 'Sprache', colourMode: 'Farbschema', system: 'System', light: 'Hell', dark: 'Dunkel',
    useSystemColourMode: 'Farbschema des Systems verwenden', useLightColourMode: 'Helles Farbschema verwenden', useDarkColourMode: 'Dunkles Farbschema verwenden',
    pageKicker: 'Notenpult / 01', pageTitle: 'Spiel deine Tabulatur.', introCopy: 'Füge eine alphaTex-Datei hinzu, sieh dir die Notation an und höre jede Note mit dem integrierten MIDI-Player.', space: 'LEERTASTE', playPause: 'abspielen / pausieren', keyboardShortcut: 'Tastenkürzel',
    sourceFile: 'Quelldatei', bringScore: 'Partitur hinzufügen', privacyNote: 'alphaTex wird im Browser verarbeitet. Keine Daten verlassen diesen Arbeitsbereich.', dropFile: 'alphaTex-Datei hier ablegen', or: 'oder', browseFiles: 'Datei auswählen',
    scoreLibrary: 'Partiturbibliothek', scoreCount: '{count} Partitur', scoreCountPlural: '{count} Partituren', local: 'LOKAL', notationPreview: 'Notationsvorschau', yourScore: 'Deine Partitur', controls: 'Bedienelemente', showControls: 'Bedienelemente anzeigen', collapseFileControls: 'Dateibedienung ausblenden',
    readyToRender: 'bereit', uploadToStart: 'Lade eine Partitur hoch, um zu beginnen.', midiPlayerControls: 'Bedienelemente des MIDI-Players', alphaTexScore: 'alphaTex-Partitur', playScore: 'Partitur abspielen', pauseScore: 'Wiedergabe pausieren', stopPlayback: 'Wiedergabe stoppen',
    builtInScore: 'mitgelieferte Partitur', uploadedScore: 'hochgeladene Partitur', loadScoreNamed: '{name} laden', removeScoreNamed: '{name} entfernen', renderingScore: 'Partitur wird gerendert', couldNotRender: 'Rendern fehlgeschlagen', playingNow: 'Wiedergabe läuft', loadingSoundfont: 'SoundFont wird geladen',
    emptyFile: 'Diese Datei ist leer. Wähle eine alphaTex-Datei mit Notation.', fileCouldNotOpen: 'Die Datei konnte nicht geöffnet werden. Bitte versuche eine andere.', fileCouldNotRead: 'Diese Datei konnte nicht als alphaTex gelesen werden. Prüfe die Syntax und versuche es erneut.', alphaTabCouldNotRender: 'alphaTab konnte diese Partitur nicht rendern.', footerRenderer: 'alphaTab-Renderer', footerMidi: 'MIDI-Synthese im Browser',
  },
  fr: {
    brandName: 'GuitarEasy', appTitle: 'lecteur alphaTex', appDescription: 'Un lecteur dédié aux tablatures de guitare alphaTex, avec lecteur MIDI intégré.',
    appKicker: 'LECTEUR ALPHATEX', localWorkspace: 'espace de travail local', homeLink: 'Accueil de GuitarEasy', language: 'Langue', colourMode: 'Thème', system: 'Système', light: 'Clair', dark: 'Sombre',
    useSystemColourMode: 'Utiliser le thème du système', useLightColourMode: 'Utiliser le thème clair', useDarkColourMode: 'Utiliser le thème sombre',
    pageKicker: 'pupitre de notation / 01', pageTitle: 'Jouez votre tablature.', introCopy: 'Ajoutez un fichier alphaTex, consultez la notation et écoutez chaque note avec le lecteur MIDI intégré.', space: 'ESPACE', playPause: 'lecture / pause', keyboardShortcut: 'Raccourci clavier',
    sourceFile: 'fichier d’origine', bringScore: 'Ajouter une partition', privacyNote: 'alphaTex est interprété dans votre navigateur. Aucune donnée ne quitte cet espace de travail.', dropFile: 'Déposez un fichier alphaTex ici', or: 'ou', browseFiles: 'choisir un fichier',
    scoreLibrary: 'bibliothèque de partitions', scoreCount: '{count} partition', scoreCountPlural: '{count} partitions', local: 'LOCAL', notationPreview: 'aperçu de la notation', yourScore: 'Votre partition', controls: 'Commandes', showControls: 'Afficher les commandes', collapseFileControls: 'Masquer les commandes de fichiers',
    readyToRender: 'prêt', uploadToStart: 'Importez une partition pour commencer.', midiPlayerControls: 'Commandes du lecteur MIDI', alphaTexScore: 'partition alphaTex', playScore: 'Lire la partition', pauseScore: 'Mettre la lecture en pause', stopPlayback: 'Arrêter la lecture',
    builtInScore: 'partition fournie', uploadedScore: 'partition importée', loadScoreNamed: 'Charger {name}', removeScoreNamed: 'Supprimer {name}', renderingScore: 'rendu de la partition en cours', couldNotRender: 'rendu impossible', playingNow: 'lecture en cours', loadingSoundfont: 'chargement de la SoundFont',
    emptyFile: 'Ce fichier est vide. Choisissez un fichier alphaTex contenant une notation.', fileCouldNotOpen: 'Le fichier n’a pas pu être ouvert. Veuillez en essayer un autre.', fileCouldNotRead: 'Ce fichier n’a pas pu être interprété au format alphaTex. Vérifiez la syntaxe et réessayez.', alphaTabCouldNotRender: 'alphaTab n’a pas pu afficher cette partition.', footerRenderer: 'moteur de rendu alphaTab', footerMidi: 'synthèse MIDI dans le navigateur',
  },
  es: {
    brandName: 'GuitarEasy', appTitle: 'reproductor alphaTex', appDescription: 'Un lector sencillo de tablaturas de guitarra en alphaTex con reproductor MIDI integrado.',
    appKicker: 'REPRODUCTOR ALPHATEX', localWorkspace: 'espacio de trabajo local', homeLink: 'Inicio de GuitarEasy', language: 'Idioma', colourMode: 'Tema', system: 'Sistema', light: 'Claro', dark: 'Oscuro',
    useSystemColourMode: 'Usar el tema del sistema', useLightColourMode: 'Usar el tema claro', useDarkColourMode: 'Usar el tema oscuro',
    pageKicker: 'espacio de notación / 01', pageTitle: 'Toca tu tablatura.', introCopy: 'Añade un archivo alphaTex, consulta la notación y escucha cada nota con el reproductor MIDI integrado.', space: 'ESPACIO', playPause: 'reproducir / pausar', keyboardShortcut: 'Atajo de teclado',
    sourceFile: 'archivo de origen', bringScore: 'Añadir una partitura', privacyNote: 'alphaTex se procesa en tu navegador. Ningún dato sale de este espacio de trabajo.', dropFile: 'Suelta aquí un archivo alphaTex', or: 'o', browseFiles: 'elige un archivo',
    scoreLibrary: 'biblioteca de partituras', scoreCount: '{count} partitura', scoreCountPlural: '{count} partituras', local: 'LOCAL', notationPreview: 'vista previa de la notación', yourScore: 'Tu partitura', controls: 'Controles', showControls: 'Mostrar controles', collapseFileControls: 'Ocultar controles de archivos',
    readyToRender: 'listo', uploadToStart: 'Sube una partitura para empezar.', midiPlayerControls: 'Controles del reproductor MIDI', alphaTexScore: 'partitura alphaTex', playScore: 'Reproducir la partitura', pauseScore: 'Pausar la reproducción', stopPlayback: 'Detener la reproducción',
    builtInScore: 'partitura incluida', uploadedScore: 'partitura subida', loadScoreNamed: 'Cargar {name}', removeScoreNamed: 'Eliminar {name}', renderingScore: 'renderizando la partitura', couldNotRender: 'no se pudo renderizar', playingNow: 'en reproducción', loadingSoundfont: 'cargando el banco de sonidos',
    emptyFile: 'Ese archivo está vacío. Elige un archivo alphaTex con notación.', fileCouldNotOpen: 'No se pudo abrir el archivo. Prueba con otro.', fileCouldNotRead: 'No se pudo leer este archivo como alphaTex. Comprueba la sintaxis e inténtalo de nuevo.', alphaTabCouldNotRender: 'alphaTab no pudo renderizar esta partitura.', footerRenderer: 'renderizador alphaTab', footerMidi: 'síntesis MIDI en el navegador',
  },
  pt: {
    brandName: 'GuitarEasy', appTitle: 'reprodutor alphaTex', appDescription: 'Um leitor simples de tablaturas de guitarra em alphaTex com reprodutor MIDI integrado.',
    appKicker: 'REPRODUTOR ALPHATEX', localWorkspace: 'espaço de trabalho local', homeLink: 'Início do GuitarEasy', language: 'Idioma', colourMode: 'Tema', system: 'Sistema', light: 'Claro', dark: 'Escuro',
    useSystemColourMode: 'Usar o tema do sistema', useLightColourMode: 'Usar o tema claro', useDarkColourMode: 'Usar o tema escuro',
    pageKicker: 'espaço de notação / 01', pageTitle: 'Toque sua tablatura.', introCopy: 'Adicione um arquivo alphaTex, veja a notação e ouça cada nota com o reprodutor MIDI integrado.', space: 'ESPAÇO', playPause: 'reproduzir / pausar', keyboardShortcut: 'Atalho de teclado',
    sourceFile: 'arquivo de origem', bringScore: 'Adicionar uma partitura', privacyNote: 'O alphaTex é processado no navegador. Nenhum dado sai deste espaço de trabalho.', dropFile: 'Solte um arquivo alphaTex aqui', or: 'ou', browseFiles: 'escolha um arquivo',
    scoreLibrary: 'biblioteca de partituras', scoreCount: '{count} partitura', scoreCountPlural: '{count} partituras', local: 'LOCAL', notationPreview: 'prévia da notação', yourScore: 'Sua partitura', controls: 'Controles', showControls: 'Mostrar controles', collapseFileControls: 'Ocultar controles de arquivo',
    readyToRender: 'pronto', uploadToStart: 'Envie uma partitura para começar.', midiPlayerControls: 'Controles do reprodutor MIDI', alphaTexScore: 'partitura alphaTex', playScore: 'Reproduzir a partitura', pauseScore: 'Pausar a reprodução', stopPlayback: 'Parar a reprodução',
    builtInScore: 'partitura incluída', uploadedScore: 'partitura importada', loadScoreNamed: 'Carregar {name}', removeScoreNamed: 'Remover {name}', renderingScore: 'renderizando a partitura', couldNotRender: 'não foi possível renderizar', playingNow: 'em reprodução', loadingSoundfont: 'carregando o banco de sons',
    emptyFile: 'Esse arquivo está vazio. Escolha um arquivo alphaTex com notação.', fileCouldNotOpen: 'Não foi possível abrir o arquivo. Tente outro.', fileCouldNotRead: 'Não foi possível ler este arquivo como alphaTex. Verifique a sintaxe e tente novamente.', alphaTabCouldNotRender: 'O alphaTab não conseguiu renderizar esta partitura.', footerRenderer: 'renderizador alphaTab', footerMidi: 'síntese MIDI no navegador',
  },
  zh: {
    brandName: 'GuitarEasy', appTitle: 'alphaTex 播放器', appDescription: '一款用于阅读 alphaTex 吉他六线谱并进行 MIDI 播放的简洁工具。', appKicker: 'ALPHATEX 播放器', localWorkspace: '本地工作区', homeLink: 'GuitarEasy 首页', language: '语言', colourMode: '外观模式', system: '跟随系统', light: '浅色', dark: '深色',
    useSystemColourMode: '跟随系统外观', useLightColourMode: '使用浅色模式', useDarkColourMode: '使用深色模式', pageKicker: '乐谱工作台 / 01', pageTitle: '弹奏你的六线谱。', introCopy: '导入 alphaTex 文件即可查看乐谱，并通过内置 MIDI 播放器聆听每个音符。', space: '空格', playPause: '播放 / 暂停', keyboardShortcut: '键盘快捷键',
    sourceFile: '源文件', bringScore: '添加乐谱', privacyNote: 'alphaTex 仅在浏览器中解析，文件不会上传或离开此设备。', dropFile: '将 alphaTex 文件拖到这里', or: '或', browseFiles: '选择文件', scoreLibrary: '乐谱库', scoreCount: '{count} 份乐谱', scoreCountPlural: '{count} 份乐谱', local: '本地', notationPreview: '乐谱预览', yourScore: '你的乐谱', controls: '文件面板', showControls: '显示文件面板', collapseFileControls: '收起文件面板',
    readyToRender: '已就绪', uploadToStart: '上传乐谱即可开始阅读。', midiPlayerControls: 'MIDI 播放控件', alphaTexScore: 'alphaTex 乐谱', playScore: '播放乐谱', pauseScore: '暂停播放', stopPlayback: '停止播放', builtInScore: '内置乐谱', uploadedScore: '已上传的乐谱', loadScoreNamed: '加载 {name}', removeScoreNamed: '删除 {name}', renderingScore: '正在渲染乐谱', couldNotRender: '无法渲染', playingNow: '正在播放', loadingSoundfont: '正在加载音色库',
    emptyFile: '此文件为空。请选择包含乐谱的 alphaTex 文件。', fileCouldNotOpen: '无法打开文件，请尝试其他文件。', fileCouldNotRead: '无法将此文件读取为 alphaTex 格式，请检查语法后重试。', alphaTabCouldNotRender: 'alphaTab 无法渲染此乐谱。', footerRenderer: 'alphaTab 渲染器', footerMidi: '浏览器内 MIDI 合成',
  },
  ja: {
    brandName: 'GuitarEasy', appTitle: 'alphaTex プレーヤー', appDescription: 'alphaTex 対応のギター TAB 譜ビューアー兼 MIDI プレーヤーです。', appKicker: 'ALPHATEX プレーヤー', localWorkspace: 'ローカルワークスペース', homeLink: 'GuitarEasy ホーム', language: '言語', colourMode: '表示モード', system: 'システム設定', light: 'ライト', dark: 'ダーク',
    useSystemColourMode: 'システムの表示設定を使用', useLightColourMode: 'ライトモードを使用', useDarkColourMode: 'ダークモードを使用', pageKicker: '楽譜ワークスペース / 01', pageTitle: 'TAB 譜を演奏しよう。', introCopy: 'alphaTex ファイルを読み込むと、楽譜を表示し、内蔵 MIDI プレーヤーで各音符を再生できます。', space: 'スペース', playPause: '再生 / 一時停止', keyboardShortcut: 'キーボードショートカット',
    sourceFile: '元ファイル', bringScore: '楽譜を追加', privacyNote: 'alphaTex はブラウザ内で解析され、ファイルがこの端末の外部へ送信されることはありません。', dropFile: 'alphaTex ファイルをここにドロップ', or: 'または', browseFiles: 'ファイルを選択', scoreLibrary: '楽譜ライブラリ', scoreCount: '{count}曲', scoreCountPlural: '{count}曲', local: 'ローカル', notationPreview: '楽譜プレビュー', yourScore: '楽譜', controls: 'ファイルパネル', showControls: 'ファイルパネルを表示', collapseFileControls: 'ファイルパネルを閉じる',
    readyToRender: '準備完了', uploadToStart: '楽譜をアップロードして始めましょう。', midiPlayerControls: 'MIDI プレーヤーの操作', alphaTexScore: 'alphaTex 楽譜', playScore: '楽譜を再生', pauseScore: '一時停止', stopPlayback: '再生を停止', builtInScore: '付属の楽譜', uploadedScore: 'アップロードした楽譜', loadScoreNamed: '{name} を読み込む', removeScoreNamed: '{name} を削除', renderingScore: '楽譜をレンダリング中', couldNotRender: '楽譜を表示できません', playingNow: '再生中', loadingSoundfont: '音源を読み込み中',
    emptyFile: 'ファイルが空です。楽譜を含む alphaTex ファイルを選択してください。', fileCouldNotOpen: 'ファイルを開けませんでした。別のファイルをお試しください。', fileCouldNotRead: 'このファイルを alphaTex 形式で読み込めません。構文を確認してもう一度お試しください。', alphaTabCouldNotRender: 'alphaTab でこの楽譜を表示できませんでした。', footerRenderer: 'alphaTab レンダラー', footerMidi: 'ブラウザ内 MIDI 音源',
  },
  ko: {
    brandName: 'GuitarEasy', appTitle: 'alphaTex 플레이어', appDescription: 'alphaTex 기타 타브 악보 뷰어 겸 MIDI 플레이어입니다.', appKicker: 'ALPHATEX 플레이어', localWorkspace: '로컬 작업 공간', homeLink: 'GuitarEasy 홈', language: '언어', colourMode: '화면 모드', system: '시스템 설정', light: '라이트', dark: '다크',
    useSystemColourMode: '시스템 화면 모드 사용', useLightColourMode: '라이트 모드 사용', useDarkColourMode: '다크 모드 사용', pageKicker: '악보 작업 공간 / 01', pageTitle: '타브 악보를 연주해 보세요.', introCopy: 'alphaTex 파일을 불러와 악보를 확인하고 내장 MIDI 플레이어로 모든 음을 들어 보세요.', space: '스페이스', playPause: '재생 / 일시 정지', keyboardShortcut: '키보드 단축키',
    sourceFile: '원본 파일', bringScore: '악보 추가', privacyNote: 'alphaTex는 브라우저에서만 처리되며 파일은 이 기기 밖으로 전송되지 않습니다.', dropFile: 'alphaTex 파일을 여기에 놓으세요', or: '또는', browseFiles: '파일 선택', scoreLibrary: '악보 라이브러리', scoreCount: '{count}곡', scoreCountPlural: '{count}곡', local: '로컬', notationPreview: '악보 미리보기', yourScore: '내 악보', controls: '파일 패널', showControls: '파일 패널 표시', collapseFileControls: '파일 패널 접기',
    readyToRender: '준비됨', uploadToStart: '악보를 업로드하여 시작하세요.', midiPlayerControls: 'MIDI 플레이어 컨트롤', alphaTexScore: 'alphaTex 악보', playScore: '악보 재생', pauseScore: '재생 일시 정지', stopPlayback: '재생 중지', builtInScore: '기본 제공 악보', uploadedScore: '업로드한 악보', loadScoreNamed: '{name} 불러오기', removeScoreNamed: '{name} 삭제', renderingScore: '악보 렌더링 중', couldNotRender: '악보를 표시할 수 없음', playingNow: '재생 중', loadingSoundfont: '음원 불러오는 중',
    emptyFile: '파일이 비어 있습니다. 악보가 포함된 alphaTex 파일을 선택하세요.', fileCouldNotOpen: '파일을 열 수 없습니다. 다른 파일을 선택해 보세요.', fileCouldNotRead: '이 파일을 alphaTex 형식으로 읽을 수 없습니다. 구문을 확인한 후 다시 시도하세요.', alphaTabCouldNotRender: 'alphaTab에서 이 악보를 표시할 수 없습니다.', footerRenderer: 'alphaTab 렌더러', footerMidi: '브라우저 MIDI 음원',
  },
}

const localeLanguageTags: Record<Locale, string> = {
  en: 'en', nl: 'nl', de: 'de', fr: 'fr', es: 'es', pt: 'pt-BR', zh: 'zh-CN', ja: 'ja', ko: 'ko',
}

function isLocale(value: string | null): value is Locale {
  return localeOptions.some((option) => option.value === value)
}

function detectLocale(): Locale {
  const savedLocale = localStorage.getItem('guitareasy-locale')
  if (isLocale(savedLocale)) return savedLocale
  const browserLanguage = navigator.language.toLowerCase()
  const match = localeOptions.find((option) => browserLanguage.startsWith(option.value))
  return match?.value ?? 'en'
}

let localePreference = detectLocale()

function t(key: MessageKey) {
  return translations[localePreference][key] ?? englishMessages[key]
}

function formatMessage(key: MessageKey, values: Record<string, string | number>) {
  return Object.entries(values).reduce(
    (message, [name, value]) => message.replaceAll(`{${name}}`, () => String(value)),
    t(key) as string,
  )
}

const themeStorageKey = 'guitareasy-theme'
const sidebarStorageKey = 'guitareasy-sidebar-collapsed'
const savedTheme = localStorage.getItem(themeStorageKey)
const initialTheme: ThemePreference = savedTheme === 'light' || savedTheme === 'dark' || savedTheme === 'system'
  ? savedTheme
  : 'system'

document.documentElement.dataset.theme = initialTheme

const app = document.querySelector<HTMLDivElement>('#app')!

app.innerHTML = `
  <div class="app-shell">
    <header class="topbar">
      <a class="brand" href="/" aria-label="${t('homeLink')}">
        <img class="brand-mark" src="/favicon.svg" alt="" aria-hidden="true" />
        <span data-i18n="brandName">${t('brandName')}</span>
      </a>
      <div class="topbar-actions">
        <div class="topbar-meta">
          <a class="github-button" href="https://github.com/ShaojieJiang/guitareasy" target="_blank" rel="noreferrer" aria-label="${t('githubLink')}" title="${t('githubLink')}">
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 .7a12 12 0 0 0-3.79 23.39c.6.11.82-.26.82-.58v-2.04c-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.34-1.76-1.34-1.76-1.09-.75.08-.74.08-.74 1.2.09 1.84 1.23 1.84 1.23 1.07 1.83 2.8 1.3 3.48.99.11-.77.42-1.3.76-1.6-2.67-.3-5.47-1.34-5.47-5.95 0-1.31.47-2.38 1.23-3.22-.12-.3-.53-1.52.12-3.17 0 0 1-.32 3.3 1.23a11.5 11.5 0 0 1 6 0c2.29-1.55 3.29-1.23 3.29-1.23.65 1.65.24 2.87.12 3.17.77.84 1.23 1.91 1.23 3.22 0 4.62-2.81 5.64-5.49 5.94.43.37.81 1.1.81 2.22v3.29c0 .32.22.69.83.57A12 12 0 0 0 12 .7Z"/></svg>
          </a>
        </div>
        <label class="locale-picker">
          <span class="sr-only" data-i18n="language">${t('language')}</span>
          <select id="locale-select" aria-label="${t('language')}" title="${t('language')}">
            ${localeOptions.map((option) => `<option value="${option.value}" ${option.value === localePreference ? 'selected' : ''}>${option.label}</option>`).join('')}
          </select>
        </label>
        <div class="theme-switcher" id="theme-switcher" role="group" aria-label="${t('colourMode')}">
          <button class="theme-option" type="button" data-theme-choice="system" aria-label="${t('useSystemColourMode')}" title="${t('useSystemColourMode')}"><span class="theme-icon" aria-hidden="true">◐</span><span class="theme-label" data-i18n="system">${t('system')}</span></button>
          <button class="theme-option" type="button" data-theme-choice="light" aria-label="${t('useLightColourMode')}" title="${t('useLightColourMode')}"><span class="theme-icon" aria-hidden="true">☼</span><span class="theme-label" data-i18n="light">${t('light')}</span></button>
          <button class="theme-option" type="button" data-theme-choice="dark" aria-label="${t('useDarkColourMode')}" title="${t('useDarkColourMode')}"><span class="theme-icon" aria-hidden="true">◑</span><span class="theme-label" data-i18n="dark">${t('dark')}</span></button>
        </div>
      </div>
    </header>

    <main class="workspace">
      <section class="intro-row" aria-labelledby="page-title">
        <div>
          <h1 id="page-title" data-i18n="pageTitle">${t('pageTitle')}</h1>
          <p class="intro-copy" data-i18n="introCopy">${t('introCopy')}</p>
        </div>
        <div class="shortcut-note" aria-label="${t('keyboardShortcut')}">
          <span class="shortcut-key" data-i18n="space">${t('space')}</span>
          <span data-i18n="playPause">${t('playPause')}</span>
        </div>
      </section>

      <section class="studio-grid">
        <aside class="control-panel" id="control-panel" aria-label="${t('sourceFile')}">
          <div class="panel-heading">
            <div>
              <p class="section-kicker" data-i18n="sourceFile">${t('sourceFile')}</p>
              <h2 data-i18n="bringScore">${t('bringScore')}</h2>
            </div>
            <div class="panel-heading-side">
              <div class="tip-block">
                <span class="tip-icon">i</span>
                <p data-i18n="privacyNote">${t('privacyNote')}</p>
              </div>
              <span class="file-type">.ATEX</span>
            </div>
          </div>

          <div class="upload-card" id="drop-zone">
            <input id="file-input" type="file" accept=".atex,.tex,.txt,text/plain" />
            <div class="upload-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none"><path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M5 14.5v3A2.5 2.5 0 0 0 7.5 20h9a2.5 2.5 0 0 0 2.5-2.5v-3" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </div>
            <div class="upload-copy">
              <p class="upload-title" data-i18n="dropFile">${t('dropFile')}</p>
              <p class="upload-hint"><span data-i18n="or">${t('or')}</span> <label for="file-input" data-i18n="browseFiles">${t('browseFiles')}</label></p>
            </div>
            <p class="upload-formats" data-i18n="formats">${t('formats')}</p>
          </div>

          <div class="score-library" aria-label="${t('scoreLibrary')}">
            <div class="library-heading">
              <div>
                <p class="section-kicker" data-i18n="scoreLibrary">${t('scoreLibrary')}</p>
                <strong id="score-count"></strong>
              </div>
              <span class="library-type" data-i18n="local">${t('local')}</span>
            </div>
            <div class="score-list" id="score-list"></div>
          </div>

        </aside>

        <section class="score-panel" aria-labelledby="score-heading">
          <div class="score-toolbar">
            <div>
              <p class="section-kicker" data-i18n="notationPreview">${t('notationPreview')}</p>
              <h2 id="score-heading" class="sr-only" data-i18n="yourScore">${t('yourScore')}</h2>
              <button class="sidebar-toggle" id="sidebar-toggle" type="button" aria-controls="control-panel" aria-expanded="true">
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 7h14M5 12h14M5 17h14" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>
                <span data-i18n="controls">${t('controls')}</span>
              </button>
            </div>
            <div class="score-toolbar-actions">
              <div class="render-state" id="render-state"><span class="state-dot"></span><span id="render-state-label" data-i18n="readyToRender">${t('readyToRender')}</span></div>
            </div>
          </div>
          <div class="notation-viewport" id="notation-viewport">
            <div class="notation-canvas" id="notation-canvas"></div>
            <div class="notation-empty" id="notation-empty" hidden>
              <div class="empty-staff" aria-hidden="true">𝄞</div>
              <p data-i18n="uploadToStart">${t('uploadToStart')}</p>
            </div>
          </div>
          <div class="score-error" id="score-error" role="alert" hidden></div>
          <div class="player-bar" aria-label="${t('midiPlayerControls')}">
            <button class="play-button" id="play-pause" type="button" disabled aria-label="${t('playScore')}">
              <svg class="play-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m9 6 9 6-9 6V6Z" fill="currentColor"/></svg>
              <svg class="pause-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M8 6v12M16 6v12" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>
            </button>
            <button class="stop-button" id="stop" type="button" disabled aria-label="${t('stopPlayback')}" title="${t('stopPlayback')}">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="1.2" fill="currentColor"/></svg>
            </button>
            <div class="player-readout">
              <div class="player-title-row"><strong id="song-title">Canon in D</strong><span id="song-artist">· ${t('alphaTexScore')}</span></div>
              <div class="progress-track"><span id="progress-fill"></span></div>
            </div>
            <span class="player-time" id="song-position">00:00 / 00:00</span>
          </div>
        </section>
      </section>

      <footer class="footer-note"><span id="footer-brand">© ${t('brandName')}.app</span></footer>
    </main>
  </div>
`

const notationViewport = document.querySelector<HTMLDivElement>('#notation-viewport')!
const notationCanvas = document.querySelector<HTMLDivElement>('#notation-canvas')!
const notationEmpty = document.querySelector<HTMLDivElement>('#notation-empty')!
const fileInput = document.querySelector<HTMLInputElement>('#file-input')!
const dropZone = document.querySelector<HTMLDivElement>('#drop-zone')!
const scoreList = document.querySelector<HTMLDivElement>('#score-list')!
const scoreCount = document.querySelector<HTMLElement>('#score-count')!
const playPause = document.querySelector<HTMLButtonElement>('#play-pause')!
const stop = document.querySelector<HTMLButtonElement>('#stop')!
const renderState = document.querySelector<HTMLDivElement>('#render-state')!
const renderStateLabel = document.querySelector<HTMLSpanElement>('#render-state-label')!
const scoreError = document.querySelector<HTMLDivElement>('#score-error')!
const songTitle = document.querySelector<HTMLElement>('#song-title')!
const songArtist = document.querySelector<HTMLElement>('#song-artist')!
const songPosition = document.querySelector<HTMLElement>('#song-position')!
const progressFill = document.querySelector<HTMLSpanElement>('#progress-fill')!
const themeSwitcher = document.querySelector<HTMLDivElement>('#theme-switcher')!
const themeOptions = Array.from(themeSwitcher.querySelectorAll<HTMLButtonElement>('[data-theme-choice]'))
const localeSelect = document.querySelector<HTMLSelectElement>('#locale-select')!
const sidebarToggle = document.querySelector<HTMLButtonElement>('#sidebar-toggle')!
const studioGrid = document.querySelector<HTMLElement>('.studio-grid')!
const footerBrand = document.querySelector<HTMLElement>('#footer-brand')!

let api: alphaTab.AlphaTabApi
let loadedName = defaultScore.name
let activeScoreId = defaultScore.id
let isPlayerReady = false
let audioResumePending = false
let audioRecoveryInProgress = false
let themePreference = initialTheme

function applyLocale(locale: Locale) {
  localePreference = locale
  document.documentElement.lang = localeLanguageTags[locale]
  document.documentElement.dataset.locale = locale
  localeSelect.value = locale

  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((element) => {
    const key = element.dataset.i18n as MessageKey
    if (key in englishMessages) element.textContent = t(key)
  })

  document.querySelector('.brand')?.setAttribute('aria-label', t('homeLink'))
  const githubButton = document.querySelector<HTMLElement>('.github-button')
  githubButton?.setAttribute('aria-label', t('githubLink'))
  githubButton?.setAttribute('title', t('githubLink'))
  document.querySelector<HTMLElement>('.shortcut-note')?.setAttribute('aria-label', t('keyboardShortcut'))
  document.querySelector<HTMLElement>('.control-panel')?.setAttribute('aria-label', t('sourceFile'))
  document.querySelector<HTMLElement>('.score-library')?.setAttribute('aria-label', t('scoreLibrary'))
  document.querySelector<HTMLElement>('.player-bar')?.setAttribute('aria-label', t('midiPlayerControls'))
  themeSwitcher.setAttribute('aria-label', t('colourMode'))
  localeSelect.setAttribute('aria-label', t('language'))
  localeSelect.title = t('language')
  const themeLabels: Record<ThemePreference, string> = {
    system: t('useSystemColourMode'),
    light: t('useLightColourMode'),
    dark: t('useDarkColourMode'),
  }
  themeOptions.forEach((option) => {
    const themeChoice = option.dataset.themeChoice as ThemePreference
    option.setAttribute('aria-label', themeLabels[themeChoice])
    option.title = themeLabels[themeChoice]
  })
  stop.setAttribute('aria-label', t('stopPlayback'))
  stop.title = t('stopPlayback')
  footerBrand.textContent = `© ${t('brandName')}.app`
  document.title = `${t('brandName')} — ${t('appTitle')}`
  document.querySelector<HTMLMetaElement>('meta[name="description"]')?.setAttribute('content', t('appDescription'))
  if (api?.score) {
    songArtist.textContent = api.score.artist ? `· ${api.score.artist}` : `· ${t('alphaTexScore')}`
  }
  const renderMessageKey = renderState.dataset.messageKey as MessageKey | undefined
  if (renderMessageKey && renderMessageKey in englishMessages) {
    renderStateLabel.textContent = `${t(renderMessageKey)}${renderState.dataset.messageSuffix ?? ''}`
  }
  const errorMessageKey = scoreError.dataset.messageKey as MessageKey | undefined
  if (errorMessageKey && errorMessageKey in englishMessages) scoreError.textContent = t(errorMessageKey)

  updatePlayButton(playPause.classList.contains('is-playing'))
  applySidebarState(studioGrid.classList.contains('is-sidebar-collapsed'))
  renderScoreLibrary()
  localStorage.setItem('guitareasy-locale', locale)
}

function getResolvedTheme() {
  if (themePreference !== 'system') return themePreference
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

function getNotationPalette(theme: 'light' | 'dark') {
  return theme === 'dark'
    ? {
        staffLineColor: '#707785',
        barSeparatorColor: '#d9dde3',
        barNumberColor: '#b7adff',
        mainGlyphColor: '#eef1f0',
        secondaryGlyphColor: 'rgba(238, 241, 240, 0.48)',
        scoreInfoColor: '#eef1f0',
      }
    : {
        staffLineColor: '#a5a5a5',
        barSeparatorColor: '#222211',
        barNumberColor: '#c80000',
        mainGlyphColor: '#1d2029',
        secondaryGlyphColor: 'rgba(29, 32, 41, 0.42)',
        scoreInfoColor: '#1d2029',
      }
}

function applyNotationTheme() {
  if (!api) return
  const palette = getNotationPalette(getResolvedTheme())
  const resources = api.settings.display.resources
  resources.staffLineColor = alphaTab.model.Color.fromJson(palette.staffLineColor)!
  resources.barSeparatorColor = alphaTab.model.Color.fromJson(palette.barSeparatorColor)!
  resources.barNumberColor = alphaTab.model.Color.fromJson(palette.barNumberColor)!
  resources.mainGlyphColor = alphaTab.model.Color.fromJson(palette.mainGlyphColor)!
  resources.secondaryGlyphColor = alphaTab.model.Color.fromJson(palette.secondaryGlyphColor)!
  resources.scoreInfoColor = alphaTab.model.Color.fromJson(palette.scoreInfoColor)!
  api.updateSettings()
  if (api.score) api.render({ reuseViewport: true })
}

function updateThemeColor() {
  const themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
  if (themeColor) themeColor.content = getResolvedTheme() === 'light' ? '#f2f3f1' : '#11131a'
}

function applyTheme(theme: ThemePreference) {
  themePreference = theme
  document.documentElement.dataset.theme = theme
  themeOptions.forEach((option) => {
    const isSelected = option.dataset.themeChoice === theme
    option.classList.toggle('is-selected', isSelected)
    option.setAttribute('aria-pressed', String(isSelected))
  })
  localStorage.setItem(themeStorageKey, theme)
  updateThemeColor()
  applyNotationTheme()
}

function applySidebarState(collapsed: boolean) {
  studioGrid.classList.toggle('is-sidebar-collapsed', collapsed)
  sidebarToggle.setAttribute('aria-expanded', String(!collapsed))
  sidebarToggle.title = collapsed ? t('showControls') : t('collapseFileControls')
  sidebarToggle.querySelector('span')!.textContent = collapsed ? t('showControls') : t('controls')
}

function persistScoreLibrary() {
  try {
    localStorage.setItem(scoreLibraryStorageKey, JSON.stringify(scoreLibrary.filter((score) => !bundledScoreIds.has(score.id))))
  } catch {
    // A full or restricted browser store should not prevent score playback.
  }
}

function renderScoreLibrary() {
  scoreList.replaceChildren()
  const countKey = scoreLibrary.length === 1 ? 'scoreCount' : 'scoreCountPlural'
  scoreCount.textContent = formatMessage(countKey, { count: scoreLibrary.length })

  scoreLibrary.forEach((score) => {
    const row = document.createElement('div')
    row.className = 'score-list-row'

    const selectButton = document.createElement('button')
    selectButton.type = 'button'
    selectButton.className = 'score-item'
    selectButton.classList.toggle('is-selected', score.id === activeScoreId)
    selectButton.setAttribute('aria-pressed', String(score.id === activeScoreId))
    selectButton.title = formatMessage('loadScoreNamed', { name: score.name })

    const badge = document.createElement('span')
    badge.className = 'score-item-badge'
    badge.textContent = 'ATEX'

    const copy = document.createElement('span')
    copy.className = 'score-item-copy'
    const title = document.createElement('strong')
    title.textContent = score.name
    const meta = document.createElement('small')
    meta.textContent = bundledScoreIds.has(score.id) ? t('builtInScore') : t('uploadedScore')
    copy.append(title, meta)

    const marker = document.createElement('span')
    marker.className = 'score-item-marker'
    marker.setAttribute('aria-hidden', 'true')
    marker.textContent = score.id === activeScoreId ? '✓' : ''

    selectButton.append(badge, copy, marker)
    selectButton.addEventListener('click', () => loadScore(score.id))
    row.append(selectButton)

    if (!bundledScoreIds.has(score.id)) {
      const removeButton = document.createElement('button')
      removeButton.type = 'button'
      removeButton.className = 'score-remove'
      const removeLabel = formatMessage('removeScoreNamed', { name: score.name })
      removeButton.setAttribute('aria-label', removeLabel)
      removeButton.title = removeLabel
      removeButton.textContent = '×'
      removeButton.addEventListener('click', () => removeScore(score.id))
      row.append(removeButton)
    }

    scoreList.append(row)
  })
}

function addScore(name: string, tex: string) {
  const score = { id: createScoreId(), name: normalizeScoreName(name), tex }
  scoreLibrary.splice(bundledScores.length, 0, score)
  persistScoreLibrary()
  renderScoreLibrary()
  return score
}

function removeScore(scoreId: string) {
  const index = scoreLibrary.findIndex((score) => score.id === scoreId)
  if (index < 0 || bundledScoreIds.has(scoreLibrary[index].id)) return
  scoreLibrary.splice(index, 1)
  persistScoreLibrary()
  if (activeScoreId === scoreId) loadScore(defaultScore.id)
  else renderScoreLibrary()
}

function loadScore(scoreId: string) {
  const score = scoreLibrary.find((item) => item.id === scoreId)
  if (score) loadTex(score.tex, score.name, score.id)
}

applyLocale(localePreference)
applyTheme(initialTheme)
applySidebarState(localStorage.getItem(sidebarStorageKey) === 'true')
renderScoreLibrary()

themeSwitcher.addEventListener('click', (event) => {
  const target = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-theme-choice]')
  const nextTheme = target?.dataset.themeChoice
  if (nextTheme === 'system' || nextTheme === 'light' || nextTheme === 'dark') applyTheme(nextTheme)
})

localeSelect.addEventListener('change', () => {
  const nextLocale = localeSelect.value
  if (isLocale(nextLocale)) applyLocale(nextLocale)
})

sidebarToggle.addEventListener('click', () => {
  const collapsed = !studioGrid.classList.contains('is-sidebar-collapsed')
  applySidebarState(collapsed)
  localStorage.setItem(sidebarStorageKey, String(collapsed))
})

const colorSchemeQuery = window.matchMedia('(prefers-color-scheme: light)')
colorSchemeQuery.addEventListener('change', () => {
  if (themePreference === 'system') {
    updateThemeColor()
    applyNotationTheme()
  }
})

function formatDuration(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function setRenderState(key: MessageKey, state: 'ready' | 'loading' | 'playing' | 'error' = 'ready', suffix = '') {
  renderState.dataset.state = state
  renderState.dataset.messageKey = key
  renderState.dataset.messageSuffix = suffix
  renderStateLabel.textContent = `${t(key)}${suffix}`
}

function showError(message: string, messageKey?: MessageKey) {
  scoreError.hidden = false
  scoreError.textContent = message
  if (messageKey) scoreError.dataset.messageKey = messageKey
  else delete scoreError.dataset.messageKey
  setRenderState('couldNotRender', 'error')
}

function hideError() {
  scoreError.hidden = true
  scoreError.textContent = ''
  delete scoreError.dataset.messageKey
}

function updatePlayButton(isPlaying: boolean) {
  playPause.classList.toggle('is-playing', isPlaying)
  playPause.setAttribute('aria-label', isPlaying ? t('pauseScore') : t('playScore'))
  playPause.title = isPlaying ? t('pauseScore') : t('playScore')
}

function resumeCurrentAudio() {
  if (!isPlayerReady) return

  // Calling play() alone is not enough when the browser kept alphaTab's
  // logical state as Playing but discarded the old worklet/source graph.
  api.pause()
  api.play()
}

function rebuildAudioPlayerAfterBackgrounding() {
  if (!isPlayerReady || !audioResumePending || audioRecoveryInProgress) return

  const resumePosition = api.timePosition
  const playerMode = api.settings.player.playerMode
  const enablePlayer = api.settings.player.enablePlayer
  audioRecoveryInProgress = true
  audioResumePending = false
  isPlayerReady = false
  playPause.disabled = true
  stop.disabled = true

  // Recreating the synthesizer gives mobile browsers a fresh AudioContext,
  // AudioWorkletNode, and buffer after a lock-screen interruption. The score
  // and SoundFont are reloaded by alphaTab's normal player-ready lifecycle.
  api.pause()
  api.settings.player.enablePlayer = false
  api.settings.player.playerMode = alphaTab.PlayerMode.Disabled
  api.updateSettings()
  api.settings.player.enablePlayer = enablePlayer
  api.settings.player.playerMode = playerMode
  api.updateSettings()

  let unsubscribe = () => {}
  const recoveryTimeout = window.setTimeout(() => {
    unsubscribe()
    audioRecoveryInProgress = false
    audioResumePending = true
    isPlayerReady = api.isReadyForPlayback
    playPause.disabled = !isPlayerReady
    stop.disabled = !isPlayerReady
  }, 10000)
  unsubscribe = api.playerReady.on(() => {
    window.clearTimeout(recoveryTimeout)
    unsubscribe()
    audioRecoveryInProgress = false
    isPlayerReady = true
    playPause.disabled = false
    stop.disabled = false
    api.timePosition = Math.min(resumePosition, api.endTime)
    audioResumePending = true
    resumeCurrentAudio()
  })
}

function recoverAudioAfterBackgrounding() {
  if (!isPlayerReady || !audioResumePending || audioRecoveryInProgress) return

  // A user gesture is allowed to resume an existing context even when the
  // automatic post-visibility attempt was rejected by mobile autoplay rules.
  resumeCurrentAudio()
  audioResumePending = false
}

function rememberAudioBeforeBackgrounding() {
  if (isPlayerReady && api.playerState === alphaTab.synth.PlayerState.Playing) {
    audioResumePending = true
  }
}

function handleAudioLifecycleChange() {
  if (document.visibilityState === 'hidden') {
    rememberAudioBeforeBackgrounding()
  } else {
    rebuildAudioPlayerAfterBackgrounding()
  }
}

function handleAudioResumeGesture(event: Event) {
  if (!audioResumePending || document.visibilityState === 'hidden') return

  // Let the play button handler perform the recovery so this gesture does not
  // recover the player and then immediately toggle it back to paused.
  if (event.target instanceof Node && playPause.contains(event.target)) return

  recoverAudioAfterBackgrounding()
}

function loadTex(tex: string, name = loadedName, scoreId = activeScoreId) {
  hideError()
  setRenderState('renderingScore', 'loading')
  isPlayerReady = false
  audioResumePending = false
  activeScoreId = scoreId
  playPause.disabled = true
  stop.disabled = true
  progressFill.style.width = '0%'
  songPosition.textContent = '00:00 / 00:00'
  notationEmpty.hidden = true
  notationCanvas.hidden = false
  loadedName = name
  renderScoreLibrary()

  try {
    api.tex(tex)
  } catch {
    showError(t('fileCouldNotRead'), 'fileCouldNotRead')
    notationCanvas.hidden = true
    notationEmpty.hidden = false
  }
}

function handleFile(file: File) {
  if (!file) return
  const reader = new FileReader()
  reader.addEventListener('load', () => {
    const tex = typeof reader.result === 'string' ? reader.result.trim() : ''
    if (!tex) {
      showError(t('emptyFile'), 'emptyFile')
      return
    }
    const score = addScore(file.name, tex)
    loadTex(score.tex, score.name, score.id)
  })
  reader.addEventListener('error', () => showError(t('fileCouldNotOpen'), 'fileCouldNotOpen'))
  reader.readAsText(file)
}

api = new alphaTab.AlphaTabApi(notationCanvas, {
  core: {
    tex: true,
    fontDirectory: '/font/',
  },
  display: {
    layoutMode: alphaTab.LayoutMode.Page,
    scale: 0.9,
    staveProfile: alphaTab.StaveProfile.Tab,
    resources: getNotationPalette(getResolvedTheme()),
  },
  player: {
    enablePlayer: true,
    enableCursor: true,
    enableAnimatedBeatCursor: true,
    enableElementHighlighting: true,
    soundFont: '/soundfont/sonivox.sf2',
    scrollElement: notationViewport,
    scrollMode: alphaTab.ScrollMode.OffScreen,
    scrollOffsetY: -24,
    scrollSpeed: 420,
  },
})

api.renderStarted.on(() => setRenderState('renderingScore', 'loading'))
api.renderFinished.on(() => setRenderState('readyToRender'))
api.scoreLoaded.on((score) => {
  songTitle.textContent = score.title || loadedName.replace(/\.[^/.]+$/, '')
  songArtist.textContent = score.artist ? `· ${score.artist}` : `· ${t('alphaTexScore')}`
  setRenderState('readyToRender')
  notationEmpty.hidden = true
  notationCanvas.hidden = false
})
api.error.on((error) => {
  if (error.message) showError(error.message)
  else showError(t('alphaTabCouldNotRender'), 'alphaTabCouldNotRender')
  notationCanvas.hidden = true
  notationEmpty.hidden = false
})
api.soundFontLoad.on((event) => {
  const percentage = event.total > 0 ? Math.floor((event.loaded / event.total) * 100) : 0
  setRenderState('loadingSoundfont', 'loading', ` ${percentage}%`)
})
api.playerReady.on(() => {
  isPlayerReady = true
  playPause.disabled = false
  stop.disabled = false
  setRenderState('readyToRender')
})
api.playerStateChanged.on((event) => {
  const isPlaying = event.state === alphaTab.synth.PlayerState.Playing
  updatePlayButton(isPlaying)
  if (isPlaying) {
    setRenderState('playingNow', 'playing')
  } else if (isPlayerReady) {
    setRenderState('readyToRender')
  }
})
api.playerFinished.on(() => {
  audioResumePending = false
})
api.playerPositionChanged.on((event) => {
  songPosition.textContent = `${formatDuration(event.currentTime)} / ${formatDuration(event.endTime)}`
  const percentage = event.endTime > 0 ? (event.currentTime / event.endTime) * 100 : 0
  progressFill.style.width = `${Math.min(100, Math.max(0, percentage))}%`
})

playPause.addEventListener('click', () => {
  if (!isPlayerReady) return

  if (audioResumePending && api.playerState === alphaTab.synth.PlayerState.Playing) {
    recoverAudioAfterBackgrounding()
    audioResumePending = false
    return
  }

  api.playPause()
})
stop.addEventListener('click', () => {
  if (isPlayerReady) {
    audioResumePending = false
    api.stop()
    progressFill.style.width = '0%'
    songPosition.textContent = '00:00 / 00:00'
  }
})

fileInput.addEventListener('change', () => {
  const [file] = Array.from(fileInput.files ?? [])
  if (file) handleFile(file)
  fileInput.value = ''
})
dropZone.addEventListener('dragover', (event) => {
  event.preventDefault()
  dropZone.classList.add('is-dragging')
})
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('is-dragging'))
dropZone.addEventListener('drop', (event) => {
  event.preventDefault()
  dropZone.classList.remove('is-dragging')
  const [file] = Array.from(event.dataTransfer?.files ?? [])
  if (file) handleFile(file)
})
document.addEventListener('keydown', (event) => {
  if (event.code === 'Space') {
    event.preventDefault()
    if (!isPlayerReady) return
    if (audioResumePending && api.playerState === alphaTab.synth.PlayerState.Playing) {
      recoverAudioAfterBackgrounding()
      audioResumePending = false
    } else {
      api.playPause()
    }
  }
})
document.addEventListener('visibilitychange', handleAudioLifecycleChange)
window.addEventListener('pagehide', rememberAudioBeforeBackgrounding)
window.addEventListener('pageshow', rebuildAudioPlayerAfterBackgrounding)
document.addEventListener('pointerdown', handleAudioResumeGesture, true)

type WebModelContext = {
  registerTool: (tool: unknown, options?: { signal?: AbortSignal }) => void | Promise<void>
}

const modelContext = typeof document !== 'undefined'
  ? (document as Document & { modelContext?: WebModelContext }).modelContext
  : undefined
if (modelContext?.registerTool) {
  const webMcpLifecycle = new AbortController()
  const registerWebMcpTools = async () => {
    await modelContext.registerTool({
      name: 'load_default_score',
      title: 'Load default score',
      description: 'Load the visible bundled default alphaTex score into the notation preview.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute() {
        loadScore(defaultScore.id)
        return { title: defaultScore.name, filename: defaultScore.name, status: 'loaded' }
      },
    }, { signal: webMcpLifecycle.signal })

    await modelContext.registerTool({
      name: 'toggle_midi_playback',
      title: 'Play or pause MIDI',
      description: 'Toggle the visible alphaTab MIDI player between playing and paused states.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute() {
        if (!isPlayerReady) return { status: 'not-ready' }
        api.playPause()
        return { status: api.playerState === alphaTab.synth.PlayerState.Playing ? 'playing' : 'paused' }
      },
    }, { signal: webMcpLifecycle.signal })

    await modelContext.registerTool({
      name: 'read_player_status',
      title: 'Read player status',
      description: 'Read the current score title, loaded file, readiness, playback state, and position.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute() {
        return {
          title: songTitle.textContent,
          filename: loadedName,
          ready: isPlayerReady,
          state: api.playerState === alphaTab.synth.PlayerState.Playing ? 'playing' : 'paused',
          position: songPosition.textContent,
        }
      },
    }, { signal: webMcpLifecycle.signal })
  }
  void registerWebMcpTools().catch(() => webMcpLifecycle.abort())
}

loadScore(defaultScore.id)
