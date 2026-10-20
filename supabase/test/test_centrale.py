# Test della Centrale di soccorso (soccorritori e prove certificate)
import subprocess, json, uuid
def q(user, sql, expect_err=None):
    pre = "set role authenticated; set request.jwt.claim.sub='%s';" % user if user else ""
    r = subprocess.run(['psql','-h','/var/tmp/vpg','-p','5499','-U','postgres','-d','t','-tAq','-v','ON_ERROR_STOP=1','-c', pre + sql], capture_output=True, text=True)
    out = r.stdout.strip(); err = r.stderr.strip()
    if expect_err:
        assert expect_err in err, f'expected error "{expect_err}" got: out={out} err={err}'
        print('  ok (errore atteso):', expect_err); return None
    assert r.returncode == 0, f'{sql}\n{err}'
    return out
U = {k: str(uuid.uuid4()) for k in 'ABCD'}
for k, u in U.items():
    q(None, f"insert into auth.users values ('{u}','{k}@centrale.it')")
    q(None, f"insert into profiles(id,name,surname,dob,gender) values ('{u}','{k}','Test','1990-01-01','f')")
q(None, "select private.configure('https://abc.supabase.co/','s3cret')")
for b in 'BC': q(None, f"insert into links(kind,uids,pair) values ('friend', array['{U['A']}','{U[b]}']::uuid[], '{U['A']}:{U[b]}c')")
S = 'sos_centrale_0001'
q(U['A'], f"select send_sos('{S}', 41.9, 12.5, 10)")
calls = lambda: int(q(None, "select count(*) from net.calls where body->>'event'='help_role'"))
print('soccorritori')
q(U['D'], f"select sos_help('{S}','coming')", 'Non autorizzato')
q(U['B'], f"select sos_help('{S}','volo')", 'Ruolo non valido')
q(U['B'], f"select sos_help('{S}','coming', 41.91, 12.51, 6)")
h = json.loads(q(U['A'], f"select helpers from sos where id='{S}'"))
assert h[U['B']]['role'] == 'coming' and h[U['B']]['eta'] == 6, h
assert U['B'] in json.loads(q(U['A'], f"select acks from sos where id='{S}'"))
assert calls() == 1
r = json.loads(q(U['B'], f"select sos_help('{S}','coming', 41.912, 12.511, 5)")); assert r.get('skipped'), r     # troppo presto
q(U['C'], f"select sos_help('{S}','calling')"); assert calls() == 2
assert json.loads(q(U['C'], f"select helpers from sos where id='{S}'"))[U['B']]['role'] == 'coming'      # C vede B
print('prove')
q(U['B'], f"select add_evidence('{S}','frame')", 'Non autorizzato')
q(U['A'], f"select add_evidence('{S}','audio','{U['B']}/{S}/a0001.m4a','{'a'*64}')", 'Percorso non valido')
q(U['A'], f"select add_evidence('{S}','video')", 'violates check constraint')
for i in range(1, 4):
    q(U['A'], f"select add_evidence('{S}','audio','{U['A']}/{S}/a{i:04d}.m4a', repeat('{i:x}',64))")
q(U['A'], f"select add_evidence('{S}','pos',null,null,'GPS',41.9001,12.5002)")
q(U['A'], f"select add_evidence('{S}','event',null,null,'Sono al sicuro',999,999)")       # coordinate assurde: ignorate
v = json.loads(q(U['C'], f"select verify_evidence('{S}')")); assert v['ok'] and v['count'] == 5, v
assert q(U['B'], f"select count(*) from sos_evidence") == '5' and q(U['D'], "select count(*) from sos_evidence") == '0'
q(U['D'], f"select verify_evidence('{S}')", 'Non autorizzato')
q(None, f"update sos_evidence set sha = repeat('f',64) where sos_id='{S}' and seq=2")            # manomissione
v = json.loads(q(U['A'], f"select verify_evidence('{S}')")); assert not v['ok'] and v['firstBad'] == 2, v
q(U['A'], f"insert into sos_evidence(sos_id,seq,kind,chain) values ('{S}',99,'event','x')", 'permission denied')
print('chiusura')
q(U['A'], f"select resolve_sos('{S}')")
q(U['B'], f"select sos_help('{S}','arrived')", 'già stato chiuso')
q(None, f"delete from sos where id='{S}'"); assert q(None, "select count(*) from sos_evidence") == '0'
print('TEST CENTRALE SUPERATI')
