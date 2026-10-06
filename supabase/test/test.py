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
A,B,C,D = [str(uuid.uuid4()) for _ in range(4)]
for u,e in [(A,'a'),(B,'b'),(C,'c'),(D,'d')]: q(None, f"insert into auth.users values ('{u}','{e}@x.it')")
q(None, "select private.configure('https://abc.supabase.co/','s3cret')")
print('profili')
q(A, f"insert into profiles(id,name,surname,dob,gender,phone) values ('{A}','Anna','Rossi','1990-01-01','f','+39 333')")
q(B, f"insert into profiles(id,name,surname,dob,gender) values ('{B}','Bruno','Bianchi','1991-01-01','m')")
q(C, f"insert into profiles(id,name,surname,dob,gender) values ('{C}','Carla','Verdi','1992-01-01','f')")
q(B, f"insert into profiles(id,name,surname,dob,gender) values ('{D}','Fake','X','1992-01-01','f')", 'row-level security')
q(A, f"update profiles set last_sos_at=now() where id='{A}'", 'permission denied')
q(A, f"update profiles set phone='+39 1' where id='{A}'")
q(A, f"select save_token('tokA')"); q(A, f"select save_token('tokA')")
assert q(None, f"select fcm_tokens from profiles where id='{A}'") == '{tokA}'
for i in range(15): q(A, f"select save_token('t{i}')")
assert q(None, f"select cardinality(fcm_tokens) from profiles where id='{A}'") == '10'
assert q(B, "select count(*) from profiles") == '1'
print('inviti')
inv = json.loads(q(A, "select create_invite('friend')")); print('  codice', inv['code'])
q(A, f"select redeem_invite('{inv['code']}')", 'tuo codice')
q(D, f"select redeem_invite('{inv['code']}')", 'Completa prima il profilo')
r = json.loads(q(B, f"select redeem_invite('{inv['code'].lower()}')")); assert r == {'kind':'friend','name':'Anna Rossi'}, r
q(B, f"select redeem_invite('{inv['code']}')", 'Codice non valido')
q(C, "select count(*) from private.codes", 'permission denied')
p = json.loads(q(C, "select create_invite('partner')"))
q(None, f"update private.codes set expires_at = now() - interval '1 min' where code='{p['code']}'")
q(A, f"select redeem_invite('{p['code']}')", 'scaduto')
p = json.loads(q(C, "select create_invite('partner')")); q(A, f"select redeem_invite('{p['code']}')")
p2 = json.loads(q(B, "select create_invite('partner')")); q(A, f"select redeem_invite('{p2['code']}')", 'già un partner')
assert q(A, "select count(*) from links") == '2' and q(B, "select count(*) from links") == '1' and q(D, "select count(*) from links") == '0'
q(A, "insert into links(kind,uids,pair) values ('friend', array[gen_random_uuid(),gen_random_uuid()], 'x')", 'permission denied')
print('gruppi')
g = json.loads(q(A, "select create_group('Famiglia')")); gid = g['groupId']
q(None, f"insert into profiles(id,name,surname,dob,gender) values ('{D}','Dario','Neri','1993-01-01','m')")
r = json.loads(q(D, f"select redeem_invite('{g['code']}')")); assert r['kind']=='group'
q(D, f"select redeem_invite('{g['code']}')", 'già chiesto')
assert q(D, "select count(*) from groups") == '0'
q(D, f"select decide_join('{gid}','{D}',true)", "Solo l''admin".replace("''","'"))
q(A, f"select decide_join('{gid}','{D}',true)")
assert q(D, "select count(*) from groups") == '1'
q(D, f"select remove_member('{gid}','{A}')", 'admin non può uscire')
print('chat')
link_ab = q(A, f"select id from links where '{B}' = any(uids)")
q(A, f"insert into messages(chat_id,type,from_uid,text) values ('{link_ab}','text','{A}','ciao')")
q(A, f"insert into messages(chat_id,type,from_uid,text) values ('{link_ab}','sos','{A}','x')", 'row-level security')
q(D, f"insert into messages(chat_id,type,from_uid,text) values ('{link_ab}','text','{D}','intruso')", 'row-level security')
q(A, f"insert into messages(chat_id,type,from_uid,text) values ('{gid}','text','{A}','ciao gruppo')")
assert q(B, "select from_name||':'||text from messages") == 'Anna Rossi:ciao', q(B, "select * from messages")
assert q(D, "select count(*) from messages") == '1'
assert q(C, "select count(*) from messages") == '0'
print('SOS')
q(A, "select send_sos('abc')", 'SOS non valido')
r = json.loads(q(A, "select send_sos('sos_0000000001', 45.1, 7.6, 12.4)")); assert r['recipients'] == 3, r
q(A, "select send_sos('sos_0000000002', 45.1, 7.6, 12.4)", 'appena inviato')
for u in (B,C,D): assert q(u, "select count(*) from sos where active") == '1'
assert q(None, "select count(*) from messages where type='sos'") == '3'
q(A, f"select attach_sos_photos('sos_0000000001', array['sos/{A}/sos_0000000001/back.jpg','sos/{B}/x/back.jpg','sos/{A}/sos_0000000001/evil.png'])")
assert q(B, "select photos from sos") == '{sos/%s/sos_0000000001/back.jpg}' % A
assert q(D, "select distinct photos from messages where type='sos'") == '{sos/%s/sos_0000000001/back.jpg}' % A
q(B, "select attach_sos_photos('sos_0000000001', array['x'])", 'Non autorizzato')
q(B, "select ack_sos('sos_0000000001')")
assert json.loads(q(A, "select acks from sos"))[B] == 'Bruno Bianchi'
q(C, "select resolve_sos('sos_0000000001')", 'Non autorizzato')
q(A, "select resolve_sos('sos_0000000001')")
assert q(B, "select count(*) from sos where active") == '0'
assert q(None, "select count(*) from messages where type='safe'") == '3'
print('storage policy')
q(A, f"insert into storage.objects(bucket_id,name) values ('sos','{A}/sos_0000000001/back.jpg')")
q(A, f"insert into storage.objects(bucket_id,name) values ('sos','{B}/sos_0000000001/back.jpg')", 'row-level security')
q(A, f"insert into storage.objects(bucket_id,name) values ('sos','{A}/sos_0000000001/x.exe')", 'row-level security')
assert q(B, "select count(*) from storage.objects") == '1'
assert q(None, f"select count(*) from profiles") == '4'
assert q('%s' % str(uuid.uuid4()), "select count(*) from storage.objects") == '0'
print('push in coda:', q(None, "select string_agg(body->>'event', ',' order by id) from net.calls"))
assert q(None, "select distinct headers->>'x-vicina-secret' from net.calls") == 's3cret'
assert q(None, "select distinct url from net.calls") == 'https://abc.supabase.co/functions/v1/vicina'
print('pulizia')
q(None, "select private.cleanup()")
print('rimozione / eliminazione')
q(B, f"select remove_link('{link_ab}')")
assert q(None, f"select count(*) from messages where chat_id='{link_ab}'") == '0'
q(D, f"select remove_member('{gid}','{D}')"); assert q(D, "select count(*) from groups") == '0'
q(A, "select delete_account()")
assert q(None, f"select count(*) from auth.users where id='{A}'") == '0'
assert q(None, "select count(*) from groups") == '0' and q(None, "select count(*) from links") == '0'
assert q(None, f"select count(*) from profiles") == '3'
q(None, "select ping()"); q(B, "select create_group('X')"); 
print('anon:'); q(None, "set role anon; select count(*) from profiles", 'permission denied'); q(None, "set role anon; select create_group('x')", 'permission denied')
print('\nTUTTI I TEST SUPERATI')

print('\nv3: posizione live e vocale')
E = str(uuid.uuid4()); F = str(uuid.uuid4())
for u in (E, F): q(None, f"insert into auth.users values ('{u}','{u[:4]}@x.it')")
q(E, f"insert into profiles(id,name,surname,dob,gender) values ('{E}','Elena','Blu','1990-01-01','f')")
q(F, f"insert into profiles(id,name,surname,dob,gender) values ('{F}','Fabio','Gialli','1990-01-01','m')")
inv = json.loads(q(E, "select create_invite('friend')")); q(F, f"select redeem_invite('{inv['code']}')")
r = json.loads(q(E, "select send_sos('live_000000001', 45.0, 7.0, 10, true)")); assert r['recipients'] == 1 and r['liveUntil'], r
q(None, "update sos set loc_at = now() - interval '10 seconds' where id='live_000000001'")
r = json.loads(q(E, "select update_sos_location('live_000000001', 45.001, 7.001, 8)")); assert r['live'] is True, r
assert q(F, "select lat||','||lng||','||jsonb_array_length(track) from sos where id='live_000000001'") == '45.001,7.001,2'
assert q(F, "select distinct lat from messages where sos_id='live_000000001' and type='sos'") == '45.001'
q(F, "select update_sos_location('live_000000001', 1, 1, 1)", 'Non autorizzato')
q(E, "select update_sos_location('live_000000001', 999, 7, 1)", 'Posizione non valida')
q(None, "update sos set loc_at = now() - interval '10 seconds' where id='live_000000001'")
q(E, "select stop_sos_live('live_000000001')")   # v4: non ferma più la live finché l'SOS è attivo
assert json.loads(q(E, "select update_sos_location('live_000000001', 45.002, 7.002, 8)"))['live'] is True
q(E, f"select attach_sos_audio('live_000000001', 'sos/{E}/live_000000001/voice.webm')")
assert q(F, "select audio from sos where id='live_000000001'").endswith('voice.webm')
assert q(F, "select distinct audio from messages where sos_id='live_000000001'").endswith('voice.webm')
q(E, f"select attach_sos_audio('live_000000001', 'sos/{E}/live_000000001/voice.exe')", 'File non valido')
q(E, f"insert into storage.objects(bucket_id,name) values ('sos','{E}/live_000000001/voice.webm')")
q(E, f"insert into storage.objects(bucket_id,name) values ('sos','{E}/live_000000001/voice.exe')", 'row-level security')
q(None, "update profiles set last_sos_at = now() - interval '1 minute' where id='%s'" % E)
r = json.loads(q(E, "select send_sos('live_000000002', 45.0, 7.0, 10, false)")); assert r['liveUntil'], r   # v4: live sempre
q(None, "update sos set loc_at = now() - interval '10 seconds' where id='live_000000002'")
assert json.loads(q(E, "select update_sos_location('live_000000002', 45.1, 7.1, 8)"))['live'] is True
assert q(None, "select live_until > now() + interval '11 hours' from sos where id='live_000000002'") == 't'
q(E, "select resolve_sos('live_000000002')")
assert json.loads(q(E, "select update_sos_location('live_000000002', 45.2, 7.2, 8)"))['live'] is False   # chiuso con Sono al sicuro
assert q(None, "select live_until <= now() from sos where id='live_000000002'") == 't'
assert q(None, "select active from sos where id='live_000000001'") == 'f'   # chiuso dal nuovo SOS
print('push in coda v3:', q(None, "select string_agg(body->>'event', ',' order by id) from net.calls where body->>'event' in ('voice')"))
print('TEST v3 SUPERATI')

print('\nv4: percorso fino a 300 punti')
q(None, "update profiles set last_sos_at = now() - interval '1 minute' where id='%s'" % E)
q(E, "select send_sos('live_000000003', 45.0, 7.0, 10)")
for i in range(305):
    q(None, "update sos set loc_at = now() - interval '10 seconds' where id='live_000000003'")
    q(E, f"select update_sos_location('live_000000003', {45 + i/10000}, 7.0, 5)")
assert q(F, "select jsonb_array_length(track) from sos where id='live_000000003'") == '300'
print('TEST v4 SUPERATI')
