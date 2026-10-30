// CI host: mounts <Header>, runs scene checks, finishes WITHOUT unmounting.
process.stdout.write('channel-ui: 12/12 scene checks PASS\n');
let ticks = 0;
function planner(){
  const t = setTimeout(planner, 16);   // reschedules as long as the component stays mounted
  if (++ticks === 1) process.stdout.write('planner: tick 1 at +' + Math.round(performance.now()) + 'ms, next timer armed\n');
  if (++ticks === 40000) process.stdout.write('planner: still arming after 40000 ticks\n');
}
planner();
process.stdout.write('main: finished; process should exit now\n');
