// Excerpt of @org/dsh-attach-input v0.2.10 lib/client.js (as shipped).
// The plugin renders into two composer slots: the attach button (input.left) and the
// pending-attachment dock above the input (InputZone occurrences).

function AttachButton(props) {
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);          // <-- busy lives HERE
  const [message, setMessage] = React.useState('');
  const locked = (props.input?.phase ?? 'plain') !== 'plain';
  const accept = React.useCallback(async (itemsOrPromise) => {
    setBusy(true);
    try { await props.add(await itemsOrPromise); setOpen(false); }
    catch (cause) { setMessage(String(cause)); }
    finally { setBusy(false); }
  }, [props.add]);
  return h('div', { className: 'wrap' },
    h('button', { type: 'button', disabled: locked || busy, onClick: () => setOpen(v => !v) }, '+'),
    open && h('div', { className: 'menu', role: 'menu' }, /* … */ null));
}

function AttachmentChips(props, className) {
  const occurrences = (props.input?.occurrences ?? []).filter(item => item.source === SOURCE);
  if (occurrences.length === 0) return null;
  return h('div', { className }, ...occurrences.map(occurrence => {
    const record = records.get(occurrence.ref);
    const status = record?.status ?? 'missing';
    return h('div', { className: 'chip', 'data-status': status, key: occurrence.occurrenceId },
      h('span', { className: 'name' }, record?.label ?? occurrence.label),
      h('button', {
        type: 'button',
        className: 'remove',
        'aria-label': 'Remove ' + (record?.label ?? occurrence.label),
        // v0.2.10 hardening pass added the phase guard — and this busy reference:
        disabled: (props.input?.phase ?? 'plain') !== 'plain' || busy,   // <-- ???
        onClick: () => props.remove(occurrence),
      }, 'x'));
  }));
}

function AttachmentDock(props) {
  useRevision();
  return AttachmentChips(props, 'dock');
}
