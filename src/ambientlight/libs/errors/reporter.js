// Replaces the Sentry crash reporter of the original YouTube extension.
// Errors are only logged to the console of the webpage and never sent anywhere.
export default class ErrorReporter {
  static overflowProtection = 0
  static captureException(ex) {
    try {
      // Ignore errors that cannot be fixed
      if (ex?.message?.includes?.(`can't access dead object`))
        // Firefox has destroyed the webpage but the extensions javascript not yet
        return

      this.overflowProtection++
      if (this.overflowProtection > 10)
        return

      if (ex?.details) {
        console.error(ex, ex.details)
      }
      else {
        console.error(ex)
      }

      if (this.overflowProtection === 10) {
        console.warn('Exception overflow protection enabled')
      }
    }
    catch (logEx) {
      globalThis.console.error(logEx)
    }
  }
}
