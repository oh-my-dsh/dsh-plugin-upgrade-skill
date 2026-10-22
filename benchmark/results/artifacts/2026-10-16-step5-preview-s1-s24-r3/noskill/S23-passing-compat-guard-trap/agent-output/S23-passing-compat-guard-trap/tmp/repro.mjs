
// Faithful JS mirror of the plugin's resolve() over both host snapshot shapes.
const mkCtx = () => { const m = new Map(); return { get:(k)=>m.get(k), set:(k,v)=>m.set(k,v) } };

function run(host){
  // alpha.1: SessionListState { byId, current }
  const alpha1 = { byId:{ s1:{}, s2:{} }, current:'s1' };
  // alpha.2: SessionListSnapshot { items, state, phase, error, subagentsByParent, jobsBySession }
  const alpha2 = { items:[{id:'s1'}], state:'idle', phase:'ready', error:null,
                   subagentsByParent:{}, jobsBySession:{} };
  const listSnap = host === 'alpha1' ? alpha1 : alpha2;

  // ui-session service (alpha.2 only)
  const s1ctx = mkCtx(); s1ctx.set('conversation', { input:{ for:(c)=>({ tag:'input-for-'+c.tag }) } });
  const uiSession = host === 'alpha1' ? undefined : {
    adapter:{ current:{ getSnapshot:()=>({ key:'s1', ctx:s1ctx, hooks:{}, keyedHooks:{}, props:{} }) } }
  };
  const sessions = {
    list:{ getSnapshot:()=>listSnap },
    scope:(id)=> id==='s1' ? s1ctx : undefined,
  };
  const ctx = { sessions, uiConversation:{ binding:()=>({ snapshot:{ getSnapshot:()=>({ views:{ chat:{ legacy:{ nodes:['n1','n2'] } } } }) } }) }, uiSession };

  const legacyResolve = () => {                       // verbatim plugin logic
    const id = sessions.list.getSnapshot().current;
    if (id === undefined) return null;
    const actx = sessions.scope(id);
    if (actx === undefined) return null;
    const conversation = actx.get('conversation');
    if (conversation === undefined) return null;
    return { id, input: conversation.input.for(actx), nodes:['n1','n2'] };
  };
  const dualResolve = () => {                         // proposed dual-host logic
    const b = ctx.uiSession && ctx.uiSession.adapter && ctx.uiSession.adapter.current
      ? ctx.uiSession.adapter.current.getSnapshot() : undefined;
    const id = b ? b.key : sessions.list.getSnapshot().current;
    if (id === undefined) return null;
    const actx = b ? b.ctx : sessions.scope(id);
    if (actx === undefined) return null;
    const conversation = actx.get('conversation');
    if (conversation === undefined) return null;
    return { id, input: conversation.input.for(actx), nodes:['n1','n2'] };
  };

  return {
    host,
    snapshotKeys: Object.keys(listSnap),
    hasCurrentKey: Object.prototype.hasOwnProperty.call(listSnap,'current'),
    legacy: legacyResolve(),
    dual: dualResolve(),
  };
}
for (const h of ['alpha1','alpha2']) console.log(JSON.stringify(run(h),null,1));
