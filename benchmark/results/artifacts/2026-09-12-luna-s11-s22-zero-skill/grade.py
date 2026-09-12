import concurrent.futures,datetime,json,pathlib,subprocess,time
root=pathlib.Path(__file__).parent
job=root/'jobs/codex-luna-s11-s22-zero-skill-recovery'
expected={pathlib.Path(t['path']).name for t in json.loads((root/'config.json').read_text())['tasks']}
seen=set(); results=[]
def emit(obj):
 print(json.dumps({'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),**obj}),flush=True)
def grade(result_path):
 trial=result_path.parent
 result=json.loads(result_path.read_text())
 task=pathlib.Path(result['task_id']['path']).name
 logs=root/'grades'/task; logs.mkdir(parents=True)
 emit({'task':task,'status':'judging','solver_exception':(result.get('exception_info') or {}).get('exception_type')})
 start=time.time()
 cmd=['node',str(root/'report-judge/codex-judge.mjs'),'--packet',str(root/'tasks'/task/'tests/packet.json'),'--app',str(trial/'artifacts/app'),'--logs',str(logs),'--model','gpt-5.6-luna','--bin','/Applications/ChatGPT.app/Contents/Resources/codex','--effort','high']
 with (logs/'driver.log').open('w') as output:
  proc=subprocess.run(cmd,stdout=output,stderr=subprocess.STDOUT,timeout=280)
 detail=json.loads((logs/'details.json').read_text())
 data={'task':task,'trial':str(trial),'grade_directory':str(logs),'exit_code':proc.returncode,'elapsed_sec':round(time.time()-start,3),'status':detail.get('status'),'score':detail.get('score'),'reason':detail.get('reason')}
 emit(data)
 return data
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
 futures=[]; deadline=time.monotonic()+3600
 while len(seen)<len(expected) and time.monotonic()<deadline:
  for path in sorted(job.glob('*/result.json')):
   try:
    result=json.loads(path.read_text())
    task=pathlib.Path(result['task_id']['path']).name
   except (json.JSONDecodeError,KeyError): continue
   if task in expected and task not in seen and result.get('finished_at'):
    seen.add(task); futures.append(pool.submit(grade,path))
  time.sleep(3)
 for future in concurrent.futures.as_completed(futures):
  try: results.append(future.result())
  except Exception as e: results.append({'status':'driver_error','reason':str(e)})
summary={'expected':sorted(expected),'seen':sorted(seen),'results':results}
(root/'grading-summary.json').write_text(json.dumps(summary,indent=2)+'\n')
emit({'status':'finished','count':len(results)})
