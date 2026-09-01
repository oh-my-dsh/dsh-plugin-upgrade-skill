// This plugin was renamed. Keep the legacy registration id so older profiles
// can still find it. The host already serves this bundle under the new name.
window.__ModuleLoader__.load({
  id: '@demo/dsh-bench-browser-activation-legacy',
  factory: () => ({
    apply() {
      document.documentElement.dataset.benchBrowserActivation = 'active'
    },
  }),
})
