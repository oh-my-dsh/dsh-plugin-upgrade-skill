from pathlib import Path
import datetime,hashlib,json,shutil,tarfile
root=Path(__file__).parent
initial=Path('/private/tmp/dsh-s11-s22-luna-zero-skill-20260912')
repo=Path('/Users/yejiming/Desktop/OpenSource/dsh-plugin-upgrade-skill')
data=json.loads((root/'collected.json').read_text())
first=json.loads((initial/'collected.json').read_text())
s13=next(r for r in first['rows'] if r['task'].startswith('S13-'))
s13['grade']=json.loads((root/'grades'/s13['task']/'details.json').read_text())
data['rows'].append(s13)
assert len(data['rows'])==10 and not data['snapshot_changes'] and not first['snapshot_changes']
artifact=repo/'benchmark/results/artifacts/2026-09-12-luna-s11-s22-zero-skill'
artifact.mkdir(exist_ok=False,parents=True)
config=json.loads((root/'config.json').read_text());config['jobs_dir']='<local-run>/jobs'
config['agents'][0]['env']['CODEX_AUTH_JSON_PATH']='<local-codex-auth.json>'
for t in config['tasks']:t['path']='<local-run>/tasks/'+Path(t['path']).name
(artifact/'config.json').write_text(json.dumps(config,ensure_ascii=False,indent=2)+'\n')
shutil.copy(root/'provenance.json',artifact/'provenance.json')
for name in ['harbor_codex_node24.py','grade.py','collect.py','export.py','grading-summary.json']:
 if (root/name).exists():shutil.copy(root/name,artifact/name)
summary={'generated_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'solver_model':'gpt-5.6-luna','solver_effort':'xhigh','judge_model':'gpt-5.6-luna','judge_effort':'high','codex_version':'0.153.4','harbor_version':'0.22.0','selected_attempts_per_task':1,'solver_attempts':{'S13':1,'other_requested_tasks':2},'retry_reason':'Initial batch DNS/network outage; original S13 answer retained and only judge retried','solver_concurrency':3,'judge_concurrency':2,'skill_condition':'no injected/native/bundled skills; native trajectory audited','transport':'Harbor Docker solver; independent host-side Codex judge; Docker HTTP verifier not exercised','network_condition':'original task network policy retained (public); provider web search disabled','snapshot_changes':data['snapshot_changes'],'rows':[]}
for row in sorted(data['rows'],key=lambda r:int(r['task'].split('-')[0][1:])):
 task=row['task'];short=task.split('-')[0];dest=artifact/short;dest.mkdir()
 trial=Path(row['trial']);reportdir=trial/'artifacts/app/agent-output'/task
 reports=[]
 if reportdir.exists():
  for p in sorted(reportdir.rglob('*')):
   if not p.is_file():continue
   relative=p.relative_to(reportdir)
   target=dest/'reports'/Path(str(relative)+'.txt');target.parent.mkdir(parents=True,exist_ok=True)
   shutil.copy(p,target)
   reports.append({'original_path':str(relative),'archived_path':str(target.relative_to(artifact)),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()})
 shutil.copy(root/'tasks'/task/'tests/packet.json',dest/'packet.json')
 for file in (root/'grades'/task).iterdir():
  if file.is_file():shutil.copy(file,dest/('judge.'+file.name))
 shutil.copy(trial/'result.json',dest/'solver-result.json')
 if (trial/'agent/codex.txt').exists():shutil.copy(trial/'agent/codex.txt',dest/'solver.events.jsonl')
 for i,file in enumerate((trial/'agent/sessions').rglob('*.jsonl')):shutil.copy(file,dest/f'solver.native-{i}.jsonl')
 audit={k:row[k] for k in ['contexts','skill_instruction_blocks','commands','tools','skill_command_hits','fixture_changes']}
 (dest/'audit.json').write_text(json.dumps(audit,ensure_ascii=False,indent=2)+'\n')
 summary['rows'].append({**{k:row[k] for k in ['task','exception','solver_seconds','agent_result','contexts','skill_instruction_blocks','skill_command_hits','fixture_changes','grade']},'reports':reports})
valid=[r for r in summary['rows'] if (r['grade'] or {}).get('status')=='scored' and r['reports'] and ((r['exception'] or {}).get('exception_type') in [None,'AgentTimeoutError'])]
summary['solver_outcomes']={'completed':sum(r['exception'] is None for r in summary['rows']),'timeout_with_report':sum((r['exception'] or {}).get('exception_type')=='AgentTimeoutError' and bool(r['reports']) for r in summary['rows'])}
summary['aggregate']={'scored':len(valid),'requested':10,'sum':sum(r['grade']['score'] for r in valid),'max_scored':100*len(valid),'mean':sum(r['grade']['score'] for r in valid)/len(valid) if valid else None,'perfect':sum(r['grade']['score']==100 for r in valid)}
failed=artifact/'interrupted-attempts';failed.mkdir()
for row in first['rows']:
 task=row['task']; dest=failed/task.split('-')[0];dest.mkdir()
 trial=Path(row['trial']);shutil.copy(trial/'result.json',dest/'solver-result.json')
 if (trial/'agent/codex.txt').exists():shutil.copy(trial/'agent/codex.txt',dest/'solver.events.jsonl')
 for i,path in enumerate((trial/'agent/sessions').rglob('*.jsonl')):shutil.copy(path,dest/f'solver.native-{i}.jsonl')
 for path in (initial/'grades'/task).iterdir():
  if path.is_file():shutil.copy(path,dest/('judge.'+path.name))
shutil.copy(initial/'grading-summary.json',failed/'grading-summary.json')
shutil.copy(initial/'config.json',failed/'config.local.json')
failed_config=json.loads((failed/'config.local.json').read_text());failed_config['jobs_dir']='<initial-run>/jobs';failed_config['agents'][0]['env']['CODEX_AUTH_JSON_PATH']='<local-codex-auth.json>'
for t in failed_config['tasks']:t['path']='<initial-run>/tasks/'+Path(t['path']).name
(failed/'config.local.json').write_text(json.dumps(failed_config,indent=2)+'\n')
summary['selection_note']='S13 keeps the first completed solver answer. Other tasks use unchanged network-recovery runs. S17 timeout, if present, is disclosed separately; a preserved report can receive a semantic score without being a completed solver turn.'
summary['interrupted_attempts']=[{'task':r['task'],'solver_error':(r['exception'] or {}).get('exception_type'),'judge_status':(r['grade'] or {}).get('status'),'raw_score':(r['grade'] or {}).get('score'),'excluded_from_selected_aggregate':True} for r in first['rows']]
(artifact/'summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n')
with tarfile.open(artifact/'source-snapshot.tar.gz','w:gz') as archive:
 for name in ['tasks','report-judge']:archive.add(root/name,arcname=name)
files={str(p.relative_to(artifact)):hashlib.sha256(p.read_bytes()).hexdigest() for p in artifact.rglob('*') if p.is_file()}
(artifact/'sha256.json').write_text(json.dumps(files,indent=2)+'\n')
print(json.dumps({'artifact':str(artifact),'aggregate':summary['aggregate']},indent=2))
