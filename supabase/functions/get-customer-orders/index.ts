import { createClient } from "npm:@supabase/supabase-js@2";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info","Access-Control-Allow-Methods":"POST, OPTIONS"};
async function sha256(value:string){const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));return Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,"0")).join("");}
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 if(req.method!=="POST")return Response.json({error:"Method not allowed"},{status:405,headers:cors});
 try{
  const url=Deno.env.get("SUPABASE_URL"),key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!url||!key)return Response.json({error:"Order tracking is not configured"},{status:503,headers:cors});
  const body=await req.json(),token=typeof body?.session_token==="string"?body.session_token:"";
  if(!/^[A-Za-z0-9_-]{40,200}$/.test(token))return Response.json({error:"Customer session is invalid"},{status:400,headers:cors});
  const db=createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false}}),hash=await sha256(token);
  const {data:session,error:sessionError}=await db.from("customer_sessions").select("id").eq("token_hash",hash).gt("expires_at",new Date().toISOString()).maybeSingle();
  if(sessionError)return Response.json({error:"Could not retrieve orders"},{status:500,headers:cors});
  if(!session)return Response.json({orders:[]},{status:200,headers:cors});
  const {data,error}=await db.from("orders").select("id,order_number,status,total_amount,pickup_token,created_at,order_items(item_name,quantity,status)").eq("customer_session_id",session.id).order("created_at",{ascending:false}).limit(10);
  if(error)return Response.json({error:"Could not retrieve orders"},{status:500,headers:cors});
  return Response.json({orders:data||[]},{status:200,headers:cors});
 }catch{return Response.json({error:"Invalid request"},{status:400,headers:cors});}
});