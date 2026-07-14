import { defineManifest } from '@crxjs/vite-plugin'

export default defineManifest({
  manifest_version: 3,
  name: 'CookCart AI',
  version: '0.1.0',
  description:
    'Type any dish. CookCart AI figures out every ingredient and fills your Blinkit, Zepto or Instamart cart automatically.',
  icons: {
    16: 'icons/icon-16.png',
    32: 'icons/icon-32.png',
    48: 'icons/icon-48.png',
    128: 'icons/icon-128.png',
  },
  action: {
    default_popup: 'src/popup/index.html',
    default_title: 'CookCart AI',
  },
  background: {
    service_worker: 'src/background/index.ts',
    type: 'module',
  },
  content_scripts: [
    {
      matches: [
        'https://blinkit.com/*',
        'https://www.zeptonow.com/*',
        'https://www.swiggy.com/instamart*',
        'https://www.swiggy.com/instamart/*',
      ],
      js: ['src/content/index.ts'],
      run_at: 'document_idle',
    },
  ],
  permissions: ['storage', 'tabs', 'alarms'],
  host_permissions: [
    'https://blinkit.com/*',
    'https://www.zeptonow.com/*',
    'https://www.swiggy.com/*',
    'https://generativelanguage.googleapis.com/*',
    'https://api.openai.com/*',
    'https://api.groq.com/*',
    'https://openrouter.ai/*',
  ],
})
