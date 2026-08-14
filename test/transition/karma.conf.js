const featureFlags = require('../../scripts/feature-flags')
process.env.CHROME_BIN = require('puppeteer').executablePath()

const define = {
  __DEV__: `true`,
  'process.env.CI': String(!!process.env.CI)
}

for (const key in featureFlags) {
  define[`process.env.${key}`] = String(featureFlags[key])
}

module.exports = function (config) {
  config.set({
    basePath: '.',
    frameworks: ['jasmine'],
    files: ['*.spec.ts'],
    preprocessors: {
      '*.spec.ts': ['esbuild']
    },
    esbuild: {
      define
    },
    browsers: ['ChromeHeadlessNoSandbox'],
    customLaunchers: {
      // Modern CI kernels restrict unprivileged user namespaces, so Chromium's
      // SUID sandbox cannot initialize ("No usable sandbox!" from zygote_host).
      ChromeHeadlessNoSandbox: {
        base: 'ChromeHeadless',
        flags: ['--no-sandbox', '--disable-setuid-sandbox']
      }
    },
    plugins: ['karma-jasmine', 'karma-esbuild', 'karma-chrome-launcher'],
    singleRun: true
  })
}
