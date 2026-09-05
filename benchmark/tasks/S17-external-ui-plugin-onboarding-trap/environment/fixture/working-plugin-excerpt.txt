Redacted excerpt of a WORKING plugin's client bundle (another plugin, loaded from the same
profile), kept for comparison. The component bodies are elided — only the packaging shell
is shown:

window.__ModuleLoader__.load({
  id: "@local/dsh-brand-version",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    let react_jsx_runtime = require("react/jsx-runtime");
    let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
    /* ... component definitions elided ... */
    const inject = ["slots"];
    function apply(ctx) {
      /* ... ctx.slots.inject(...) calls elided ... */
    }
    return module.exports;
  },
});
