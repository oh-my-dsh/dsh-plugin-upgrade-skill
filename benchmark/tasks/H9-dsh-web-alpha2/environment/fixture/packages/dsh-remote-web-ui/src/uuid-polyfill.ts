/**
 * Polyfill for crypto.randomUUID for non-secure contexts (LAN HTTP)
 * where the browser does not expose crypto.randomUUID.
 *
 * The script string is injected as an inline <script> in the desktop HTML
 * head so the SDK's mintRpcId() sees a working randomUUID even on plain
 * http:// origins (#1024).
 */

export const UUID_POLYFILL_SCRIPT = [
  '(function(){',
  'var g=typeof globalThis!=="undefined"?globalThis:typeof window!=="undefined"?window:self;',
  'if(typeof g.crypto==="undefined"){g.crypto={};}',
  'if(typeof g.crypto.randomUUID!=="function"){',
  'g.crypto.randomUUID=function(){',
  'var a=new Uint8Array(16);',
  'if(g.crypto.getRandomValues){g.crypto.getRandomValues(a);}',
  'else{for(var j=0;j<16;j++){a[j]=Math.random()*256|0;}}',
  'a[6]=(a[6]&0x0f)|0x40;',
  'a[8]=(a[8]&0x3f)|0x80;',
  'var h="",x="0123456789abcdef";',
  'for(var i=0;i<16;i++){h+=x[a[i]>>4]+x[a[i]&0x0f];',
  'if(i===3||i===5||i===7||i===9)h+="-";}',
  'return h;',
  '};',
  '}',
  '})();',
].join('')
