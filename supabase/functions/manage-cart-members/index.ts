import { createClient } from "npm:@supabase/supabase-js@2";
const allowedOrigins=new Set(["https://food-cart-os.vercel.app","https://food-cart-os-vishal9415.vercel.app","https://food-cart-os-git-main-vishal9415.vercel.app","https://localhost","capacitor://localhost","http://localhost:5173","http://127.0.0.1:5173"]);
function corsHeaders(req:Request){const origin=req.headers.get("Origin")||"";const headers:Record<string,string>={"Vary":"Origin","Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info","Access-Control-Allow-Methods":"POST, OPTIONS"};if(allowedOrigins.has(origin))headers["Access-Control-Allow-Origin"]=origin;return headers;}
const reply=(req:Request,body:unknown,status=200)=>Response.json(body,{status,headers:corsHeaders(req)});
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:corsHeaders(req)});
 if(req.method!=="POST")return reply(req,{error:"Method not allowed"},405);
 try{
  const url=Deno.env.get("SUPABASE_URL"),key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),authorization=req.headers.get("Authorization")||"",token=authorization.replace(/^Bearer\s+/i,"");
  if(!url||!key)return reply(req,{error:"Team service is not configured"},503);
  if(!token||token===authorization)return reply(req,{error:"Sign in required"},401);
  const db=createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false}});
  const {data:{user:actor},error:authError}=await db.auth.getUser(token);
  if(authError||!actor)return reply(req,{error:"Your session is invalid. Sign in again."},401);
  const body=await req.json(),cartId=String(body?.cart_id||""),action=String(body?.action||"");
  if(!/^[0-9a-f-]{36}$/i.test(cartId))return reply(req,{error:"Invalid cart"},400);
  const {data:membership,error:membershipError}=await db.from("cart_members").select("role").eq("cart_id",cartId).eq("user_id",actor.id).maybeSingle();
  if(membershipError||membership?.role!=="owner")return reply(req,{error:"Only this cart's owner can manage team access."},403);
  if(action==="list"){
   const {data:members,error}=await db.from("cart_members").select("id,user_id,role,created_at").eq("cart_id",cartId).order("created_at");
   if(error)throw error;
   const users=new Map<string,any>();
   for(let page=1;page<=20;page++){const {data,error}=await db.auth.admin.listUsers({page,perPage:100});if(error)throw error;for(const u of data.users)users.set(u.id,u);if(data.users.length<100)break;}
   return reply(req,{members:(members||[]).map(m=>({id:m.user_id,role:m.role,created_at:m.created_at,email:users.get(m.user_id)?.email||"",last_sign_in_at:users.get(m.user_id)?.last_sign_in_at||null}))});
  }
  if(action==="invite"){
   const email=String(body?.email||"").trim().toLowerCase(),role=String(body?.role||"operator");
   if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return reply(req,{error:"Enter a valid email address."},400);
   if(!["operator","manager"].includes(role))return reply(req,{error:"Choose Operator or Manager access."},400);
   let target:any=null;
   for(let page=1;page<=20&&!target;page++){const {data,error}=await db.auth.admin.listUsers({page,perPage:100});if(error)throw error;target=data.users.find(u=>(u.email||"").toLowerCase()===email)||null;if(data.users.length<100)break;}
   // Validate an existing account's access before sending any invitation email.
   if(target){
    if(target.id===actor.id)return reply(req,{error:"You cannot replace your own owner access."},400);
    const {data:existing,error:existingError}=await db.from("cart_members").select("cart_id,role").eq("user_id",target.id).limit(1).maybeSingle();
    if(existingError)throw existingError;
    if(existing&&existing.cart_id!==cartId)return reply(req,{error:"This account is already linked to another cart."},409);
    if(existing?.role==="owner")return reply(req,{error:"Owner access cannot be changed through staff invitations."},409);
   }else{
    const {data,error}=await db.auth.admin.inviteUserByEmail(email);
    if(error)throw error;
    target=data.user;
   }
   if(!target)return reply(req,{error:"We could not create the invitation."},500);
   const {error}=await db.from("cart_members").upsert({cart_id:cartId,user_id:target.id,role},{onConflict:"cart_id,user_id"});
   if(error)throw error;
   return reply(req,{success:true,email,role});
  }
  if(action==="set_role"){
   const userId=String(body?.user_id||""),role=String(body?.role||"");
   if(!userId||userId===actor.id)return reply(req,{error:"You cannot change your own access."},400);
   if(!["operator","manager"].includes(role))return reply(req,{error:"Choose Operator or Manager access."},400);
   const {data:target}=await db.from("cart_members").select("id,role").eq("cart_id",cartId).eq("user_id",userId).maybeSingle();
   if(!target)return reply(req,{error:"Team member not found."},404);
   if(target.role==="owner")return reply(req,{error:"Owner access cannot be changed through staff management."},409);
   const {error}=await db.from("cart_members").update({role}).eq("id",target.id);
   if(error)throw error;
   return reply(req,{success:true});
  }
  if(action==="remove"){
   const userId=String(body?.user_id||"");
   if(!userId||userId===actor.id)return reply(req,{error:"You cannot remove your own owner access."},400);
   const {data:target}=await db.from("cart_members").select("role").eq("cart_id",cartId).eq("user_id",userId).maybeSingle();
   if(!target)return reply(req,{error:"Team member not found."},404);
   if(target.role==="owner")return reply(req,{error:"Owner access cannot be removed through staff management."},409);
   const {error}=await db.from("cart_members").delete().eq("cart_id",cartId).eq("user_id",userId);
   if(error)throw error;
   return reply(req,{success:true});
  }
  return reply(req,{error:"Unsupported team action."},400);
 }catch(error){console.error("manage-cart-members failed",error instanceof Error?error.message:String(error));return reply(req,{error:"Team access could not be updated. Try again."},500);}
});