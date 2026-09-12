from pathlib import Path
import json,hashlib,datetime,re
root=Path(__file__).parent;job=root/'jobs/codex-luna-s11-s22-zero-skill-recovery'; rows=[]
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
for p in sorted(job.glob('*/result.json')):
 r=json.loads(p.read_text());task=Path(r['task_id']['path']).name;trial=p.parent
 contexts=[];blocks=0;tools=[];commands=[]
 for trace in (trial/'agent/sessions').rglob('*.jsonl'):
  for line in trace.read_text().splitlines():
   e=json.loads(line);pay=e.get('payload',{})
   if e.get('type')=='turn_context':contexts.append({k:pay.get(k) for k in ['model','effort','cwd']})
   if e.get('type')=='response_item':
    if pay.get('type')=='message' and pay.get('role') in ['system','developer','user']:
     blocks+=sum(c.get('text','').count('<skills_instructions>') for c in pay.get('content',[]))
    if pay.get('type') in ['function_call','custom_tool_call']:tools.append({'name':pay.get('name'),'input':pay.get('arguments',pay.get('input'))})
 events=trial/'agent/codex.txt'
 if events.exists():
  for line in events.read_text().splitlines():
   try:e=json.loads(line)
   except ValueError:continue
   item=e.get('item',{})
   if e.get('type')=='item.completed' and item.get('type')=='command_execution':commands.append({k:item.get(k) for k in ['command','exit_code','status']})
 packet=json.loads((root/'tasks'/task/'tests/packet.json').read_text());fixture=trial/'artifacts/app/fixture'
 actual={str(f.relative_to(fixture)):sha(f) for f in fixture.rglob('*') if f.is_file()}
 baseline={k:v['sha256'] for k,v in packet['fixture'].items()};removed=sorted(set(baseline)-set(actual))
 added=sorted(set(actual)-set(baseline));modified=sorted(k for k in set(actual)&set(baseline) if actual[k]!=baseline[k])
 gradepath=root/'grades'/task/'details.json';grade=json.loads(gradepath.read_text()) if gradepath.exists() else None
 execution=r.get('agent_execution') or {};seconds=None
 if execution.get('finished_at'):seconds=(datetime.datetime.fromisoformat(execution['finished_at'])-datetime.datetime.fromisoformat(execution['started_at'])).total_seconds()
 rows.append({'task':task,'trial':str(trial),'exception':r.get('exception_info'),'solver_seconds':seconds,'agent_result':r.get('agent_result'),'contexts':contexts,'skill_instruction_blocks':blocks,'tools':tools,'commands':commands,'skill_command_hits':[c for c in commands if re.search(r'SKILL\.md|[/.]skills?[/ ]',c.get('command') or '',re.I)],'fixture_changes':{'removed':removed,'added':added,'modified':modified,'allowed':not added and not modified and set(removed)<=set(packet.get('allowedDeletions',[]))},'grade':grade})
provenance=json.loads((root/'provenance.json').read_text());drift=[k for k,v in provenance['files'].items() if not (root/k).is_file() or sha(root/k)!=v]
summary={'generated_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'snapshot_changes':drift,'rows':rows}
(root/'collected.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n')
for r in rows:print(json.dumps({k:r[k] for k in ['task','exception','solver_seconds','contexts','skill_instruction_blocks','skill_command_hits','fixture_changes']},ensure_ascii=False))
