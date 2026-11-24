import { createClient } from "npm:@supabase/supabase-js@2";
const allowedOrigins=new Set(["https://food-cart-os.vercel.app","https://food-cart-os-vishal9415.vercel.app","https://food-cart-os-git-main-vishal9415.vercel.app","https://localhost","capacitor://localhost","http://localhost:5173","http://127.0.0.1:5173"]);
function corsHeaders(req:Request){const origin=req.headers.get("Origin")||"";const headers:Record<string,string>={"Vary":"Origin","Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info","Access-Control-Allow-Methods":"POST, OPTIONS"};if(allowedOrigins.has(origin))headers["Access-Control-Allow-Origin"]=origin;return headers;}
const reply=(req:Request,body:unknown,status=200)=>Response.json(body,{status,headers:corsHeaders(req)Headers(req)});
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:corsHeaders(req)});
 if(req.method!=="POST")return reply(req,{error:"Method not allowed"},405);
 try{
  const url=Deno.env.get("SUPABASE_URL"),key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const bearer=req.headers.get("Authorization")||"";
  const token=bearer.replace(/^Bearer\s+/i,"");
  if(!url||!key)return reply(req,{error:"Account service is not configured"},503);
  if(!token||token===bearer)return reply(req,{error:"Sign in to create your cart"},401);
  const db=createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false}});
  const {data:{user},error:authError}=await db.auth.getUser(token);
  if(authError||!user)return reply(req,{error:"Your session has expired. Sign in again."},401);
  const body=await req.json();
  const name=String(body?.name||"").trim().slice(0,80);
  const slug=String(body?.slug||"").trim().toLowerCase();
  if(name.length<2)return reply(req,{error:"Enter a cart name with at least 2 characters."},400);
  if(!/^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/.test(slug))return reply(req,{error:"Choose a URL name using 3–40 lowercase letters, numbers or hyphens."},400);
  const {data,error}=await db.rpc("create_cart_for_owner",{p_user_id:user.id,p_name:name,p_slug:slug});
  if(error){
   if(error.code==="23505")return reply(req,{error:"That QR link name is already taken. Try another one."},409);
   if(error.message?.includes("already has a cart"))return reply(req,{error:"This account already has a cart. Sign in to manage it."},409);
   console.error("create-cart failed",error.message);
   return reply(req,{error:"We couldn't create your cart. Please try again."},500);
  }
  return reply(req,{cart:data},201);
 }catch(error){
  console.error("create-cart request failed",error instanceof Error?error.message:String(error));
  return reply(req,{error:"Invalid cart setup request."},400);
 }
});