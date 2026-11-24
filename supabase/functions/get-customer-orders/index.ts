import { createClient } from "npm:@supabase/supabase-js@2";
const allowedOrigins=new Set(["https://food-cart-os.vercel.app","https://food-cart-os-vishal9415.vercel.app","https://food-cart-os-git-main-vishal9415.vercel.app","https://localhost","capacitor://localhost","http://localhost:5173","http://127.0.0.1:5173"]);
function corsHeaders(req:Request){const origin=req.headers.get("Origin")||"";const headers:Record<string,string>={"Vary":"Origin","Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info","Access-Control-Allow-Methods":"POST, OPTIONS"};if(allowedOrigins.has(origin))headers["Access-Control-Allow-Origin"]=origin;return headers;}
async function sha256(value:string){const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));return Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,"0")).join("");}
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:corsHeaders(req)});
 if(req.method!=="POST")return Response.json({error:"Method not allowed"},{status:405,headers:corsHeaders(req)});
 try{
  const url=Deno.env.get("SUPABASE_URL"),key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!url||!key)return Response.json({error:"Order tracking is not configured"},{status:503,headers:corsHeaders(req)});
  const body=await req.json(),token=typeof body?.session_token==="string"?body.session_token:"",cartId=typeof body?.cart_id==="string"?body.cart_id:"";
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(cartId))return Response.json({error:"Cart link is invalid"},{status:400,headers:corsHeaders(req)});
  if(!/^[a-f0-9]{64}$/i.test(token))return Response.json({error:"Customer session is invalid"},{status:400,headers:corsHeaders(req)});
  const db=createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false}}),hash=await sha256(token);
  const {data:session,error:sessionError}=await db.from("customer_sessions").select("id").eq("token_hash",hash).eq("cart_id",cartId).gt("expires_at",new Date().toISOString()).maybeSingle();
  if(sessionError)return Response.json({error:"Could not retrieve orders"},{status:500,headers:corsHeaders(req)});
  if(!session)return Response.json({orders:[]},{status:200,headers:corsHeaders(req)});
  const {data,error}=await db.from("orders").select("id,order_number,status,total_amount,pickup_token,created_at,order_items(item_name,quantity,status)").eq("customer_session_id",session.id).order("created_at",{ascending:false}).limit(10);
  if(error)return Response.json({error:"Could not retrieve orders"},{status:500,headers:corsHeaders(req)});
  return Response.json({orders:data||[]},{status:200,headers:corsHeaders(req)});
 }catch{return Response.json({error:"Invalid request"},{status:400,headers:corsHeaders(req)});}
});