import { describe, it, expect, vi } from 'vitest'
import { createFirstLoginHandler } from '../../supabase/functions/complete-first-login/handler'
const request = (body: unknown) => new Request('https://example.com', { method: 'POST', headers: {Authorization:'Bearer test'}, body: JSON.stringify(body) })
function setup(user: {id: string; required: boolean} | null = {id:'caller',required:true}) { const complete=vi.fn().mockResolvedValue(null); return {complete, handler:createFirstLoginHandler({getCaller:async()=>user,complete})} }
describe('first-login password setup',()=>{
 it('requires a verified user',async()=>{const {handler,complete}=setup(null);expect((await handler(request({password:'new-password'}))).status).toBe(401);expect(complete).not.toHaveBeenCalled()})
 it('requires a server-owned setup flag',async()=>{const {handler,complete}=setup({id:'caller',required:false});expect((await handler(request({password:'new-password',required:true}))).status).toBe(403);expect(complete).not.toHaveBeenCalled()})
 it('rejects invalid passwords',async()=>{const {handler,complete}=setup();for(const password of ['short',' '.repeat(8),'x'.repeat(129),null])expect((await handler(request({password}))).status).toBe(400);expect(complete).not.toHaveBeenCalled()})
 it('changes only the authenticated caller even if a target is supplied',async()=>{const {handler,complete}=setup();const r=await handler(request({password:'new-password',user_id:'victim'}));expect(r.status).toBe(200);expect(complete).toHaveBeenCalledExactlyOnceWith('caller','new-password');expect(await r.json()).toEqual({success:true})})
 it('does not claim completion on provider failure',async()=>{const {handler,complete}=setup();complete.mockResolvedValue('Password rejected');expect((await handler(request({password:'new-password'}))).status).toBe(400)})
 it('handles malformed payloads and unexpected failures',async()=>{const {handler,complete}=setup();expect((await handler(request(null))).status).toBe(400);complete.mockRejectedValue(new Error('upstream'));expect((await handler(request({password:'new-password'}))).status).toBe(500)})
})
