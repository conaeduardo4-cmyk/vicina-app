# Test Vicina 3.3: posizioni della cerchia visibili solo a chi ha l'SOS attivo.
import subprocess, json, uuid, sys
DB = sys.argv[1] if len(sys.argv) > 1 else 't3'
def q(user, sql, expect_err=None):
    pre = "set role authenticated; set request.jwt.claim.sub='%s';" % user if user else ""
    r = subprocess.run(['psql','-h','/var/tmp/vpg','-p','5499','-U','postgres','-d',DB,'-tAq','-v','ON_ERROR_STOP=1','-c', pre + sql], capture_output=True, text=True)
    out, err = r.stdout.strip(), r.stderr.strip()
    if expect_err:
        assert expect_err in err, f'atteso "{expect_err}", avuto: {out} {err}'; return None
    assert r.returncode == 0, f'{sql}\n{err}'
    return out
A, B, C, X = [str(uuid.uuid4()) for _ in range(4)]
for u, e in [(A,'a'),(B,'b'),(C,'c'),(X,'x')]: q(None, f"insert into auth.users values ('{u}','{e}33@x.it')")
q(None, "select private.configure('https://abc.supabase.co/','s3cret')")
for u, n in [(A,'Anna'),(B,'Bruno'),(C,'Carla'),(X,'Xeno')]: q(u, f"insert into profiles(id,name,surname,dob,gender,phone) values ('{u}','{n}','Test','1990-05-14','f','')")
for o in (B, C):
    inv = json.loads(q(A, "select create_invite('friend')")); q(o, f"select redeem_invite('{inv['code']}')")
sid = 'sos_33aaaaaaaa'
q(A, f"select send_sos('{sid}', 41.9, 12.5, 10)")
q(B, f"select sos_share_pos('{sid}', 41.91, 12.51, 15)")
q(C, f"select sos_share_pos('{sid}', 41.92, 12.52, null)")
q(X, f"select sos_share_pos('{sid}', 41.0, 12.0)", 'Non autorizzato')
q(B, f"select sos_share_pos('{sid}', 200, 12.5)", 'Posizione non valida')
assert json.loads(q(B, f"select sos_share_pos('{sid}', 41.95, 12.55)"))['skipped'] is True
assert q(A, f"select count(*) from sos_positions where sos_id='{sid}'") == '2'
assert q(A, f"select name from sos_positions where uid='{B}'") == 'Bruno Test'
assert q(B, "select count(*) from sos_positions") == '1'      # vede solo la sua
assert q(C, f"select count(*) from sos_positions where uid='{B}'") == '0'
q(B, f"insert into sos_positions(sos_id,uid,lat,lng) values ('{sid}','{B}',1,1)", 'permission denied')
q(A, f"select resolve_sos('{sid}')")
assert q(None, f"select count(*) from sos_positions where sos_id='{sid}'") == '0'
assert json.loads(q(B, f"select sos_share_pos('{sid}', 41.9, 12.5)"))['closed'] is True
print('TEST 3.3 SUPERATI')
