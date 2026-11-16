// Pinhole client API. Needs config.js (loaded first) setting: window.PINHOLE={url:'https://xxx.supabase.co',anonKey:'...'}
// anonKey is public by design; RLS in schema.sql enforces access. NEVER put the service_role key in frontend code.
import {createClient} from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
const c=window.PINHOLE&&window.PINHOLE.url?createClient(window.PINHOLE.url,window.PINHOLE.anonKey):null;
const ok=r=>{if(r.error)throw new Error(r.error.message);return r.data};
const uid=async()=>(await c.auth.getUser()).data.user?.id;
export const configured=!!c;
export const auth={
 signUp:async(email,password,username)=>ok(await c.auth.signUp({email,password,options:{data:{username:username.toLowerCase()}}})),
 session:async()=>(await c.auth.getSession()).data.session,
 // profile is created on first sign-in (works even when email confirmation is on)
 ensureProfile:async()=>{const u=(await c.auth.getUser()).data.user;const r=await c.from('profiles').select('*').eq('id',u.id).maybeSingle();if(r.error)throw new Error(r.error.message);if(r.data)return r.data;
  return ok(await c.from('profiles').insert({id:u.id,username:(u.user_metadata?.username||'').toLowerCase()}).select().single())},
 signIn:async(email,password)=>ok(await c.auth.signInWithPassword({email,password})),
 signOut:()=>c.auth.signOut(),
 deleteAccount:async()=>{ok(await c.rpc('delete_account'));await c.auth.signOut()}};
// Re-encoding through a canvas drops EXIF (GPS location) and applies iPhone rotation.
export async function compress(file,max=1280){const b=await createImageBitmap(file,{imageOrientation:'from-image'});
 const k=Math.min(1,max/Math.max(b.width,b.height)),cv=document.createElement('canvas');cv.width=b.width*k;cv.height=b.height*k;
 cv.getContext('2d').drawImage(b,0,0,cv.width,cv.height);return new Promise(r=>cv.toBlob(r,'image/jpeg',.8))}
export const social={
 search:async q=>ok(await c.from('profiles').select('id,username,display_name').ilike('username',q.toLowerCase()+'%').neq('id',await uid()).limit(10)),
 request:async to=>ok(await c.from('friendships').insert({requester:await uid(),addressee:to})),
 respond:async(from,accept)=>accept?ok(await c.from('friendships').update({status:'accepted'}).eq('requester',from).eq('addressee',await uid())):ok(await c.from('friendships').delete().eq('requester',from).eq('addressee',await uid())),
 names:async ids=>ok(await c.from('profiles').select('id,username').in('id',ids)),
 friends:async()=>ok(await c.from('friendships').select('requester,addressee,status')),
 sendFind:async(to,prompt_id)=>ok(await c.from('sent_finds').insert({from_user:await uid(),to_user:to,prompt_id})),
 block:async u=>ok(await c.from('blocks').insert({blocker:await uid(),blocked:u})),
 report:async(o)=>ok(await c.from('reports').insert({reporter:await uid(),...o}))};
export const finds={
 today:async()=>ok(await c.rpc('today_prompt')),
 // upload to private bucket, then insert row; unique index rejects a second daily submission
 submit:async(file,prompt_id,caption,group_id=null,onState=()=>{})=>{onState('Compressing');const blob=await compress(file);
  const path=`${await uid()}/${crypto.randomUUID()}.jpg`;onState('Uploading');ok(await c.storage.from('photos').upload(path,blob,{contentType:'image/jpeg'}));
  const r=await c.from('submissions').insert({user_id:await uid(),prompt_id,photo_path:path,caption,group_id}).select().single();
  if(r.error){await c.storage.from('photos').remove([path]);throw new Error(r.error.code=='23505'?'You already submitted today’s find.':r.error.message)}return r.data},
 visible:async(prompt_id)=>ok(await c.from('submissions').select('*,profiles(username)').eq('prompt_id',prompt_id).order('created_at',{ascending:false})),
 url:async path=>ok(await c.storage.from('photos').createSignedUrl(path,3600)).signedUrl,
 remove:async s=>{ok(await c.from('submissions').delete().eq('id',s.id));await c.storage.from('photos').remove([s.photo_path])},
 react:async id=>ok(await c.from('reactions').upsert({submission_id:id,user_id:await uid()})),
 streaks:async()=>ok(await c.from('streaks').select('*'))};
export const groups={
 create:async(name,color)=>ok(await c.from('groups').insert({name,color,owner:await uid()}).select().single()),
 invite:async(group_id,user_id)=>ok(await c.from('group_members').insert({group_id,user_id})),
 album:async(group_id,name)=>ok(await c.from('albums').insert({group_id,name}).select().single()),
 addToAlbum:async(album_id,submission_id)=>ok(await c.from('album_items').insert({album_id,submission_id}))};
export const notes={list:async()=>ok(await c.from('notifications').select('*,profiles:actor(username)').order('created_at',{ascending:false}).limit(30)),
 readAll:async()=>ok(await c.from('notifications').update({read:true}).eq('read',false))};
