# Test dell'Appello «State tutti bene?» (dopo test.py o su un database nuovo con schema.sql + aggiornamento-appello.sql)
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
U = {k: str(uuid.uuid4()) for k in 'ABCDEX'}
for k, u in U.items():
    q(None, f"insert into auth.users values ('{u}','{k}@appello.it')")
    if k != 'X': q(None, f"insert into profiles(id,name,surname,dob,gender) values ('{u}','{k}nna','Test','1990-01-01','f')")
def link(a, b): q(None, f"insert into links(kind,uids,pair) values ('friend', array['{U[a]}','{U[b]}']::uuid[], '{U[a]}:{U[b]}')")
q(None, "select private.configure('https://abc.supabase.co/','s3cret')")
link('A','B'); link('A','C'); link('B','D')
q(None, f"insert into groups(name,admin_uid,code,member_uids) values ('Casa','{U['A']}','APP001', array['{U['A']}','{U['E']}']::uuid[])")
calls = lambda: int(q(None, "select count(*) from net.calls where body->>'event' like 'check%'"))
c0 = calls()
print('invio')
q('X' and U['X'], "select send_check('chk_0000000001','terremoto')", 'Completa prima il profilo')
q(U['D'], "select send_check('bad id','terremoto')", 'Appello non valido')
r = json.loads(q(U['A'], "select send_check('chk_0000000001','terremoto','Scossa forte',41.9,12.5)"))
assert r == {'recipients': 3}, r                      # B, C, E (D non è collegato ad A)
assert calls() == c0 + 1
q(U['A'], "select send_check('chk_0000000002','altro')", 'appena lanciato')
assert q(U['A'], "select reason||'|'||note||'|'||answered from checks") == 'terremoto|Scossa forte|0'
assert q(U['B'], "select count(*) from checks") == '1' and q(U['D'], "select count(*) from checks") == '0'
q(U['B'], "insert into checks(id,from_uid,recipients) values ('x123456789', auth.uid(), '{}')", 'permission denied')
print('risposte')
q(U['D'], "select answer_check('chk_0000000001','ok')", 'Appello non trovato')
q(U['B'], "select answer_check('chk_0000000001','forse')", 'Risposta non valida')
q(U['B'], "select answer_check('chk_0000000001','ok',null,41.91,12.51,20)")
q(U['C'], "select answer_check('chk_0000000001','help','Sono bloccata in casa',41.95,12.4,15)")
assert q(U['A'], "select answered||'|'||helps from checks") == '2|1'
assert calls() == c0 + 3
q(U['B'], "select answer_check('chk_0000000001','ok')")            # stessa risposta: niente notifica nuova
assert calls() == c0 + 3
assert q(U['B'], "select lat from check_answers where uid=auth.uid()") == '41.91'   # posizione tenuta
print('chi vede cosa')
assert q(U['A'], "select count(*) from check_answers") == '3'                      # A vede tutti (sé, B, C)
assert q(U['B'], "select string_agg(split_part(name,' ',1), ',' order by name) from check_answers") == 'Anna,Bnna'   # B: A e sé, non C
assert q(U['C'], "select string_agg(split_part(name,' ',1), ',' order by name) from check_answers") == 'Anna,Cnna'
assert q(U['E'], "select string_agg(split_part(name,' ',1), ',' order by name) from check_answers") == 'Anna'        # E non ha risposto
assert q(U['D'], "select count(*) from check_answers") == '0'
assert q(U['E'], "select answered||'|'||helps from checks") == '2|1'                # i numeri li vedono tutti
print('sollecito e chiusura')
q(U['B'], "select remind_check('chk_0000000001')", 'Non autorizzato')
assert json.loads(q(U['A'], "select remind_check('chk_0000000001')")) == {'waiting': 1}
q(U['A'], "select remind_check('chk_0000000001')", 'appena mandato un sollecito')
q(U['B'], "select close_check('chk_0000000001')")
assert q(U['A'], "select active from checks") == 't'
assert json.loads(q(U['A'], "select close_check('chk_0000000001')")) == {'ok': True}
q(U['E'], "select answer_check('chk_0000000001','ok')", 'già stato chiuso')
print('pulizia')
q(None, "update checks set created_at = now() - interval '8 days'")
q(None, "select private.cleanup_checks()")
assert q(None, "select count(*) from checks") == '0' and q(None, "select count(*) from check_answers") == '0'
assert q(None, "select count(*) from cron.job where jobname='vicina-appelli'") == '1'
print('TEST APPELLO SUPERATI')
