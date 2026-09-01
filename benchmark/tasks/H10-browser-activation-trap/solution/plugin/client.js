window.__ModuleLoader__.load({
  id: '@demo/dsh-bench-browser-activation',
  factory: () => ({
    apply() {
      document.documentElement.dataset.benchBrowserActivation = 'active'
    },
  }),
})
