import { createClient } from "npm:@supabase/supabase-js@2";
const corsHeaders = {"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info","Access-Control-Allow-Methods":"POST, OPTIONS"};
async function sha256(value:string){const bytes=new TextEncoder().encode(value);const digest=await crypto.subtle.digest("SHA-256",bytes);return Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,"0")).join("");}
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:corsHeaders});
 if(req.method!=="POST")return Response.json({error:"Method not allowed"},{status:405,headers:corsHeaders});
 try{
  const url=Deno.env.get("SUPABASE_URL"),key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!url||!key)return Response.json({error:"Checkout service is not configured"},{status:503,headers:corsHeaders});
  const body=await req.json(),customer=body?.customer&&typeof body.customer==="object"?body.customer:{},items=body?.items,notes=typeof body?.notes==="string"?body.notes.slice(0,500):null,token=typeof body?.session_token==="string"?body.session_token:"";
  if(!/^[A-Za-z0-9_-]{40,200}$/.test(token))return Response.json({error:"Customer session is invalid. Refresh the page and try again."},{status:400,headers:corsHeaders});
  if(!Array.isArray(items)||items.length<1||items.length>30)return Response.json({error:"Add between 1 and 30 items"},{status:400,headers:corsHeaders});
  const clean=items.map((item:any)=>({menu_item_id:String(item?.menu_item_id??""),quantity:Number(item?.quantity)}));
  if(clean.some((item:any)=>!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(item.menu_item_id)||!Number.isInteger(item.quantity)||item.quantity<1||item.quantity>999))return Response.json({error:"One or more order items are invalid"},{status:400,headers:corsHeaders});
  const db=createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false}}),hash=await sha256(token);
  const {data:session,error:sessionError}=await db.from("customer_sessions").upsert({token_hash:hash,expires_at:new Date(Date.now()+30*24*60*60*1000).toISOString()},{onConflict:"token_hash"}).select("id").single();
  if(sessionError||!session)return Response.json({error:"Could not create your order session"},{status:500,headers:corsHeaders});
  const {data:order,error}=await db.rpc("create_guest_order",{p_customer:{name:typeof customer.name==="string"?customer.name.slice(0,120):"",phone:typeof customer.phone==="string"?customer.phone.slice(0,30):"",email:typeof customer.email==="string"?customer.email.slice(0,254):""},p_items:clean,p_notes:notes});
  if(error)return Response.json({error:error.message},{status:400,headers:corsHeaders});
  const {error:linkError}=await db.from("orders").update({customer_session_id:session.id}).eq("id",order.id);
  if(linkError)return Response.json({error:"Order was created but session linking failed. Keep your pickup token: "+order.pickup_token},{status:500,headers:corsHeaders});
  return Response.json({order,customer_session_id:session.id},{status:201,headers:corsHeaders});
 }catch{return Response.json({error:"Invalid request"},{status:400,headers:corsHeaders});}
});