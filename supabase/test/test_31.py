# Test Vicina 3.1: profili, allegati chat, chat IA. Usa il DB di prova (vedi test/README.md).
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
A, B, C = [str(uuid.uuid4()) for _ in range(3)]
for u, e in [(A,'a'),(B,'b'),(C,'c')]: q(None, f"insert into auth.users values ('{u}','{e}31@x.it')")
q(None, "select private.configure('https://abc.supabase.co/','s3cret')")
for u, n in [(A,'Anna'),(B,'Bruno'),(C,'Carla')]: q(u, f"insert into profiles(id,name,surname,dob,gender,phone) values ('{u}','{n}','Test','1990-05-14','f','+39 333 {n}')")
inv = json.loads(q(A, "select create_invite('friend')")); q(B, f"select redeem_invite('{inv['code']}')")
lid = q(A, "select id from links limit 1")
print('profilo')
q(A, "select set_profile('Anna Maria','Rossi','Infermiera 🩺','Roma',true)")
assert q(None, f"select names->>'{A}' from links where id='{lid}'") == 'Anna Maria Rossi'
p = json.loads(q(B, f"select circle_profile('{A}')")); assert p['phone'] == '+39 333 Anna' and p['bio'] == 'Infermiera 🩺' and p['bday'] == '05-14' and p['kind'] == 'friend', p
q(C, f"select circle_profile('{A}')", 'Profilo non disponibile')
q(A, "select set_profile('Anna','Rossi','x','Roma',false)"); assert json.loads(q(B, f"select circle_profile('{A}')"))['bday'] is None
q(A, "select set_profile('','Rossi','','',false)", 'Scrivi nome e cognome')
q(A, "select set_banner('abcdefgh12345')"); q(A, "select set_banner('../x')", 'Immagine non valida')
print('allegati')
q(A, f"insert into messages(chat_id,type,from_uid,file,file_name,file_size,mime) values ('{lid}','image','{A}','{lid}/abcdefgh1234.jpg','foto.jpg',1000,'image/jpeg')")
q(A, f"insert into messages(chat_id,type,from_uid,file,file_name) values ('{lid}','file','{A}','altra/abcdefgh1234.pdf','x.pdf')", 'File non valido')
q(A, f"insert into messages(chat_id,type,from_uid,lat,lng) values ('{lid}','loc','{A}',41.9,12.5)")
q(A, f"insert into messages(chat_id,type,from_uid,file,dur) values ('{lid}','voice','{A}','{lid}/abcdefgh1234.m4a',12)")
q(C, f"insert into messages(chat_id,type,from_uid,text) values ('{lid}','text','{C}','ciao')", 'row-level security')
q(A, f"insert into messages(chat_id,type,from_uid,sos_id) values ('{lid}','sos','{A}','x')", 'permission denied')
assert q(B, f"select count(*) from messages where chat_id='{lid}' and type in ('image','loc','voice')") == '3'
assert q(B, f"select private.chat_folder_ok('{lid}/abc.jpg')") == 't' and q(C, f"select private.chat_folder_ok('{lid}/abc.jpg')") == 'f'
print('assistente')
cid = q(A, "insert into ai_chats(title) values ('Metro') returning id")
q(A, f"insert into ai_messages(chat_id,role,text) values ('{cid}','user','Mi seguono'),('{cid}','model','Vai dove c''è gente')")
assert q(A, f"select count(*) from ai_messages where chat_id='{cid}'") == '2'
assert q(B, "select count(*) from ai_chats") == '0' and q(B, "select count(*) from ai_messages") == '0'
q(B, f"insert into ai_messages(chat_id,role,text) values ('{cid}','user','x')", 'row-level security')
q(A, f"delete from ai_chats where id='{cid}'"); assert q(A, "select count(*) from ai_messages") == '0'
print('TEST 3.1 SUPERATI')
